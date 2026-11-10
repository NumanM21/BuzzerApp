using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BuzzerApp.Api.Tests.Realtime;

/// <summary>
/// RoundService's own rules (what is queued for saving and in what order, when a broadcast happens) with a fake roster
/// and a fake broadcaster: no host, no database, no SignalR. The engine's rules are Core's tests; the wiring to the hub,
/// the clock and PostgreSQL is RoundFlowTests.
/// </summary>
public class RoundServiceTests
{
    private const int EventId = 42;
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(2);

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 12, 5, 19, 0, 0, TimeSpan.Zero));
    private readonly FakeRoster _roster = new();
    private readonly RecordingBroadcaster _broadcaster = new();
    private readonly RoundPersistenceQueue _queue = new();
    private readonly RoundService _service;

    public RoundServiceTests()
    {
        _service = new RoundService(
            _time, Options.Create(new RoundSettings { GraceWindow = Grace }), _roster, _broadcaster, _queue, NullLogger<RoundService>.Instance);
    }

    private sealed class FakeRoster : IRosterSource
    {
        public List<RosterEntry> Entries { get; set; } = [];
        public List<int> RequestedEventIds { get; } = [];

        public Task<IReadOnlyList<RosterEntry>> LoadAsync(int eventId, CancellationToken ct)
        {
            RequestedEventIds.Add(eventId);
            return Task.FromResult<IReadOnlyList<RosterEntry>>(Entries.ToList());
        }
    }

    private sealed class RecordingBroadcaster : IRoundBroadcaster
    {
        private readonly List<(PublicRoundSnapshot Public, AdminRoundSnapshot Admin)> _sent = [];

        public bool Fail { get; set; }

        public IReadOnlyList<(PublicRoundSnapshot Public, AdminRoundSnapshot Admin)> Sent
        {
            get
            {
                lock (_sent)
                {
                    return _sent.ToArray();
                }
            }
        }

        public Task BroadcastAsync(PublicRoundSnapshot publicSnapshot, AdminRoundSnapshot adminSnapshot)
        {
            if (Fail)
            {
                throw new InvalidOperationException("the hub is unavailable");
            }

            lock (_sent)
            {
                _sent.Add((publicSnapshot, adminSnapshot));
            }

            return Task.CompletedTask;
        }
    }

    /// <summary>Player ids are team * 10 + n, so player 21 is the first player of team 2.</summary>
    private void UseRoster(int teams, int playersPerTeam = 2) =>
        _roster.Entries = Enumerable.Range(1, teams)
            .SelectMany(t => Enumerable.Range(1, playersPerTeam).Select(n => new RosterEntry(t * 10 + n, $"P{t}-{n}", t, $"Team {t}")))
            .ToList();

    private List<RoundPersistenceWork> Queued()
    {
        var work = new List<RoundPersistenceWork>();
        while (_queue.Reader.TryRead(out var item))
        {
            work.Add(item);
        }

        return work;
    }

    [Fact]
    public async Task Begin_loads_the_roster_of_the_given_event_and_broadcasts_the_open_round_to_both_audiences()
    {
        UseRoster(teams: 3);

        var result = await _service.BeginAsync(EventId);

        Assert.True(result.Success);
        Assert.Equal([EventId], _roster.RequestedEventIds);
        var (pub, admin) = Assert.Single(_broadcaster.Sent);
        Assert.Equal((RoundPhase.Open, RoundPhase.Open), (pub.Phase, admin.Phase));
        Assert.Equal(pub.Version, admin.Version);
        Assert.Empty(Queued());
    }

    [Fact]
    public async Task A_change_that_is_refused_broadcasts_and_queues_nothing()
    {
        // Nobody on a team: Begin fails. Then a buzz, a next-team and a reset on the idle round.
        Assert.Equal(RoundErrors.EmptyRoster, (await _service.BeginAsync(EventId)).Error);
        Assert.False((await _service.BuzzAsync(11)).Success);
        Assert.False((await _service.NextTeamAsync()).Success);
        Assert.False((await _service.ResetAsync()).Changed);
        await _service.TickAsync();

        Assert.Empty(_broadcaster.Sent);
        Assert.Empty(Queued());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(13)]
    public async Task When_every_team_has_buzzed_the_locked_round_is_queued_with_the_event_it_began_for(int teams)
    {
        UseRoster(teams);
        await _service.BeginAsync(EventId);

        for (var team = teams; team >= 1; team--)
        {
            Assert.True((await _service.BuzzAsync(team * 10 + 1)).Success);
        }

        var locked = Assert.IsType<LockedRoundWork>(Assert.Single(Queued()));
        Assert.Equal(EventId, locked.EventId);
        Assert.Equal(_service.GetPublicSnapshot().RoundId, locked.Record.RoundId);
        Assert.Equal(Enumerable.Range(1, teams).Reverse().Select(t => t * 10 + 1), locked.Record.Buzzes.Select(b => b.PlayerId));
        Assert.Equal(RoundPhase.Locked, _broadcaster.Sent[^1].Public.Phase);
        Assert.Equal(1 + teams, _broadcaster.Sent.Count);   // Begin, then one per buzz
    }

    [Fact]
    public async Task Reset_after_a_lock_queues_the_end_after_the_insert_with_each_teams_outcome()
    {
        UseRoster(teams: 3);
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(21);
        await _service.BuzzAsync(11);
        await _service.BuzzAsync(31);
        await _service.NextTeamAsync();   // team 2 passes, team 1 is answering, team 3 never gets a turn
        var roundId = _service.GetPublicSnapshot().RoundId;

        await _service.ResetAsync();

        var work = Queued();
        Assert.Equal([typeof(LockedRoundWork), typeof(EndedRoundWork)], work.Select(w => w.GetType()));
        var ended = (EndedRoundWork)work[1];
        Assert.Equal(roundId, ended.Record.RoundId);
        Assert.Equal(
            [(2, TeamOutcome.Passed), (1, TeamOutcome.Current), (3, TeamOutcome.Unreached)],
            ended.Record.TeamOutcomes.Select(o => (o.TeamId, o.Outcome)));
        Assert.Equal(RoundPhase.Idle, _broadcaster.Sent[^1].Public.Phase);
    }

    [Fact]
    public async Task A_round_reset_before_it_locked_queues_nothing()
    {
        UseRoster(teams: 2);
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(11);

        await _service.ResetAsync();

        Assert.Empty(Queued());
    }

    [Fact]
    public async Task A_tick_locks_the_round_once_the_grace_window_has_passed_and_not_a_moment_before()
    {
        UseRoster(teams: 3);
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(11);
        var sentBefore = _broadcaster.Sent.Count;

        _time.Advance(Grace - TimeSpan.FromMilliseconds(1));
        await _service.TickAsync();
        Assert.Equal(sentBefore, _broadcaster.Sent.Count);
        Assert.Empty(Queued());

        _time.Advance(TimeSpan.FromMilliseconds(1));
        await _service.TickAsync();

        Assert.IsType<LockedRoundWork>(Assert.Single(Queued()));
        Assert.Equal(RoundPhase.Locked, _broadcaster.Sent[^1].Public.Phase);
        Assert.Equal(sentBefore + 1, _broadcaster.Sent.Count);

        // Later ticks have nothing to do.
        await _service.TickAsync();
        Assert.Equal(sentBefore + 1, _broadcaster.Sent.Count);
    }

    [Fact]
    public async Task A_buzz_after_the_window_fails_but_still_locks_saves_and_broadcasts()
    {
        // No tick has run yet. The buzz is refused, yet it changed the round (it locked), so everything that follows a
        // change must still happen: the trigger is Changed, not Success.
        UseRoster(teams: 3);
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(11);
        _time.Advance(Grace);

        var late = await _service.BuzzAsync(21);

        Assert.Equal((false, RoundErrors.WindowClosed, true), (late.Success, late.Error, late.Changed));
        Assert.IsType<LockedRoundWork>(Assert.Single(Queued()));
        Assert.Equal(RoundPhase.Locked, _broadcaster.Sent[^1].Public.Phase);
    }

    [Fact]
    public async Task The_admin_snapshot_carries_individual_buzzes_and_the_public_one_only_the_team_queue()
    {
        UseRoster(teams: 2);
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(11);
        await _service.BuzzAsync(12);   // a teammate: recorded for the admin, not queued

        var (pub, admin) = _broadcaster.Sent[^1];

        Assert.Equal([11, 12], admin.Buzzes.Select(b => b.PlayerId));
        Assert.Equal([1], pub.TeamQueue.Select(q => q.TeamId));
        Assert.Equal(pub.TeamQueue, admin.TeamQueue);
    }

    [Fact]
    public async Task A_failed_broadcast_does_not_fail_the_change_or_lose_the_record()
    {
        UseRoster(teams: 1);
        await _service.BeginAsync(EventId);
        _broadcaster.Fail = true;

        var result = await _service.BuzzAsync(11);   // one team: this locks the round

        Assert.True(result.Success);
        Assert.Equal(RoundPhase.Locked, _service.GetPublicSnapshot().Phase);
        Assert.IsType<LockedRoundWork>(Assert.Single(Queued()));

        // And the next change is broadcast again once the hub is back.
        _broadcaster.Fail = false;
        await _service.ResetAsync();
        Assert.Equal(RoundPhase.Idle, _broadcaster.Sent[^1].Public.Phase);
    }

    /// <summary>Stops inside the call that queues a locked round until the test lets it go on.</summary>
    private sealed class PausingSink : IRoundRecordSink
    {
        private readonly List<RoundPersistenceWork> _work = [];

        public ManualResetEventSlim InsideLockedEnqueue { get; } = new();
        public ManualResetEventSlim Continue { get; } = new();
        public ManualResetEventSlim EndedEnqueued { get; } = new();

        public IReadOnlyList<RoundPersistenceWork> Work
        {
            get
            {
                lock (_work)
                {
                    return _work.ToArray();
                }
            }
        }

        public void Enqueue(RoundPersistenceWork work)
        {
            if (work is LockedRoundWork)
            {
                InsideLockedEnqueue.Set();
                Continue.Wait(TimeSpan.FromSeconds(10));
            }

            lock (_work)
            {
                _work.Add(work);
            }

            if (work is EndedRoundWork)
            {
                EndedEnqueued.Set();
            }
        }
    }

    [Fact]
    public async Task A_reset_cannot_queue_the_rounds_end_while_its_insert_is_still_being_queued()
    {
        // The interleaving _changeGate exists for, forced: one thread locks the round and is stopped half-way through
        // queueing the insert, then another resets the round. If changing the round and queueing its records were not
        // one step, the reset would queue the "ended" record first and the worker would update a row that isn't there
        // yet. The racing test below can't hit this window by chance (it survived that mutation); this one always does.
        var sink = new PausingSink();
        var service = new RoundService(
            _time, Options.Create(new RoundSettings { GraceWindow = Grace }), _roster, _broadcaster, sink, NullLogger<RoundService>.Instance);
        UseRoster(teams: 1);
        await service.BeginAsync(EventId);

        // Real threads, not tasks: the test needs to see that the second one is parked on the gate.
        var locking = new Thread(() => service.BuzzAsync(11).GetAwaiter().GetResult());   // one team: this buzz locks the round
        locking.Start();
        Assert.True(sink.InsideLockedEnqueue.Wait(TimeSpan.FromSeconds(10)));

        var resetting = new Thread(() => service.ResetAsync().GetAwaiter().GetResult());
        resetting.Start();

        // Wait until the reset has either got through (the bug) or is parked waiting for the gate (correct). No fixed
        // sleep: the loop ends on whichever happens, and the deadline only bounds a broken test.
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!sink.EndedEnqueued.IsSet && (resetting.ThreadState & ThreadState.WaitSleepJoin) == 0 && DateTime.UtcNow < deadline)
        {
            Thread.Yield();
        }

        var endedJumpedTheQueue = sink.EndedEnqueued.IsSet;
        sink.Continue.Set();
        Assert.True(locking.Join(TimeSpan.FromSeconds(10)));
        Assert.True(resetting.Join(TimeSpan.FromSeconds(10)));

        Assert.False(endedJumpedTheQueue);
        Assert.Equal([typeof(LockedRoundWork), typeof(EndedRoundWork)], sink.Work.Select(w => w.GetType()));
    }

    [Theory]
    [InlineData(2, 10)]
    [InlineData(6, 7)]
    [InlineData(13, 3)]
    public async Task Racing_buzzes_ticks_and_resets_never_queue_an_end_before_its_insert_or_send_versions_out_of_order(int teams, int playersPerTeam)
    {
        UseRoster(teams, playersPerTeam);
        var players = _roster.Entries.Select(e => e.PlayerId).ToList();

        for (var i = 0; i < 40; i++)
        {
            await _service.BeginAsync(EventId);
            var buzzing = players.Select(p => Task.Run(() => _service.BuzzAsync(p)));
            var ticking = Task.Run(async () =>
            {
                _time.Advance(Grace);
                await _service.TickAsync();
            });
            var resetting = Task.Run(() => _service.ResetAsync());
            await Task.WhenAll(buzzing.Cast<Task>().Append(ticking).Append(resetting));
            await _service.ResetAsync();
        }

        // In a race the reset can win before anything locks, so one round is locked for certain at the end.
        await _service.BeginAsync(EventId);
        await _service.BuzzAsync(players[0]);
        _time.Advance(Grace);
        await _service.TickAsync();
        await _service.ResetAsync();

        // Every round that locked was reset afterwards, so the queue must read insert, end, insert, end, ... with
        // matching round ids. An end queued before its insert would make the worker update a row that isn't there yet.
        var work = Queued();
        Assert.NotEmpty(work);
        Assert.Equal(0, work.Count % 2);
        for (var i = 0; i < work.Count; i += 2)
        {
            var locked = Assert.IsType<LockedRoundWork>(work[i]);
            var ended = Assert.IsType<EndedRoundWork>(work[i + 1]);
            Assert.Equal(locked.Record.RoundId, ended.Record.RoundId);
        }

        // Broadcasts are serialised and snapshot inside the gate, so no client is ever sent an older state after a newer one.
        var versions = _broadcaster.Sent.Select(s => s.Public.Version).ToList();
        Assert.Equal(versions.Order(), versions);
        Assert.All(_broadcaster.Sent, s => Assert.Equal(s.Public.Version, s.Admin.Version));
    }
}
