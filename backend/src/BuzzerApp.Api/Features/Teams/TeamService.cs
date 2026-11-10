using BuzzerApp.Api.Common;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Teams;

/// <summary>Teams of the caller's event (§8.3). Everything is scoped to the caller's event; another event's team looks like it doesn't exist.</summary>
public sealed class TeamService(AppDbContext db, ICurrentUser user, IGameNotifier notifier, TimeProvider time)
{
    private const string NameTaken = "A team with that name already exists.";
    private const string ColorTaken = "Another team already uses that colour.";
    private const string TeamInUse = "This team has players, scores or buzz history, so it can't be deleted.";

    public async Task<List<TeamResponse>> ListAsync(CancellationToken ct)
    {
        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == user.EventId)
            .InDisplayOrder()
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

        return teams.ConvertAll(t => new TeamResponse(
            t.Id, t.Name, t.ColorKey, t.IconKey, t.SortOrder,
            t.Members
                .InNameOrder(m => m.DisplayName, m => m.Id)
                .Select(m => new MemberResponse(m.Id, m.DisplayName, CanSeeRealName(m.Id) ? m.RealName : null))
                .ToList()));
    }

    public async Task<Result<TeamSummaryResponse>> CreateAsync(CreateTeamRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .TeamName("name", request.Name, "Team name")
            .Key("colorKey", request.ColorKey, "Colour")
            .Key("iconKey", request.IconKey, "Icon");
        if (errors.HasErrors)
        {
            return errors.ToError();
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
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out _))
        {
            // Two admins creating at once both pass the pre-checks; the unique indexes decide.
            return Conflict(ex.IsUniqueViolationOn(nameof(Team.ColorKey)) ? ColorTaken : NameTaken);
        }

        await notifier.TeamsAndScoresChangedAsync();
        return ToSummary(team);
    }

    public async Task<Result<TeamSummaryResponse>> RenameAsync(int id, RenameTeamRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors().TeamName("name", request.Name, "Team name");
        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        var team = await db.Teams.SingleOrDefaultAsync(t => t.Id == id && t.EventId == user.EventId, ct);
        if (team is null)
        {
            return NotFound();
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

        await notifier.TeamsAndScoresChangedAsync();
        return ToSummary(team);
    }

    public async Task<Result> DeleteAsync(int id, CancellationToken ct)
    {
        var team = await db.Teams.SingleOrDefaultAsync(t => t.Id == id && t.EventId == user.EventId, ct);
        if (team is null)
        {
            return NotFound();
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

        await notifier.TeamsAndScoresChangedAsync();
        return Result.Success;
    }

    // D19: real names are for admins, and for the player themselves.
    private bool CanSeeRealName(int playerId) => user.IsAdmin || playerId == user.PlayerId;

    private static TeamSummaryResponse ToSummary(Team t) => new(t.Id, t.Name, t.ColorKey, t.IconKey, t.SortOrder);

    private static Error Conflict(string detail) => Error.Conflict("Conflict.", detail);

    private static Error NotFound() => Error.NotFound("Team not found.");
}
