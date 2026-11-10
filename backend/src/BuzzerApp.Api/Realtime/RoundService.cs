using BuzzerApp.Core.Rounds;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Owns the one live round (D5, D14) and coordinates what happens around each change to it: the roster is captured at
/// Begin, finished rounds are queued for saving in the order the round produced them, and the new state is broadcast.
/// It holds the rules about order; the database and SignalR sit behind <see cref="IRosterSource"/> and
/// <see cref="IRoundBroadcaster"/>. Singleton.
/// </summary>
public sealed class RoundService : IRoundTicker
{
    private readonly BuzzRound _round;
    private readonly IRosterSource _roster;
    private readonly IRoundBroadcaster _broadcaster;
    private readonly IRoundRecordSink _persistence;
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
        IRosterSource roster,
        IRoundBroadcaster broadcaster,
        IRoundRecordSink persistence,
        ILogger<RoundService> logger)
    {
        _round = new BuzzRound(time, settings.Value);
        _roster = roster;
        _broadcaster = broadcaster;
        _persistence = persistence;
        _logger = logger;
    }

    public PublicRoundSnapshot GetPublicSnapshot() => _round.GetPublicSnapshot();

    public AdminRoundSnapshot GetAdminSnapshot() => _round.GetAdminSnapshot();

    /// <summary>Both snapshots of the same state, for anyone who sends the pair (a broadcast, an admin connecting).</summary>
    public (PublicRoundSnapshot Public, AdminRoundSnapshot Admin) GetSnapshots() => _round.GetSnapshots();

    /// <summary>
    /// Captures the roster now (D13): players of the event with a team. Two admins pressing Begin together is fine:
    /// the second gets <c>round.notIdle</c>.
    /// </summary>
    public async Task<RoundResult> BeginAsync(int eventId, CancellationToken ct = default)
    {
        var roster = await _roster.LoadAsync(eventId, ct);
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
            var (publicSnapshot, adminSnapshot) = _round.GetSnapshots();
            await _broadcaster.BroadcastAsync(publicSnapshot, adminSnapshot);
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
}
