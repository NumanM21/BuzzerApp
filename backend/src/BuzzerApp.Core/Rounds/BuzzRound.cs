namespace BuzzerApp.Core.Rounds;

/// <summary>
/// The live buzzer round (PlanMVP §7.3). Thread-safe on its own: every public member takes the
/// same private lock, so callers (the SignalR hub, the clock) can call it from any thread.
/// Arrival order is the order calls acquire the lock — the server's order, never the client's.
/// </summary>
public sealed class BuzzRound
{
    private readonly Lock _gate = new();
    private readonly TimeProvider _time;
    private readonly RoundSettings _settings;

    private readonly Dictionary<int, RosterEntry> _roster = [];
    private readonly HashSet<int> _buzzedPlayers = [];
    private readonly List<RecordedBuzz> _buzzes = [];
    private readonly List<QueueItem> _queue = [];

    // Queues rather than single slots, so a record is never overwritten if the caller is late
    // taking it. Losing one would lose stats that can't be reconstructed (D28).
    private readonly Queue<LockedRoundRecord> _pendingLocked = new();
    private readonly Queue<EndedRoundRecord> _pendingEnded = new();

    private RoundPhase _phase = RoundPhase.Idle;
    private long _version;
    private Guid? _roundId;
    private DateTimeOffset? _startedAt;
    private int _teamCount;
    private DateTimeOffset? _firstBuzzAt;
    private DateTimeOffset? _windowEndsAt;
    private DateTimeOffset? _lockedAt;
    private int? _currentIndex;
    private DateTimeOffset? _currentSince;

    public BuzzRound(TimeProvider time, RoundSettings settings)
    {
        ArgumentNullException.ThrowIfNull(time);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentOutOfRangeException.ThrowIfLessThan(settings.GraceWindow, TimeSpan.Zero, nameof(settings));
        ArgumentOutOfRangeException.ThrowIfNegative(settings.MaxRecordedBuzzes, nameof(settings));

        _time = time;
        _settings = settings;
    }

    /// <summary>Starts a round. The roster is captured now; later joins or moves apply from the next round (D13).</summary>
    public RoundResult Begin(IReadOnlyCollection<RosterEntry> roster)
    {
        ArgumentNullException.ThrowIfNull(roster);

        lock (_gate)
        {
            if (_phase != RoundPhase.Idle)
            {
                return RoundResult.Fail(RoundErrors.NotIdle);
            }

            if (roster.Count == 0)
            {
                return RoundResult.Fail(RoundErrors.EmptyRoster);
            }

            if (roster.DistinctBy(r => r.PlayerId).Count() != roster.Count)
            {
                return RoundResult.Fail(RoundErrors.DuplicatePlayer);
            }

            var now = _time.GetUtcNow();
            foreach (var entry in roster)
            {
                _roster.Add(entry.PlayerId, entry);
            }

            _teamCount = roster.Select(r => r.TeamId).Distinct().Count();
            _roundId = Guid.CreateVersion7(now);
            _startedAt = now;
            _phase = RoundPhase.Open;
            return Changed();
        }
    }

    /// <summary>
    /// The team comes from the roster captured at Begin, never from the caller, so a client
    /// can't buzz for another team.
    /// </summary>
    public RoundResult Buzz(int playerId)
    {
        lock (_gate)
        {
            var now = _time.GetUtcNow();

            // Checked here as well as in Tick, so a late buzz is rejected even if the clock
            // hasn't ticked yet. Locking first means the rejection and the lock are one step.
            if (IsWindowClosed(now))
            {
                LockAt(now);
                BumpVersion();
                return RoundResult.Fail(RoundErrors.WindowClosed, changed: true);
            }

            if (_phase != RoundPhase.Open)
            {
                return RoundResult.Fail(RoundErrors.NotOpen);
            }

            if (!_roster.TryGetValue(playerId, out var player))
            {
                return RoundResult.Fail(RoundErrors.UnknownPlayer);
            }

            // Phones double-tap and retry; a repeat is harmless, not an error.
            if (!_buzzedPlayers.Add(playerId))
            {
                return RoundResult.Ok(changed: false);
            }

            _firstBuzzAt ??= now;

            int? queuePosition = null;
            if (!_queue.Exists(q => q.TeamId == player.TeamId))
            {
                queuePosition = _queue.Count + 1;
                _queue.Add(new QueueItem(queuePosition.Value, player.TeamId, player.TeamName, player.DisplayName));

                if (queuePosition == 1)
                {
                    _windowEndsAt = now + _settings.GraceWindow;
                }
            }

            // The cap only bounds memory/payload size; it must never stop a team from queueing.
            if (_buzzes.Count < _settings.MaxRecordedBuzzes)
            {
                _buzzes.Add(new RecordedBuzz(
                    Sequence: _buzzes.Count + 1,
                    Player: player,
                    OffsetMs: (int)(now - _firstBuzzAt.Value).TotalMilliseconds,
                    TeamQueuePosition: queuePosition));
            }

            if (_queue.Count == _teamCount)
            {
                LockAt(now);
            }

            return Changed();
        }
    }

    /// <summary>Wrong answer: the current team passes and the next queued team gets the turn.</summary>
    public RoundResult NextTeam()
    {
        lock (_gate)
        {
            if (_phase != RoundPhase.Locked || _currentIndex is not { } current)
            {
                return RoundResult.Fail(RoundErrors.NotLocked);
            }

            _queue[current].Status = TeamTurnStatus.Passed;

            if (current + 1 < _queue.Count)
            {
                _currentIndex = current + 1;
                _queue[current + 1].Status = TeamTurnStatus.Current;
                _currentSince = _time.GetUtcNow();
            }
            else
            {
                _currentIndex = null;
                _currentSince = null;
                _phase = RoundPhase.Exhausted;
            }

            return Changed();
        }
    }

