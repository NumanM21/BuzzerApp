using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Teams;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Players;

/// <summary>Players of the caller's event (§8.4): the admin list, name edits, moving between teams and promoting to admin.</summary>
public sealed class PlayerService(AppDbContext db, ICurrentUser user, IGameNotifier notifier)
{
    public async Task<List<PlayerResponse>> ListAsync(CancellationToken ct)
    {
        var teamNames = await db.TeamNamesAsync(user.EventId, ct);
        var players = await db.Players.AsNoTracking()
            .Where(p => p.EventId == user.EventId)
            .ToListAsync(ct);

        return players
            .InNameOrder()
            .Select(p => ToResponse(p, p.TeamId is { } teamId ? teamNames.GetValueOrDefault(teamId) : null))
            .ToList();
    }

    public async Task<Result<PlayerResponse>> EditOwnNamesAsync(EditNamesRequest request, CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == user.PlayerId, ct);
        if (player is null)
        {
            // The cookie outlived the player; the next call to /api/session/me clears it.
            return Error.Unauthorized("Your session is no longer valid.");
        }

        return await EditNamesAsync(player, request, ct);
    }

    public async Task<Result<PlayerResponse>> EditNamesAsync(int id, EditNamesRequest request, CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        if (player is null)
        {
            return NotFound();
        }

        return await EditNamesAsync(player, request, ct);
    }

    // Shared by "edit myself" and "admin edits anyone": the rules are identical, only who may call differs.
    private async Task<Result<PlayerResponse>> EditNamesAsync(Player player, EditNamesRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .OptionalPersonName("displayName", request.DisplayName, "Display name")
            .OptionalPersonName("realName", request.RealName, "Real name");
        if (request.DisplayName is null && request.RealName is null)
        {
            errors.Error("displayName", "Provide a display name, a real name, or both.");
        }

        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        // Checked before anything is applied, so a clash on either name leaves both as they were.
        var clash = await PlayerNames.FindClashAsync(db, player.EventId, player.Id, request.RealName, request.DisplayName, ct);
        if (clash != NameClash.None)
        {
            return NameTaken(clash);
        }

        if (request.RealName is not null)
        {
            player.SetRealName(request.RealName);
        }

        if (request.DisplayName is not null)
        {
            player.SetDisplayName(request.DisplayName);
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out _))
        {
            return NameTaken(PlayerNames.FromFailedSave(ex));
        }

        await notifier.TeamsAndScoresChangedAsync();
        return ToResponse(player, await db.TeamNameAsync(player.TeamId, ct));
    }

    public async Task<Result<PlayerResponse>> MoveAsync(int id, MovePlayerRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors().Positive("teamId", request.TeamId, "A team");
        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        if (player is null)
        {
            return NotFound();
        }

        // Admins belong to no team, and the roster built at Begin takes every player with a team.
        if (player.Role != PlayerRole.Player)
        {
            return Error.BadRequest("Only players can be on a team.", "Admins don't belong to a team.");
        }

        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Id == request.TeamId && t.EventId == user.EventId)
            .Select(t => new { t.Id, t.Name })
            .SingleOrDefaultAsync(ct);
        if (team is null)
        {
            return UnknownTeam();
        }

        // Already there: the same answer as a move, but nothing changed, so nobody is told to refetch.
        if (player.TeamId == team.Id)
        {
            return ToResponse(player, team.Name);
        }

        player.TeamId = team.Id;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            // The team was deleted between the lookup and the save.
            return UnknownTeam();
        }

        await notifier.TeamsAndScoresChangedAsync();
        return ToResponse(player, team.Name);
    }

    public async Task<Result<PlayerResponse>> PromoteAsync(int id, CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        if (player is null)
        {
            return NotFound();
        }

        // Idempotent, so a double tap on the button isn't an error.
        if (player.Role == PlayerRole.Admin)
        {
            return ToResponse(player, teamName: null);
        }

        player.Role = PlayerRole.Admin;
        player.TeamId = null;
        await db.SaveChangesAsync(ct);

        // The promoted player's own cookie still says Player until /api/session/me re-issues it (B9).
        await notifier.TeamsAndScoresChangedAsync();
        return ToResponse(player, teamName: null);
    }

    private static PlayerResponse ToResponse(Player p, string? teamName) =>
        new(p.Id, p.RealName, p.DisplayName, p.Role, p.TeamId, teamName);

    private static Error NameTaken(NameClash clash) => Error.Conflict(
        "Name already taken.",
        clash == NameClash.DisplayName ? "Another player already has that display name." : "Another player already has that real name.");

    private static Error NotFound() => Error.NotFound("Player not found.");

    private static Error UnknownTeam() => Error.Invalid("teamId", "Choose one of the listed teams.");
}
