using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Teams;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Scoring;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Scores;

/// <summary>
/// The score ledger of the caller's event (§8.5): leaderboards read from it, adjustments add rows, and an undo adds a
/// reversing row. Rows are never changed or deleted (D25, D26).
/// </summary>
public sealed class ScoreService(AppDbContext db, ICurrentUser user, IGameNotifier notifier, TimeProvider time)
{
    private const int DefaultTake = 20;
    private const int MaxTake = 100;
    private const string TotalOutOfRange = "That would take the total beyond the largest score the app can store.";

    public async Task<List<TeamScoreResponse>> TeamScoresAsync(CancellationToken ct)
    {
        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == user.EventId)
            .InDisplayOrder()
            .ToListAsync(ct);

        // A team with no ledger rows is absent from the totals and counts as zero: it still gets a row.
        var totals = await ScoreTotals.ByTeamAsync(db, user.EventId, ct);

        // Ranking keeps input order for ties, so tied teams stay in display order.
        return Ranking.Rank(teams, t => totals.GetValueOrDefault(t.Id))
            .Select(r => new TeamScoreResponse(
                r.Item.Id, r.Item.Name, r.Item.ColorKey, r.Item.IconKey, totals.GetValueOrDefault(r.Item.Id), r.Rank))
            .ToList();
    }

    public async Task<List<PlayerScoreResponse>> PlayerScoresAsync(CancellationToken ct)
    {
        // Admins are excluded even if they scored as players before being promoted: they're not on the leaderboard.
        var players = await db.Players.AsNoTracking()
            .Where(p => p.EventId == user.EventId && p.Role == PlayerRole.Player)
            .ToListAsync(ct);
        var teamNames = await db.TeamNamesAsync(user.EventId, ct);
        var totals = await ScoreTotals.ByPlayerAsync(db, user.EventId, ct);

        // Highest total first; ties stay in name order because Ranking keeps input order (the rank itself isn't part
        // of this response: the frontend sorts players by team or by score).
        return Ranking.Rank(players.InNameOrder().ToList(), p => totals.GetValueOrDefault(p.Id))
            .Select(r => r.Item)
            .Select(p => new PlayerScoreResponse(
                p.Id,
                p.DisplayName,
                p.RealName,
                p.TeamId,
                p.TeamId is { } teamId ? teamNames.GetValueOrDefault(teamId) : null,
                totals.GetValueOrDefault(p.Id)))
            .ToList();
    }

    public async Task<List<AdjustmentResponse>> RecentAdjustmentsAsync(int? take, CancellationToken ct)
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

        return rows.ConvertAll(a => ToResponse(
            a,
            a.TeamId is { } teamId ? teamNames.GetValueOrDefault(teamId, "") : playerNames.GetValueOrDefault(a.PlayerId!.Value, ""),
            playerNames.GetValueOrDefault(a.CreatedByPlayerId, ""),
            reversed.Contains(a.Id)));
    }

    public async Task<Result<AdjustmentResponse>> AdjustAsync(AdjustmentRequest request, CancellationToken ct)
    {
        var validated = AdjustmentRules.Validate(request);
        if (!validated.IsSuccess)
        {
            return validated.Error!;
        }

        var draft = validated.Value;

        // The caller's own event, and for players only role Player: an admin never appears on a leaderboard.
        var targetName = draft.Target == ScoreTarget.Team
            ? await db.Teams.Where(t => t.Id == draft.TargetId && t.EventId == user.EventId).Select(t => t.Name).FirstOrDefaultAsync(ct)
            : await db.Players.Where(p => p.Id == draft.TargetId && p.EventId == user.EventId && p.Role == PlayerRole.Player).Select(p => p.DisplayName).FirstOrDefaultAsync(ct);
        if (targetName is null)
        {
            return Error.Invalid("targetId", draft.Target == ScoreTarget.Team
                ? "That team doesn't exist in this event."
                : "That player doesn't exist in this event, or is an admin.");
        }

        if (!AdjustmentRules.FitsInTotal(await CurrentTotalAsync(draft.Target, draft.TargetId, ct), draft.SignedAmount))
        {
            return Error.Invalid("amount", TotalOutOfRange);
        }

        var adjustment = new ScoreAdjustment
        {
            EventId = user.EventId,
            TeamId = draft.Target == ScoreTarget.Team ? draft.TargetId : null,
            PlayerId = draft.Target == ScoreTarget.Player ? draft.TargetId : null,
            Amount = draft.SignedAmount,
            Reason = draft.Reason,
            CreatedAt = time.GetUtcNow(),
            CreatedByPlayerId = user.PlayerId,
        };
        db.ScoreAdjustments.Add(adjustment);
        await db.SaveChangesAsync(ct);

        await notifier.ScoresChangedAsync();
        return ToResponse(adjustment, targetName, await DisplayNameAsync(user.PlayerId, ct), isReversed: false);
    }

    public async Task<Result<AdjustmentResponse>> ReverseAsync(long id, CancellationToken ct)
    {
        var original = await db.ScoreAdjustments.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id && a.EventId == user.EventId, ct);
        if (original is null)
        {
            return Error.NotFound("Adjustment not found.");
        }

        // Undoing an undo would just be a new adjustment; refusing keeps the ledger's cause-and-effect chain one step deep.
        if (original.ReversesAdjustmentId is not null)
        {
            return Error.BadRequest("That row is already an undo.", "An undo can't be undone. Add a new adjustment instead.");
        }

        if (await db.ScoreAdjustments.AnyAsync(a => a.ReversesAdjustmentId == id, ct))
        {
            return AlreadyReversed();
        }

        var target = original.TeamId is not null ? ScoreTarget.Team : ScoreTarget.Player;
        var targetId = (original.TeamId ?? original.PlayerId)!.Value;

        // Amount is never int.MinValue (ScoreMath only produces ±(1..int.MaxValue)), so the negation is safe, but the
        // other rows on the target can still make the new total fall outside int.
        var delta = -(long)original.Amount;
        if (!AdjustmentRules.FitsInTotal(await CurrentTotalAsync(target, targetId, ct), delta))
        {
            return Error.Conflict("Conflict.", TotalOutOfRange);
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

        // A promoted player's old rows can still be undone, so the name is read whatever the role is now.
        var targetName = target == ScoreTarget.Team
            ? await db.Teams.Where(t => t.Id == targetId).Select(t => t.Name).SingleAsync(ct)
            : await DisplayNameAsync(targetId, ct);

        await notifier.ScoresChangedAsync();
        return ToResponse(reversal, targetName, await DisplayNameAsync(user.PlayerId, ct), isReversed: false);
    }

    private Task<long> CurrentTotalAsync(ScoreTarget target, int targetId, CancellationToken ct) =>
        target == ScoreTarget.Team
            ? db.ScoreAdjustments.Where(a => a.EventId == user.EventId && a.TeamId == targetId).SumAsync(a => (long)a.Amount, ct)
            : db.ScoreAdjustments.Where(a => a.EventId == user.EventId && a.PlayerId == targetId).SumAsync(a => (long)a.Amount, ct);

    private Task<string> DisplayNameAsync(int playerId, CancellationToken ct) =>
        db.Players.Where(p => p.Id == playerId).Select(p => p.DisplayName).SingleAsync(ct);

    private static Error AlreadyReversed() => Error.Conflict("Conflict.", "That adjustment has already been undone.");

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
