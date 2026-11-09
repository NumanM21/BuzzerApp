using BuzzerApp.Core.Rounds;
using Microsoft.Extensions.Time.Testing;

namespace BuzzerApp.Core.Tests.Rounds;

public class BuzzRoundTests
{
    private const int RageQuitters = 1;
    private const int PayToWin = 2;
    private const int CheatCodes = 3;

    private const int Alice = 11; // Rage Quitters
    private const int Abe = 12;   // Rage Quitters
    private const int Bob = 21;   // Pay To Win
    private const int Cara = 31;  // Cheat Codes
    private const int NotInRoster = 99;

    private static readonly DateTimeOffset Start = new(2026, 12, 5, 19, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(2);

    private static readonly RosterEntry[] Roster =
    [
        new(Alice, "Alice", RageQuitters, "Rage Quitters"),
        new(Abe, "Abe", RageQuitters, "Rage Quitters"),
        new(Bob, "Bob", PayToWin, "Pay To Win"),
        new(Cara, "Cara", CheatCodes, "Cheat Codes"),
    ];

    private readonly FakeTimeProvider _time = new(Start);
    private readonly BuzzRound _round;

    public BuzzRoundTests()
    {
        _round = new BuzzRound(_time, new RoundSettings { GraceWindow = Grace });
    }

    private RoundPhase Phase => _round.GetPublicSnapshot().Phase;

    private long Version => _round.GetPublicSnapshot().Version;

    private void Begin() => Assert.True(_round.Begin(Roster).Success);

    private void BuzzOk(int playerId) => Assert.True(_round.Buzz(playerId).Success);

    /// <summary>Begin, queue Alice's then Bob's team, and let the window run out.</summary>
    private void LockWithTwoTeams()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Bob);
        _time.Advance(Grace);
        Assert.True(_round.Tick());
        Assert.Equal(RoundPhase.Locked, Phase);
    }

    private void Exhaust()
    {
        LockWithTwoTeams();
        Assert.True(_round.NextTeam().Success);
        Assert.True(_round.NextTeam().Success);
        Assert.Equal(RoundPhase.Exhausted, Phase);
    }

    private void MoveTo(RoundPhase phase)
    {
        switch (phase)
        {
            case RoundPhase.Idle:
                break;
            case RoundPhase.Open:
                Begin();
                break;
            case RoundPhase.Locked:
                LockWithTwoTeams();
                break;
            case RoundPhase.Exhausted:
                Exhaust();
                break;
        }

        Assert.Equal(phase, Phase);
    }

    // ---- Construction / Idle -------------------------------------------------------------

    [Fact]
    public void New_round_is_idle_with_an_empty_snapshot()
    {
        var snapshot = _round.GetAdminSnapshot();

        Assert.Equal(RoundPhase.Idle, snapshot.Phase);
        Assert.Equal(0, snapshot.Version);
        Assert.Null(snapshot.RoundId);
        Assert.Null(snapshot.RoundStartedAt);
        Assert.Empty(snapshot.TeamQueue);
        Assert.Null(snapshot.CurrentTeamId);
        Assert.Null(snapshot.WindowEndsAt);
        Assert.Empty(snapshot.Buzzes);
        Assert.Null(snapshot.CurrentSince);
        Assert.Equal(Start, snapshot.ServerNow);
    }

    [Fact]
    public void Invalid_settings_are_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new BuzzRound(_time, new RoundSettings { GraceWindow = TimeSpan.FromSeconds(-1) }));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new BuzzRound(_time, new RoundSettings { MaxRecordedBuzzes = -1 }));
    }

    // ---- Begin ---------------------------------------------------------------------------

    [Fact]
    public void Begin_from_idle_opens_the_round()
    {
        var result = _round.Begin(Roster);

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetPublicSnapshot();
        Assert.Equal(RoundPhase.Open, snapshot.Phase);
        Assert.Equal(Start, snapshot.RoundStartedAt);
        var roundId = Assert.NotNull(snapshot.RoundId);
        Assert.Equal(7, roundId.Version);
        Assert.Empty(snapshot.TeamQueue);
        Assert.Null(snapshot.WindowEndsAt);
    }

    [Fact]
    public void Each_round_gets_a_new_id()
    {
        Begin();
        var first = _round.GetPublicSnapshot().RoundId;
        _round.Reset();
        Begin();

        Assert.NotEqual(first, _round.GetPublicSnapshot().RoundId);
    }

    [Theory]
    [InlineData(RoundPhase.Open)]
    [InlineData(RoundPhase.Locked)]
    [InlineData(RoundPhase.Exhausted)]
    public void Begin_is_rejected_unless_idle(RoundPhase phase)
    {
        MoveTo(phase);
        var before = _round.GetAdminSnapshot();

        var result = _round.Begin(Roster);

        Assert.Equal(new RoundResult(false, RoundErrors.NotIdle, false), result);
        Assert.Equal(before.Version, Version);
        Assert.Equal(before.RoundId, _round.GetPublicSnapshot().RoundId);
    }

    [Fact]
    public void Begin_rejects_an_empty_roster()
    {
        var result = _round.Begin([]);

        Assert.Equal(new RoundResult(false, RoundErrors.EmptyRoster, false), result);
        Assert.Equal(RoundPhase.Idle, Phase);
    }

    [Fact]
    public void Begin_rejects_duplicate_player_ids()
    {
        RosterEntry[] roster = [.. Roster, new(Alice, "Alice again", PayToWin, "Pay To Win")];

        var result = _round.Begin(roster);

        Assert.Equal(new RoundResult(false, RoundErrors.DuplicatePlayer, false), result);
        Assert.Equal(RoundPhase.Idle, Phase);
    }

    [Fact]
    public void Roster_is_copied_at_begin()
    {
        var roster = Roster.ToList();
        _round.Begin(roster);
        roster.RemoveAll(r => r.PlayerId == Alice);

        Assert.True(_round.Buzz(Alice).Success);
    }

    // ---- Buzz ----------------------------------------------------------------------------

    [Theory]
    [InlineData(RoundPhase.Idle)]
    [InlineData(RoundPhase.Locked)]
    [InlineData(RoundPhase.Exhausted)]
    public void Buzz_is_rejected_unless_open(RoundPhase phase)
    {
        MoveTo(phase);
        var version = Version;

        var result = _round.Buzz(Cara);

        Assert.Equal(new RoundResult(false, RoundErrors.NotOpen, false), result);
        Assert.Equal(version, Version);
    }

    [Fact]
    public void Buzz_from_a_player_not_in_the_roster_is_rejected()
    {
        Begin();
        var version = Version;

        var result = _round.Buzz(NotInRoster);

        Assert.Equal(new RoundResult(false, RoundErrors.UnknownPlayer, false), result);
        Assert.Equal(version, Version);
        Assert.Empty(_round.GetAdminSnapshot().Buzzes);
    }

    [Fact]
    public void First_buzz_queues_the_team_and_starts_the_grace_window()
    {
        Begin();

        var result = _round.Buzz(Alice);

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetPublicSnapshot();
        Assert.Equal(RoundPhase.Open, snapshot.Phase);
        Assert.Equal(Start + Grace, snapshot.WindowEndsAt);
        var entry = Assert.Single(snapshot.TeamQueue);
        Assert.Equal(new TeamQueueEntry(1, RageQuitters, "Rage Quitters", "Alice", TeamTurnStatus.Waiting), entry);
        Assert.Null(snapshot.CurrentTeamId);
    }

    [Fact]
    public void Grace_window_starts_at_the_first_buzz_not_at_begin()
    {
        Begin();
        _time.Advance(TimeSpan.FromSeconds(30));

        BuzzOk(Alice);

        Assert.Equal(Start + TimeSpan.FromSeconds(30) + Grace, _round.GetPublicSnapshot().WindowEndsAt);
    }

    [Fact]
    public void Later_teams_do_not_extend_the_window()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(TimeSpan.FromMilliseconds(500));

        BuzzOk(Bob);

        Assert.Equal(Start + Grace, _round.GetPublicSnapshot().WindowEndsAt);
    }

    [Fact]
    public void Teammate_buzz_is_recorded_but_not_queued()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(TimeSpan.FromMilliseconds(210));

        var result = _round.Buzz(Abe);

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetAdminSnapshot();
        var entry = Assert.Single(snapshot.TeamQueue);
        Assert.Equal("Alice", entry.BuzzedByDisplayName);
        Assert.Equal(
            [
                new BuzzEntry(1, Alice, "Alice", RageQuitters, "Rage Quitters", 0, true),
                new BuzzEntry(2, Abe, "Abe", RageQuitters, "Rage Quitters", 210, false),
            ],
            snapshot.Buzzes);
    }

    [Fact]
    public void Repeat_buzz_from_the_same_player_is_ignored()
    {
        Begin();
        BuzzOk(Alice);
        var version = Version;

        var result = _round.Buzz(Alice);

        Assert.Equal(new RoundResult(true, null, false), result);
        Assert.Equal(version, Version);
        Assert.Single(_round.GetAdminSnapshot().Buzzes);
    }

    [Fact]
    public void Teams_queue_in_arrival_order_with_offsets_from_the_first_buzz()
    {
        Begin();
        BuzzOk(Bob);
        _time.Advance(TimeSpan.FromMilliseconds(120));
        BuzzOk(Alice);

        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal([PayToWin, RageQuitters], snapshot.TeamQueue.Select(q => q.TeamId));
        Assert.Equal([1, 2], snapshot.TeamQueue.Select(q => q.Position));
        Assert.Equal([0, 120], snapshot.Buzzes.Select(b => b.OffsetMs));
    }

    [Fact]
    public void Buzz_just_before_the_window_ends_is_accepted()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(Grace - TimeSpan.FromTicks(1));

        Assert.True(_round.Buzz(Bob).Success);
        Assert.Equal(2, _round.GetPublicSnapshot().TeamQueue.Count);
    }

    [Theory]
    [InlineData(0)]    // exactly at WindowEndsAt
    [InlineData(1)]    // just after
    [InlineData(5000)] // long after
    public void Buzz_at_or_after_the_window_end_locks_and_is_rejected_without_tick(int msAfterEnd)
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(Grace + TimeSpan.FromMilliseconds(msAfterEnd));
        var version = Version;

        var result = _round.Buzz(Bob);

        // Changed is true even though the buzz failed: the round locked, so callers must broadcast.
        Assert.Equal(new RoundResult(false, RoundErrors.WindowClosed, true), result);
        Assert.Equal(version + 1, Version);
        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Single(snapshot.TeamQueue);
        Assert.Single(snapshot.Buzzes);
        Assert.NotNull(_round.TakeLockedRecord());
    }

    [Fact]
    public void Buzz_after_the_late_lock_is_plain_not_open()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(Grace);
        _round.Buzz(Bob);

        Assert.Equal(new RoundResult(false, RoundErrors.NotOpen, false), _round.Buzz(Cara));
    }

    [Fact]
    public void Queueing_every_roster_team_locks_immediately()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Bob);
        _time.Advance(TimeSpan.FromMilliseconds(300));

        var result = _round.Buzz(Cara);

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Equal(RageQuitters, snapshot.CurrentTeamId);
        Assert.Equal(Start + TimeSpan.FromMilliseconds(300), snapshot.CurrentSince);
        Assert.Equal(
            [TeamTurnStatus.Current, TeamTurnStatus.Waiting, TeamTurnStatus.Waiting],
            snapshot.TeamQueue.Select(q => q.Status));
    }

    [Fact]
    public void Single_team_roster_locks_on_the_first_buzz()
    {
        _round.Begin([new RosterEntry(Alice, "Alice", RageQuitters, "Rage Quitters")]);

        BuzzOk(Alice);

        Assert.Equal(RoundPhase.Locked, Phase);
    }

    [Fact]
    public void Recorded_buzzes_are_capped_but_teams_still_queue()
    {
        var round = new BuzzRound(_time, new RoundSettings { GraceWindow = Grace, MaxRecordedBuzzes = 2 });
        round.Begin(Roster);

        round.Buzz(Alice);
        round.Buzz(Abe);
        round.Buzz(Bob);
        round.Buzz(Cara);

        var snapshot = round.GetAdminSnapshot();
        Assert.Equal([Alice, Abe], snapshot.Buzzes.Select(b => b.PlayerId));
        Assert.Equal([RageQuitters, PayToWin, CheatCodes], snapshot.TeamQueue.Select(q => q.TeamId));
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
    }

    // ---- Tick ----------------------------------------------------------------------------

    [Fact]
    public void Tick_before_the_window_ends_does_nothing()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(Grace - TimeSpan.FromMilliseconds(1));
        var version = Version;

        Assert.False(_round.Tick());
        Assert.Equal(RoundPhase.Open, Phase);
        Assert.Equal(version, Version);
    }

    [Fact]
    public void Tick_at_the_window_end_locks_with_the_first_team_current()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Bob);
        _time.Advance(Grace);
        var version = Version;

        Assert.True(_round.Tick());

        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Equal(version + 1, snapshot.Version);
        Assert.Equal(RageQuitters, snapshot.CurrentTeamId);
        Assert.Equal(Start + Grace, snapshot.CurrentSince);
        Assert.Equal([TeamTurnStatus.Current, TeamTurnStatus.Waiting], snapshot.TeamQueue.Select(q => q.Status));
    }

    [Fact]
    public void Tick_locks_only_once()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(Grace);

        Assert.True(_round.Tick());
        Assert.False(_round.Tick());
    }

    [Fact]
    public void Open_round_without_buzzes_never_times_out()
    {
        Begin();
        _time.Advance(TimeSpan.FromHours(1));

        Assert.False(_round.Tick());
        Assert.Equal(RoundPhase.Open, Phase);
    }

    [Theory]
    [InlineData(RoundPhase.Idle)]
    [InlineData(RoundPhase.Locked)]
    [InlineData(RoundPhase.Exhausted)]
    public void Tick_outside_open_does_nothing(RoundPhase phase)
    {
        MoveTo(phase);
        _time.Advance(TimeSpan.FromMinutes(1));
        var version = Version;

        Assert.False(_round.Tick());
        Assert.Equal(phase, Phase);
        Assert.Equal(version, Version);
    }

    // ---- NextTeam ------------------------------------------------------------------------

    [Fact]
    public void NextTeam_passes_the_turn_to_the_next_queued_team()
    {
        LockWithTwoTeams();
        _time.Advance(TimeSpan.FromSeconds(10));

        var result = _round.NextTeam();

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Equal(PayToWin, snapshot.CurrentTeamId);
        Assert.Equal(Start + Grace + TimeSpan.FromSeconds(10), snapshot.CurrentSince);
        Assert.Equal([TeamTurnStatus.Passed, TeamTurnStatus.Current], snapshot.TeamQueue.Select(q => q.Status));
    }

    [Fact]
    public void NextTeam_past_the_last_team_exhausts_the_round()
    {
        LockWithTwoTeams();
        _round.NextTeam();

        var result = _round.NextTeam();

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Exhausted, snapshot.Phase);
        Assert.Null(snapshot.CurrentTeamId);
        Assert.Null(snapshot.CurrentSince);
        Assert.All(snapshot.TeamQueue, q => Assert.Equal(TeamTurnStatus.Passed, q.Status));
    }

    [Theory]
    [InlineData(RoundPhase.Idle)]
    [InlineData(RoundPhase.Open)]
    [InlineData(RoundPhase.Exhausted)]
    public void NextTeam_is_rejected_unless_locked(RoundPhase phase)
    {
        MoveTo(phase);
        var version = Version;

        var result = _round.NextTeam();

        Assert.Equal(new RoundResult(false, RoundErrors.NotLocked, false), result);
        Assert.Equal(phase, Phase);
        Assert.Equal(version, Version);
    }

    // ---- Reset ---------------------------------------------------------------------------

    [Theory]
    [InlineData(RoundPhase.Open)]
    [InlineData(RoundPhase.Locked)]
    [InlineData(RoundPhase.Exhausted)]
    public void Reset_returns_to_an_empty_idle_round(RoundPhase phase)
    {
        MoveTo(phase);
        var version = Version;

        var result = _round.Reset();

        Assert.Equal(new RoundResult(true, null, true), result);
        var snapshot = _round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Idle, snapshot.Phase);
        Assert.Equal(version + 1, snapshot.Version);
        Assert.Null(snapshot.RoundId);
        Assert.Null(snapshot.RoundStartedAt);
        Assert.Empty(snapshot.TeamQueue);
        Assert.Null(snapshot.CurrentTeamId);
        Assert.Null(snapshot.WindowEndsAt);
        Assert.Empty(snapshot.Buzzes);
        Assert.Null(snapshot.CurrentSince);
    }

    [Fact]
    public void Reset_when_idle_succeeds_without_a_change()
    {
        var result = _round.Reset();

        Assert.Equal(new RoundResult(true, null, false), result);
        Assert.Equal(0, Version);
    }

    [Fact]
    public void Players_can_buzz_again_in_the_next_round()
    {
        LockWithTwoTeams();
        _round.Reset();
        Begin();

        Assert.Equal(new RoundResult(true, null, true), _round.Buzz(Alice));
        Assert.Single(_round.GetAdminSnapshot().Buzzes);
    }

    [Fact]
    public void Open_round_with_a_queued_team_can_be_reset_before_locking()
    {
        Begin();
        BuzzOk(Alice);

        _round.Reset();
        _time.Advance(Grace);

        Assert.False(_round.Tick());
        Assert.Equal(RoundPhase.Idle, Phase);
        Assert.Null(_round.TakeLockedRecord());
    }

    // ---- Version -------------------------------------------------------------------------

    [Fact]
    public void Version_goes_up_by_one_per_change_and_never_on_a_rejection()
    {
        var versions = new List<long> { Version };
        void Record() => versions.Add(Version);

        _round.Begin(Roster); Record();       // +1
        _round.Begin(Roster); Record();       // rejected
        _round.Buzz(NotInRoster); Record();   // rejected
        _round.Buzz(Alice); Record();         // +1
        _round.Buzz(Alice); Record();         // repeat, no change
        _round.Buzz(Abe); Record();           // +1 (teammate recorded)
        _round.NextTeam(); Record();          // rejected
        _round.Tick(); Record();              // window still open
        _time.Advance(Grace);
        _round.Tick(); Record();              // +1 (locks)
        _round.Tick(); Record();              // no change
        _round.NextTeam(); Record();          // +1 (exhausts: one team)
        _round.Reset(); Record();             // +1
        _round.Reset(); Record();             // idle, no change

        Assert.Equal([0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 6], versions);
    }

    [Fact]
    public void Both_snapshots_carry_the_same_version()
    {
        LockWithTwoTeams();

        Assert.Equal(_round.GetPublicSnapshot().Version, _round.GetAdminSnapshot().Version);
    }

    // ---- Snapshots -----------------------------------------------------------------------

    [Fact]
    public void Public_snapshot_has_no_individual_buzzes()
    {
        var properties = typeof(PublicRoundSnapshot).GetProperties();

        Assert.DoesNotContain(properties, p => p.Name == nameof(AdminRoundSnapshot.Buzzes));
        Assert.DoesNotContain(properties, p => p.Name == nameof(AdminRoundSnapshot.CurrentSince));
        Assert.DoesNotContain(properties, p => p.PropertyType == typeof(IReadOnlyList<BuzzEntry>));
    }

    [Fact]
    public void Admin_snapshot_matches_the_public_one_plus_buzzes()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Abe);
        BuzzOk(Bob);

        var pub = _round.GetPublicSnapshot();
        var admin = _round.GetAdminSnapshot();

        Assert.Equal(pub.Version, admin.Version);
        Assert.Equal(pub.RoundId, admin.RoundId);
        Assert.Equal(pub.Phase, admin.Phase);
        Assert.Equal(pub.RoundStartedAt, admin.RoundStartedAt);
        Assert.Equal(pub.TeamQueue, admin.TeamQueue);
        Assert.Equal(pub.CurrentTeamId, admin.CurrentTeamId);
        Assert.Equal(pub.WindowEndsAt, admin.WindowEndsAt);
        Assert.Equal(3, admin.Buzzes.Count);
    }

    [Fact]
    public void Snapshots_are_not_affected_by_later_changes()
    {
        Begin();
        BuzzOk(Alice);
        var before = _round.GetAdminSnapshot();

        BuzzOk(Bob);
        _time.Advance(Grace);
        _round.Tick();

        Assert.Equal(RoundPhase.Open, before.Phase);
        var entry = Assert.Single(before.TeamQueue);
        Assert.Equal(TeamTurnStatus.Waiting, entry.Status);
        Assert.Single(before.Buzzes);
    }

    [Fact]
    public void ServerNow_reflects_the_time_the_snapshot_was_taken()
    {
        _time.Advance(TimeSpan.FromSeconds(42));

        Assert.Equal(Start + TimeSpan.FromSeconds(42), _round.GetPublicSnapshot().ServerNow);
    }

    // ---- Locked / ended records ----------------------------------------------------------

    [Fact]
    public void Locked_record_is_available_exactly_once_after_locking()
    {
        Begin();
        BuzzOk(Alice);
        _time.Advance(TimeSpan.FromMilliseconds(150));
        BuzzOk(Abe);
        BuzzOk(Bob);
        var roundId = _round.GetPublicSnapshot().RoundId;
        Assert.Null(_round.TakeLockedRecord());

        _time.Advance(Grace);
        _round.Tick();

        var record = _round.TakeLockedRecord();
        Assert.NotNull(record);
        Assert.Equal(roundId, record.RoundId);
        Assert.Equal(Start, record.StartedAt);
        Assert.Equal(Start + TimeSpan.FromMilliseconds(150) + Grace, record.LockedAt);
        Assert.Equal(
            [
                new LockedBuzz(Alice, RageQuitters, 1, 0, true, 1),
                new LockedBuzz(Abe, RageQuitters, 2, 150, false, null),
                new LockedBuzz(Bob, PayToWin, 3, 150, true, 2),
            ],
            record.Buzzes);
        Assert.Null(_round.TakeLockedRecord());
    }

    [Fact]
    public void Locked_record_is_produced_by_an_all_teams_lock_too()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Bob);
        BuzzOk(Cara);

        Assert.NotNull(_round.TakeLockedRecord());
        Assert.Null(_round.TakeLockedRecord());
    }

    [Fact]
    public void Ended_record_is_available_exactly_once_after_resetting_a_locked_round()
    {
        Begin();
        BuzzOk(Alice);
        BuzzOk(Bob);
        BuzzOk(Cara);
        var roundId = _round.GetPublicSnapshot().RoundId;
        _round.NextTeam(); // Rage Quitters pass, Pay To Win current, Cheat Codes never reached
        _time.Advance(TimeSpan.FromSeconds(20));
        Assert.Null(_round.TakeEndedRecord());

        _round.Reset();

        var record = _round.TakeEndedRecord();
        Assert.NotNull(record);
        Assert.Equal(roundId, record.RoundId);
        Assert.Equal(Start + TimeSpan.FromSeconds(20), record.EndedAt);
        Assert.Equal(
            [
                new TeamOutcomeEntry(RageQuitters, RoundTeamOutcome.Passed),
                new TeamOutcomeEntry(PayToWin, RoundTeamOutcome.Current),
                new TeamOutcomeEntry(CheatCodes, RoundTeamOutcome.Unreached),
            ],
            record.TeamOutcomes);
        Assert.Null(_round.TakeEndedRecord());
    }

    [Fact]
    public void Ended_record_after_exhaustion_has_every_team_passed()
    {
        Exhaust();

        _round.Reset();

        var record = _round.TakeEndedRecord();
        Assert.NotNull(record);
        Assert.All(record.TeamOutcomes, o => Assert.Equal(RoundTeamOutcome.Passed, o.Outcome));
    }

    [Fact]
    public void Reset_while_open_produces_no_records()
    {
        Begin();
        BuzzOk(Alice);

        _round.Reset();

        Assert.Null(_round.TakeLockedRecord());
        Assert.Null(_round.TakeEndedRecord());
    }

    [Fact]
    public void Reset_while_idle_produces_no_ended_record()
    {
        _round.Reset();

        Assert.Null(_round.TakeEndedRecord());
    }

    [Fact]
    public void Untaken_records_survive_reset_and_later_rounds_in_order()
    {
        LockWithTwoTeams();
        var first = _round.GetPublicSnapshot().RoundId;
        _round.Reset();
        LockWithTwoTeams();
        var second = _round.GetPublicSnapshot().RoundId;
        _round.Reset();

        Assert.Equal(first, _round.TakeLockedRecord()?.RoundId);
        Assert.Equal(second, _round.TakeLockedRecord()?.RoundId);
        Assert.Null(_round.TakeLockedRecord());
        Assert.Equal(first, _round.TakeEndedRecord()?.RoundId);
        Assert.Equal(second, _round.TakeEndedRecord()?.RoundId);
        Assert.Null(_round.TakeEndedRecord());
    }
}
