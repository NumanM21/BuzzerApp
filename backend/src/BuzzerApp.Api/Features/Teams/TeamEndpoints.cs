using BuzzerApp.Api.Common;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Teams;

public static class TeamEndpoints
{
    /// <summary><c>RealName</c> is JSON null unless the caller is an admin or this is their own row (D19).</summary>
    public sealed record MemberResponse(int PlayerId, string DisplayName, string? RealName);

    public sealed record TeamResponse(int Id, string Name, string ColorKey, string IconKey, int SortOrder, IReadOnlyList<MemberResponse> Members);

    public sealed record TeamSummaryResponse(int Id, string Name, string ColorKey, string IconKey, int SortOrder);

    public sealed record CreateTeamRequest(string? Name, string? ColorKey, string? IconKey);

    public sealed record RenameTeamRequest(string? Name);

    public static IEndpointRouteBuilder MapTeamEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/teams");

        // Any signed-in user (the fallback policy); the admin routes below opt in to the stricter policy.
        group.MapGet("/", GetTeamsAsync);

        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);
        admin.MapPost("/", CreateTeamAsync);
        admin.MapPatch("/{id:int}", RenameTeamAsync);
        admin.MapDelete("/{id:int}", DeleteTeamAsync);
        return app;
    }

    private static async Task<IResult> GetTeamsAsync(ICurrentUser user, AppDbContext db, CancellationToken ct)
    {
        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == user.EventId)
            .OrderBy(t => t.SortOrder)
            .ThenBy(t => t.Id)   // SortOrder isn't unique; the tiebreaker keeps the order stable between requests
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.ColorKey,
                t.IconKey,
                t.SortOrder,
                Members = t.Players.Select(p => new { p.Id, p.DisplayName, p.RealName }).ToList(),
            })
            .ToListAsync(ct);

        // Sorted here, with an explicit comparer and an Id tiebreaker, so the order is the same on every database and every request.
        var response = teams.Select(t => new TeamResponse(
            t.Id, t.Name, t.ColorKey, t.IconKey, t.SortOrder,
            t.Members
                .OrderBy(m => m.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(m => m.Id)
                .Select(m => new MemberResponse(
                    m.Id,
                    m.DisplayName,
                    user.IsAdmin || m.Id == user.PlayerId ? m.RealName : null))
                .ToList()));

        return Results.Ok(response);
    }

    private static async Task<IResult> CreateTeamAsync(
        CreateTeamRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        TimeProvider time,
        CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .TeamName("name", request.Name, "Team name")
            .Key("colorKey", request.ColorKey, "Colour")
            .Key("iconKey", request.IconKey, "Icon");
        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var name = request.Name!;
        var normalizedName = NameNormalizer.Normalize(name);
        var colorKey = request.ColorKey!.Trim();

        if (await db.Teams.AnyAsync(t => t.EventId == user.EventId && t.NormalizedName == normalizedName, ct))
        {
            return Conflict(NameTaken);
        }

        if (await db.Teams.AnyAsync(t => t.EventId == user.EventId && t.ColorKey == colorKey, ct))
        {
            return Conflict(ColorTaken);
        }

        // New teams go last. Nullable max so an event with no teams starts at 0.
        var sortOrder = (await db.Teams.Where(t => t.EventId == user.EventId).MaxAsync(t => (int?)t.SortOrder, ct) ?? -1) + 1;
        var team = new Team(user.EventId, name, colorKey, request.IconKey!.Trim(), sortOrder, time.GetUtcNow());
        db.Teams.Add(team);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out var constraint))
        {
            // Two admins creating at once both pass the pre-checks; the unique indexes decide.
            return Conflict(constraint is not null && constraint.Contains("ColorKey", StringComparison.Ordinal) ? ColorTaken : NameTaken);
        }

        await NotifyAsync(notifier);
        return Results.Created("/api/teams", ToSummary(team));
    }

    private static async Task<IResult> RenameTeamAsync(
        int id,
        RenameTeamRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var errors = new ValidationErrors().TeamName("name", request.Name, "Team name");
        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var team = await db.Teams.SingleOrDefaultAsync(t => t.Id == id && t.EventId == user.EventId, ct);
        if (team is null)
        {
            return TeamNotFound();
        }

        // Excluding the team itself lets an admin fix the capitalisation of its own name.
        var normalizedName = NameNormalizer.Normalize(request.Name!);
        if (await db.Teams.AnyAsync(t => t.EventId == user.EventId && t.Id != id && t.NormalizedName == normalizedName, ct))
        {
            return Conflict(NameTaken);
        }

        team.Rename(request.Name!);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out _))
        {
            return Conflict(NameTaken);
        }

        await NotifyAsync(notifier);
        return Results.Ok(ToSummary(team));
    }

    private static async Task<IResult> DeleteTeamAsync(
        int id,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var team = await db.Teams.SingleOrDefaultAsync(t => t.Id == id && t.EventId == user.EventId, ct);
        if (team is null)
        {
            return TeamNotFound();
        }

        // Every table that references a team with Restrict; checking up front gives a readable reason instead of an FK error.
        // Buzz records are history from past rounds, so a team that ever buzzed can never be deleted.
        if (await db.Players.AnyAsync(p => p.TeamId == id, ct)
            || await db.ScoreAdjustments.AnyAsync(a => a.TeamId == id, ct)
            || await db.BuzzRecords.AnyAsync(b => b.TeamId == id, ct))
        {
            return Conflict(TeamInUse);
        }

        db.Teams.Remove(team);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            // A player registered into the team between the check and the delete.
            return Conflict(TeamInUse);
        }

        await NotifyAsync(notifier);
        return Results.NoContent();
    }

    // Both: the team list changes the Teams screen, and every team (even at zero) is a leaderboard row.
    private static async Task NotifyAsync(IGameNotifier notifier)
    {
        await notifier.TeamsChangedAsync();
        await notifier.ScoresChangedAsync();
    }

    private static TeamSummaryResponse ToSummary(Team t) => new(t.Id, t.Name, t.ColorKey, t.IconKey, t.SortOrder);

    private const string NameTaken = "A team with that name already exists.";
    private const string ColorTaken = "Another team already uses that colour.";
    private const string TeamInUse = "This team has players, scores or buzz history, so it can't be deleted.";

    private static IResult Conflict(string detail) =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Conflict.", detail: detail);

    private static IResult TeamNotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Team not found.");
}
