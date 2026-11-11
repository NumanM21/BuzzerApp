using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Players;
using BuzzerApp.Api.Features.Teams;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Session;

/// <summary>Who a session belongs to: the entity (for the cookie's claims) and what the client is told about it.</summary>
public sealed record SessionPlayer(Player Player, MeResponse Me);

/// <summary>
/// Decides who may have a session (§8.2): registration, sign-in and "is this session still good". It answers with the
/// player; issuing and clearing the cookie is the endpoint's job, because that is the only HTTP-specific part.
/// </summary>
public sealed class SessionService(
    AppDbContext db,
    IPinHasher pinHasher,
    PinDecoy decoy,
    SignInThrottle throttle,
    IGameNotifier notifier,
    TimeProvider time)
{
    // One message for "no such player" and "wrong PIN" (and a wrong join code), so the response can't be used to find real names.
    private const string BadCredentials = "Real name or PIN is incorrect.";
    private const string RealNameTaken = "A player with that real name is already registered. Sign in instead.";
    private const string DisplayNameTaken = "That display name is already taken. Pick a different one.";

    public async Task<Result<SessionPlayer>> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .Required("joinCode", request.JoinCode, "The join code")
            .PersonName("realName", request.RealName, "Real name")
            .PersonName("displayName", request.DisplayName, "Display name")
            .Pin("pin", request.Pin)
            .Positive("teamId", request.TeamId, "A team");
        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, request.JoinCode, ct);
        if (eventId is null)
        {
            return Error.NotFound("That join code is not recognised.");
        }

        // Scoped to the event: a team id from another event (or a made-up one) is just "not a valid team".
        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Id == request.TeamId && t.EventId == eventId)
            .Select(t => new { t.Id, t.Name })
            .SingleOrDefaultAsync(ct);
        if (team is null)
        {
            return Error.Invalid("teamId", "Choose one of the listed teams.");
        }

        var clash = await PlayerNames.FindClashAsync(db, eventId.Value, exceptPlayerId: null, request.RealName, request.DisplayName, ct);
        if (clash != NameClash.None)
        {
            return NameTaken(clash);
        }

        var player = new Player(eventId.Value, request.RealName!, request.DisplayName!, PlayerRole.Player, team.Id, time.GetUtcNow());
        player.PinHash = pinHasher.Hash(player, request.Pin!);
        db.Players.Add(player);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out _))
        {
            // Two phones registering the same name at once both pass the check above; the unique index decides.
            return NameTaken(PlayerNames.FromFailedSave(ex));
        }

        // For everyone already in: the newcomer is a new name on their Teams screen and in the hosts' lists. Without
        // it nobody sees who joined until something else changes. (The newcomer's own phone isn't connected yet.)
        await notifier.TeamsAndScoresChangedAsync();
        return new SessionPlayer(player, ToMe(player, team.Name));
    }

    public async Task<Result<SessionPlayer>> SignInAsync(SignInRequest request, CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .Required("joinCode", request.JoinCode, "The join code")
            .PersonName("realName", request.RealName, "Real name")
            .Pin("pin", request.Pin);
        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        // Counted before anything is looked up, for unknown names too, so the limit can't reveal which names exist.
        var normalizedReal = NameNormalizer.Normalize(request.RealName!);
        if (!throttle.TryAcquire(normalizedReal, out var retryAfter))
        {
            return Error.TooManyRequests("Too many sign-in attempts.", "Wait a few minutes before trying again.", retryAfter);
        }

        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, request.JoinCode, ct);
        var player = eventId is null
            ? null
            : await db.Players.SingleOrDefaultAsync(p => p.EventId == eventId && p.NormalizedRealName == normalizedReal, ct);

        if (player is null)
        {
            // Pay for a hash anyway, so "no such player" takes as long as "wrong PIN".
            decoy.SpendVerifyCost(request.Pin!);
            return Error.Unauthorized(BadCredentials);
        }

        var verdict = pinHasher.Verify(player, player.PinHash, request.Pin!);
        if (verdict == PinVerifyResult.Failed)
        {
            return Error.Unauthorized(BadCredentials);
        }

        if (verdict == PinVerifyResult.SuccessRehashNeeded)
        {
            player.PinHash = pinHasher.Hash(player, request.Pin!);
            await db.SaveChangesAsync(ct);
        }

        return await ToSessionAsync(player, ct);
    }

    /// <summary>
    /// The player behind a cookie, read from the database (the cookie has no team or names, and a rename or move must
    /// show at once), or Unauthorized when the cookie has outlived what it stands for: the player was removed, or its
    /// event is no longer the active one (an earlier session, a rehearsal). A cookie lasts 30 days and only sign-in
    /// checks the join code, so this is where a stale session ends.
    /// </summary>
    public async Task<Result<SessionPlayer>> FindCurrentAsync(int playerId, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().SingleOrDefaultAsync(p => p.Id == playerId, ct);
        if (player is null || !await db.Events.AnyAsync(e => e.Id == player.EventId && e.IsActive, ct))
        {
            return Error.Unauthorized("Your session is no longer valid.");
        }

        return await ToSessionAsync(player, ct);
    }

    private async Task<SessionPlayer> ToSessionAsync(Player player, CancellationToken ct) =>
        new(player, ToMe(player, await db.TeamNameAsync(player.TeamId, ct)));

    private static MeResponse ToMe(Player player, string? teamName) =>
        new(player.Id, player.RealName, player.DisplayName, player.Role, player.TeamId, teamName);

    private static Error NameTaken(NameClash clash) =>
        Error.Conflict("Name already taken.", clash == NameClash.DisplayName ? DisplayNameTaken : RealNameTaken);
}
