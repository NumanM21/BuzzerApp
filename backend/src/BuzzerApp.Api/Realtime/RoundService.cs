using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Owns the one live round (D5, D14) and connects it to the outside: loads the roster, queues finished rounds for
/// saving, and broadcasts snapshots. Singleton, so it never holds a DbContext; it opens a scope when it needs one.
/// </summary>
public sealed class RoundService : IRoundTicker
{
    private readonly BuzzRound _round;
    private readonly IServiceScopeFactory _scopes;
    private readonly IHubContext<GameHub, IGameClient> _hub;
    private readonly RoundPersistenceQueue _persistence;
    private readonly ILogger<RoundService> _logger;

    // Makes "change the round + take its records + queue them" one step. BuzzRound hands each record out once, but if
    // taking and queueing were separate from the change, one thread could find no locked record, another could then lock
    // and reset the round, and the first would queue the "ended" record before the round's insert. Holding this around
    // the change itself means records are queued in exactly the order the round produced them.
    private readonly Lock _changeGate = new();

    // Serialises broadcasts. Snapshots are taken inside it, so each send carries the newest state and sends go out in
    // Version order; clients still drop anything older than what they hold, as a backstop.
    private readonly SemaphoreSlim _broadcastGate = new(1, 1);

    // Core's records don't carry the event; remembered at Begin (under _changeGate) for the locked insert.
    private int _roundEventId;

    public RoundService(
        TimeProvider time,
        IOptions<RoundSettings> settings,
        IServiceScopeFactory scopes,
        IHubContext<GameHub, IGameClient> hub,
        RoundPersistenceQueue persistence,
        ILogger<RoundService> logger)
    {
        _round = new BuzzRound(time, settings.Value);
        _scopes = scopes;
        _hub = hub;
        _persistence = persistence;
        _logger = logger;
    }

    public PublicRoundSnapshot GetPublicSnapshot() => _round.GetPublicSnapshot();

    public AdminRoundSnapshot GetAdminSnapshot() => _round.GetAdminSnapshot();

    /// <summary>
    /// Captures the roster now (D13): players of the event with a team. Two admins pressing Begin together is fine:
    /// the second gets <c>round.notIdle</c>.
    /// </summary>
    public async Task<RoundResult> BeginAsync(int eventId, CancellationToken ct = default)
    {
        var roster = await LoadRosterAsync(eventId, ct);
        return await ApplyAsync(round =>
        {
            var result = round.Begin(roster);
            if (result.Success)
            {
                _roundEventId = eventId;
            }

            return result;
        });
    }

    /// <summary>The player id must come from the caller's cookie, never from the client (D8).</summary>
    public Task<RoundResult> BuzzAsync(int playerId) => ApplyAsync(round => round.Buzz(playerId));

    public Task<RoundResult> NextTeamAsync() => ApplyAsync(round => round.NextTeam());

    public Task<RoundResult> ResetAsync() => ApplyAsync(round => round.Reset());

    /// <summary>Locks the round once the grace window has passed, even if nobody presses anything. Called by <see cref="RoundClock"/>.</summary>
    public async Task TickAsync()
    {
        bool changed;
        lock (_changeGate)
        {
            changed = _round.Tick();
            if (changed)
            {
                QueueRecords();
            }
        }

        if (changed)
        {
            await BroadcastAsync();
        }
    }

    // Triggered by Changed, not Success: a buzz after the window fails but still locks the round.
    private async Task<RoundResult> ApplyAsync(Func<BuzzRound, RoundResult> change)
    {
        RoundResult result;
        lock (_changeGate)
        {
            result = change(_round);
            if (result.Changed)
            {
                QueueRecords();
            }
        }

        if (result.Changed)
        {
            await BroadcastAsync();
        }

        return result;
    }

    // Locked before ended, each drained fully: a round's insert must reach the worker before its end.
    private void QueueRecords()
    {
        while (_round.TakeLockedRecord() is { } locked)
        {
            _persistence.Enqueue(new LockedRoundWork(_roundEventId, locked));
        }

        while (_round.TakeEndedRecord() is { } ended)
        {
            _persistence.Enqueue(new EndedRoundWork(ended));
        }
    }

    private async Task BroadcastAsync()
    {
        await _broadcastGate.WaitAsync();
        try
        {
            var publicSnapshot = _round.GetPublicSnapshot();
            var adminSnapshot = _round.GetAdminSnapshot();
            await _hub.Clients.All.RoundUpdated(publicSnapshot);
            await _hub.Clients.Group(GameGroups.Admins).AdminRoundUpdated(adminSnapshot);
        }
        catch (Exception ex)
        {
            // The round has already changed; a failed send must not fail the buzz or the host's button. Clients catch
            // up from the next snapshot or when they reconnect.
            _logger.LogWarning(ex, "Could not broadcast the round snapshot");
        }
        finally
        {
            _broadcastGate.Release();
        }
    }

    private async Task<List<RosterEntry>> LoadRosterAsync(int eventId, CancellationToken ct)
    {
        await using var scope = _scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Display names only: the snapshots built from the roster go to every player (D19). Sorted so the same data
        // always gives the same roster.
        var rows = await db.Players.AsNoTracking()
            .Where(p => p.EventId == eventId && p.Role == PlayerRole.Player && p.TeamId != null)
            .Join(db.Teams.Where(t => t.EventId == eventId), p => p.TeamId, t => (int?)t.Id,
                (p, t) => new { PlayerId = p.Id, p.DisplayName, TeamId = t.Id, TeamName = t.Name })
            .OrderBy(r => r.TeamId)
            .ThenBy(r => r.PlayerId)
            .ToListAsync(ct);
        return rows.ConvertAll(r => new RosterEntry(r.PlayerId, r.DisplayName, r.TeamId, r.TeamName));
    }
}
