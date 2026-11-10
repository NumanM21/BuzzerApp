using BuzzerApp.Api.Common;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Scoring;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Scores;

public static class ScoreEndpoints
{
    public enum ScoreTarget
    {
        Team,
        Player,
    }

    // Every field is nullable so a missing one is reported as a validation error. A non-nullable enum would silently
    // become its first member, and a forgotten "direction" would then add points instead of failing.
    public sealed record AdjustmentRequest(
        ScoreTarget? Target, int? TargetId, int? Amount, int? Multiplier, ScoreDirection? Direction, string? Reason);

    public sealed record AdjustmentResponse(
        long Id,
        ScoreTarget Target,
        int TargetId,
        string TargetName,
        int Amount,
        string? Reason,
        long? ReversesAdjustmentId,
        bool IsReversed,
        DateTimeOffset CreatedAt,
        string CreatedByDisplayName);

    public sealed record TeamScoreResponse(int TeamId, string Name, string ColorKey, string IconKey, int Total, int Rank);

    public sealed record PlayerScoreResponse(int PlayerId, string DisplayName, string RealName, int? TeamId, string? TeamName, int Total);

    private const int DefaultTake = 20;
    private const int MaxTake = 100;

    public static IEndpointRouteBuilder MapScoreEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/scores");

        // Any signed-in user (the fallback policy): the team leaderboard is public to the whole event.
        group.MapGet("/teams", GetTeamScoresAsync);

        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);
        admin.MapGet("/players", GetPlayerScoresAsync);
        admin.MapGet("/adjustments", GetAdjustmentsAsync);
        admin.MapPost("/adjustments", CreateAdjustmentAsync);
        admin.MapPost("/adjustments/{id:long}/reverse", ReverseAdjustmentAsync);
        return app;
    }

    private static async Task<IResult> GetTeamScoresAsync(ICurrentUser user, AppDbContext db, CancellationToken ct)
    {
        // Ranking.Rank keeps input order for ties, so feeding it teams already in SortOrder, Id order
        // gives tied teams a stable, predictable position.
        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == user.EventId)
            .OrderBy(t => t.SortOrder)
            .ThenBy(t => t.Id)
            .ToListAsync(ct);

        var totals = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.EventId == user.EventId && a.TeamId != null)
            .GroupBy(a => a.TeamId)
            .Select(g => new { TeamId = g.Key, Total = g.Sum(a => (long)a.Amount) })
            .ToListAsync(ct);

        // A team with no ledger rows has no group, so it is absent here and counts as zero: it still gets a row.
        var totalByTeam = totals.ToDictionary(x => x.TeamId!.Value, x => ClampToInt(x.Total));

        var ranked = Ranking.Rank(teams, t => totalByTeam.GetValueOrDefault(t.Id));
        return Results.Ok(ranked.Select(r => new TeamScoreResponse(
            r.Item.Id, r.Item.Name, r.Item.ColorKey, r.Item.IconKey, totalByTeam.GetValueOrDefault(r.Item.Id), r.Rank)));
    }

    private static async Task<IResult> GetPlayerScoresAsync(ICurrentUser user, AppDbContext db, CancellationToken ct)
    {
        // Admins are excluded even if they scored as players before being promoted: they're not on the leaderboard.
        var players = await db.Players.AsNoTracking()
            .Where(p => p.EventId == user.EventId && p.Role == PlayerRole.Player)
            .ToListAsync(ct);

        var teamNames = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == user.EventId)
            .ToDictionaryAsync(t => t.Id, t => t.Name, ct);

        var totals = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.EventId == user.EventId && a.PlayerId != null)
            .GroupBy(a => a.PlayerId)
            .Select(g => new { PlayerId = g.Key, Total = g.Sum(a => (long)a.Amount) })
            .ToListAsync(ct);
        var totalByPlayer = totals.ToDictionary(x => x.PlayerId!.Value, x => ClampToInt(x.Total));

        // Sorted in memory with an explicit comparer so the order is the same on every database (shared rule).
        return Results.Ok(players
            .Select(p => (Player: p, Total: totalByPlayer.GetValueOrDefault(p.Id)))
            .OrderByDescending(x => x.Total)
            .ThenBy(x => x.Player.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.Player.Id)
            .Select(x => new PlayerScoreResponse(
                x.Player.Id,
                x.Player.DisplayName,
                x.Player.RealName,
                x.Player.TeamId,
                x.Player.TeamId is { } teamId ? teamNames.GetValueOrDefault(teamId) : null,
                x.Total)));
    }

    private static async Task<IResult> GetAdjustmentsAsync(int? take, ICurrentUser user, AppDbContext db, CancellationToken ct)
    {
        // Newest first. CreatedAt isn't unique (an add and its undo can land in the same tick), and Id is
        // what keeps `take` from cutting a tie differently between two requests.
        var rows = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.EventId == user.EventId)
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Take(Math.Clamp(take ?? DefaultTake, 1, MaxTake))
            .ToListAsync(ct);

        var teamIds = rows.Where(a => a.TeamId is not null).Select(a => a.TeamId!.Value).Distinct().ToList();
        var playerIds = rows.Where(a => a.PlayerId is not null).Select(a => a.PlayerId!.Value)
            .Concat(rows.Select(a => a.CreatedByPlayerId))
            .Distinct()
            .ToList();
        var rowIds = rows.Select(a => a.Id).ToList();

        var teamNames = await db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Name, ct);
        var playerNames = await db.Players.AsNoTracking().Where(p => playerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName, ct);

        // The reversal can be older or newer than the page, so it is looked up by the id it points at rather than found in `rows`.
        var reversed = (await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.ReversesAdjustmentId != null && rowIds.Contains(a.ReversesAdjustmentId.Value))
            .Select(a => a.ReversesAdjustmentId!.Value)
            .ToListAsync(ct)).ToHashSet();

        return Results.Ok(rows.Select(a => ToResponse(
            a,
            a.TeamId is { } teamId ? teamNames.GetValueOrDefault(teamId, "") : playerNames.GetValueOrDefault(a.PlayerId!.Value, ""),
            playerNames.GetValueOrDefault(a.CreatedByPlayerId, ""),
            reversed.Contains(a.Id))));
    }

    private static async Task<IResult> CreateAdjustmentAsync(
        AdjustmentRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        TimeProvider time,
        CancellationToken ct)
    {
        var errors = new ValidationErrors();
        if (request.Target is not (ScoreTarget.Team or ScoreTarget.Player))
        {
            errors.Error("target", "Target must be \"team\" or \"player\".");
        }

        errors.Positive("targetId", request.TargetId, "Target id");

        if (request.Amount is null)
        {
            errors.Error("amount", "Amount is required.");
        }

        if (request.Direction is null)
        {
            errors.Error("direction", "Direction must be \"add\" or \"remove\".");
        }

        // Stand-ins for a missing amount or direction (already reported above) let ScoreMath still check the other
        // fields, so one response lists every problem. Nothing is saved when there are errors, so the stand-ins never reach the ledger.
        var math = ScoreMath.SignedAmount(request.Amount ?? 1, request.Multiplier ?? ScoreMath.MinMultiplier, request.Direction ?? ScoreDirection.Add);
        if (!math.Success)
        {
            AddMathError(errors, math.Error);
        }
        var signed = math.Value;

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        if (reason is { Length: > MaxReasonLength })
        {
            errors.Error("reason", $"Reason must be at most {MaxReasonLength} characters.");
        }

        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var target = request.Target!.Value;
        var targetId = request.TargetId!.Value;

        // The caller's own event, and for players only role Player: an admin never appears on a leaderboard.
        var targetName = target == ScoreTarget.Team
            ? await db.Teams.Where(t => t.Id == targetId && t.EventId == user.EventId).Select(t => t.Name).FirstOrDefaultAsync(ct)
            : await db.Players.Where(p => p.Id == targetId && p.EventId == user.EventId && p.Role == PlayerRole.Player).Select(p => p.DisplayName).FirstOrDefaultAsync(ct);
        if (targetName is null)
        {
            return new ValidationErrors()
                .Error("targetId", target == ScoreTarget.Team ? "That team doesn't exist in this event." : "That player doesn't exist in this event, or is an admin.")
                .ToResult();
        }

        if (!await FitsInTotalAsync(db, user.EventId, target, targetId, signed, ct))
        {
            return new ValidationErrors().Error("amount", TotalOutOfRange).ToResult();
        }

        var adjustment = new ScoreAdjustment
        {
            EventId = user.EventId,
            TeamId = target == ScoreTarget.Team ? targetId : null,
            PlayerId = target == ScoreTarget.Player ? targetId : null,
            Amount = signed,
            Reason = reason,
            CreatedAt = time.GetUtcNow(),
            CreatedByPlayerId = user.PlayerId,
        };
        db.ScoreAdjustments.Add(adjustment);
        await db.SaveChangesAsync(ct);

        await notifier.ScoresChangedAsync();
        return Results.Created("/api/scores/adjustments", ToResponse(adjustment, targetName, await DisplayNameAsync(db, user.PlayerId, ct), isReversed: false));
    }

    private static async Task<IResult> ReverseAdjustmentAsync(
        long id,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        TimeProvider time,
        CancellationToken ct)
    {
        var original = await db.ScoreAdjustments.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id && a.EventId == user.EventId, ct);
        if (original is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Adjustment not found.");
        }

        // Undoing an undo would just be a new adjustment; refusing keeps the ledger's cause-and-effect chain one step deep.
        if (original.ReversesAdjustmentId is not null)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "That row is already an undo.", detail: "An undo can't be undone. Add a new adjustment instead.");
        }

        if (await db.ScoreAdjustments.AnyAsync(a => a.ReversesAdjustmentId == id, ct))
        {
            return AlreadyReversed();
        }

        var target = original.TeamId is not null ? ScoreTarget.Team : ScoreTarget.Player;
        var targetId = (original.TeamId ?? original.PlayerId)!.Value;
        var delta = -(long)original.Amount;

        // Amount is never int.MinValue (ScoreMath only produces ±(1..int.MaxValue)), so the negation is safe, but the
        // other rows on the target can still make the new total fall outside int.
        if (!await FitsInTotalAsync(db, user.EventId, target, targetId, delta, ct))
        {
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Conflict.", detail: TotalOutOfRange);
        }

        var reversal = new ScoreAdjustment
        {
            EventId = original.EventId,
            TeamId = original.TeamId,
            PlayerId = original.PlayerId,
            Amount = (int)delta,
            ReversesAdjustmentId = original.Id,
            CreatedAt = time.GetUtcNow(),
            CreatedByPlayerId = user.PlayerId,
        };
        db.ScoreAdjustments.Add(reversal);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out _))
        {
            // Two admins pressing Undo together both pass the pre-check; the unique index on ReversesAdjustmentId decides.
            return AlreadyReversed();
        }

        var targetName = target == ScoreTarget.Team
            ? await db.Teams.Where(t => t.Id == targetId).Select(t => t.Name).SingleAsync(ct)
            : await DisplayNameAsync(db, targetId, ct);

        await notifier.ScoresChangedAsync();
        return Results.Created("/api/scores/adjustments", ToResponse(reversal, targetName, await DisplayNameAsync(db, user.PlayerId, ct), isReversed: false));
    }

    private const int MaxReasonLength = 200;
    private const string TotalOutOfRange = "That would take the total beyond the largest score the app can store.";

    // Totals are summed as long and read as int, so a write that would leave the int range has to be refused up front:
    // once such a row exists every leaderboard that includes the target would break and the ledger can't be edited.
    private static async Task<bool> FitsInTotalAsync(AppDbContext db, int eventId, ScoreTarget target, int targetId, long delta, CancellationToken ct)
    {
        var current = target == ScoreTarget.Team
            ? await db.ScoreAdjustments.Where(a => a.EventId == eventId && a.TeamId == targetId).SumAsync(a => (long)a.Amount, ct)
            : await db.ScoreAdjustments.Where(a => a.EventId == eventId && a.PlayerId == targetId).SumAsync(a => (long)a.Amount, ct);
        return current + delta is >= int.MinValue and <= int.MaxValue;
    }

    private static void AddMathError(ValidationErrors errors, string? code)
    {
        switch (code)
        {
            case ScoreErrors.AmountNotPositive:
                errors.Error("amount", "Amount must be greater than 0.");
                break;
            case ScoreErrors.MultiplierOutOfRange:
                errors.Error("multiplier", $"Multiplier must be between {ScoreMath.MinMultiplier} and {ScoreMath.MaxMultiplier}.");
                break;
            case ScoreErrors.InvalidDirection:
                errors.Error("direction", "Direction must be \"add\" or \"remove\".");
                break;
            case ScoreErrors.Overflow:
                errors.Error("amount", "Amount multiplied by the multiplier is too large.");
                break;
            default:
                errors.Error("amount", "The amount is not valid.");
                break;
        }
    }

    private static Task<string> DisplayNameAsync(AppDbContext db, int playerId, CancellationToken ct) =>
        db.Players.Where(p => p.Id == playerId).Select(p => p.DisplayName).SingleAsync(ct);

    private static IResult AlreadyReversed() =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Conflict.", detail: "That adjustment has already been undone.");

    private static int ClampToInt(long value) => (int)Math.Clamp(value, int.MinValue, int.MaxValue);

    private static AdjustmentResponse ToResponse(ScoreAdjustment a, string targetName, string createdByDisplayName, bool isReversed) => new(
        a.Id,
        a.TeamId is not null ? ScoreTarget.Team : ScoreTarget.Player,
        (a.TeamId ?? a.PlayerId)!.Value,
        targetName,
        a.Amount,
        a.Reason,
        a.ReversesAdjustmentId,
        isReversed,
        a.CreatedAt,
        createdByDisplayName);
}