    /// <summary>Allowed from every phase. Resetting while already Idle succeeds without changing anything.</summary>
    public RoundResult Reset()
    {
        lock (_gate)
        {
            if (_phase == RoundPhase.Idle)
            {
                return RoundResult.Ok(changed: false);
            }

            // A round that never locked was never persisted, so there is nothing to end.
            if (_lockedAt is not null)
            {
                _pendingEnded.Enqueue(new EndedRoundRecord(
                    _roundId!.Value,
                    _time.GetUtcNow(),
                    _queue.Select(q => new TeamOutcomeEntry(q.TeamId, ToOutcome(q.Status))).ToArray()));
            }

            _roster.Clear();
            _buzzedPlayers.Clear();
            _buzzes.Clear();
            _queue.Clear();
            _teamCount = 0;
            _roundId = null;
            _startedAt = null;
            _firstBuzzAt = null;
            _windowEndsAt = null;
            _lockedAt = null;
            _currentIndex = null;
            _currentSince = null;
            _phase = RoundPhase.Idle;
            return Changed();
        }
    }

    /// <summary>
    /// Called periodically so the round locks when the grace window ends even if nobody buzzes
    /// again. Returns true if it locked the round. An Open round with no buzzes never times out.
    /// </summary>
    public bool Tick()
    {
        lock (_gate)
        {
            var now = _time.GetUtcNow();
            if (!IsWindowClosed(now))
            {
                return false;
            }

            LockAt(now);
            BumpVersion();
            return true;
        }
    }

    public PublicRoundSnapshot GetPublicSnapshot()
    {
        lock (_gate)
        {
            return new PublicRoundSnapshot(
                _version,
                _roundId,
                _phase,
                _startedAt,
                BuildQueueSnapshot(),
                CurrentTeamId,
                _windowEndsAt,
                _time.GetUtcNow());
        }
    }

    public AdminRoundSnapshot GetAdminSnapshot()
    {
        lock (_gate)
        {
            return new AdminRoundSnapshot(
                _version,
                _roundId,
                _phase,
                _startedAt,
                BuildQueueSnapshot(),
                CurrentTeamId,
                _windowEndsAt,
                _time.GetUtcNow(),
                _buzzes.Select(b => new BuzzEntry(
                    b.Sequence,
                    b.Player.PlayerId,
                    b.Player.DisplayName,
                    b.Player.TeamId,
                    b.Player.TeamName,
                    b.OffsetMs,
                    b.CountedForTeam)).ToArray(),
                _currentSince);
        }
    }

    /// <summary>Returns each locked round's record exactly once (oldest first), then null.</summary>
    public LockedRoundRecord? TakeLockedRecord()
    {
        lock (_gate)
        {
            return _pendingLocked.TryDequeue(out var record) ? record : null;
        }
    }

    /// <summary>Returns each ended round's record exactly once (oldest first), then null.</summary>
    public EndedRoundRecord? TakeEndedRecord()
    {
        lock (_gate)
        {
            return _pendingEnded.TryDequeue(out var record) ? record : null;
        }
    }

    private int? CurrentTeamId => _currentIndex is { } i ? _queue[i].TeamId : null;

    private bool IsWindowClosed(DateTimeOffset now) =>
        _phase == RoundPhase.Open && _windowEndsAt is { } end && now >= end;

    // Only reachable once a team has queued (the window starts at the first queued buzz),
    // so the queue is never empty here.
    private void LockAt(DateTimeOffset now)
    {
        _phase = RoundPhase.Locked;
        _lockedAt = now;
        _currentIndex = 0;
        _queue[0].Status = TeamTurnStatus.Current;
        _currentSince = now;

        _pendingLocked.Enqueue(new LockedRoundRecord(
            _roundId!.Value,
            _startedAt!.Value,
            now,
            _buzzes.Select(b => new LockedBuzz(
                b.Player.PlayerId,
                b.Player.TeamId,
                b.Sequence,
                b.OffsetMs,
                b.CountedForTeam,
                b.TeamQueuePosition)).ToArray()));
    }

    private TeamQueueEntry[] BuildQueueSnapshot() =>
        _queue.Select(q => new TeamQueueEntry(q.Position, q.TeamId, q.TeamName, q.BuzzedByDisplayName, q.Status)).ToArray();

    private RoundResult Changed()
    {
        BumpVersion();
        return RoundResult.Ok();
    }

    // Every state change must bump Version: clients discard snapshots older than the one they
    // hold, so a change without a bump could be dropped as stale.
    private void BumpVersion() => _version++;

    private static RoundTeamOutcome ToOutcome(TeamTurnStatus status) => status switch
    {
        TeamTurnStatus.Current => RoundTeamOutcome.Current,
        TeamTurnStatus.Passed => RoundTeamOutcome.Passed,
        TeamTurnStatus.Waiting => RoundTeamOutcome.Unreached,
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    private sealed record RecordedBuzz(int Sequence, RosterEntry Player, int OffsetMs, int? TeamQueuePosition)
    {
        public bool CountedForTeam => TeamQueuePosition is not null;
    }

    // Mutable on purpose (Status changes as the turn moves); never leaves this class.
    private sealed class QueueItem(int position, int teamId, string teamName, string buzzedByDisplayName)
    {
        public int Position { get; } = position;
        public int TeamId { get; } = teamId;
        public string TeamName { get; } = teamName;
        public string BuzzedByDisplayName { get; } = buzzedByDisplayName;
        public TeamTurnStatus Status { get; set; } = TeamTurnStatus.Waiting;
    }
}
