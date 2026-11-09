using System.Collections.Concurrent;
using BuzzerApp.Core.Rounds;
using Microsoft.Extensions.Time.Testing;

namespace BuzzerApp.Core.Tests.Rounds;

/// <summary>
/// These can't prove the absence of races, but without the lock they fail reliably
/// (duplicate team entries, gaps in positions/sequences, or exceptions from List/Dictionary).
/// </summary>
public class BuzzRoundConcurrencyTests
{
    private const int TeamCount = 6;
    private const int PlayersPerTeam = 10;
    private const int BuzzAttempts = 200;

    private static readonly DateTimeOffset Start = new(2026, 12, 5, 19, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Start);

    // Player ids 1..60; team = 1 + (id - 1) % 6, so consecutive ids land on different teams.
    private static RosterEntry[] BuildRoster() =>
        Enumerable.Range(1, TeamCount * PlayersPerTeam)
            .Select(id =>
            {
                var team = 1 + (id - 1) % TeamCount;
                return new RosterEntry(id, $"Player {id}", team, $"Team {team}");
            })
            .ToArray();

    private BuzzRound NewOpenRound()
    {
        // A long window so the lock comes from every team queueing, not from time.
        var round = new BuzzRound(_time, new RoundSettings { GraceWindow = TimeSpan.FromMinutes(5) });
        Assert.True(round.Begin(BuildRoster()).Success);
        return round;
    }

    [Fact]
    public void Parallel_buzzes_give_exactly_one_queue_entry_per_team()
    {
        var round = NewOpenRound();
        var players = TeamCount * PlayersPerTeam;

        Parallel.For(0, BuzzAttempts, i => round.Buzz(1 + i % players));

        var snapshot = round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Equal(TeamCount, snapshot.TeamQueue.Count);
        Assert.Equal(Enumerable.Range(1, TeamCount), snapshot.TeamQueue.Select(q => q.Position));
        Assert.Equal(TeamCount, snapshot.TeamQueue.Select(q => q.TeamId).Distinct().Count());
        Assert.Single(snapshot.TeamQueue, q => q.Status == TeamTurnStatus.Current);
        Assert.Equal(snapshot.TeamQueue[0].TeamId, snapshot.CurrentTeamId);

        // Buzzes after the lock are rejected, so not everyone gets in, but what was recorded
        // must be internally consistent.
        Assert.Equal(Enumerable.Range(1, snapshot.Buzzes.Count), snapshot.Buzzes.Select(b => b.Sequence));
        Assert.Equal(snapshot.Buzzes.Count, snapshot.Buzzes.Select(b => b.PlayerId).Distinct().Count());
        Assert.Equal(TeamCount, snapshot.Buzzes.Count(b => b.CountedForTeam));

        // Each queue entry is credited to the first recorded buzz of that team.
        foreach (var entry in snapshot.TeamQueue)
        {
            var first = snapshot.Buzzes.First(b => b.TeamId == entry.TeamId);
            Assert.True(first.CountedForTeam);
            Assert.Equal(first.DisplayName, entry.BuzzedByDisplayName);
        }
    }

    [Fact]
    public void Parallel_buzzes_with_repeats_record_each_player_once()
    {
        // Only one team, so nothing locks early and every player gets through.
        var round = new BuzzRound(_time, new RoundSettings());
        var roster = Enumerable.Range(1, 50).Select(id => new RosterEntry(id, $"P{id}", 7, "Solo")).ToList();
        roster.Add(new RosterEntry(51, "Other", 8, "Other team"));
        round.Begin(roster);
        var changed = new ConcurrentBag<int>();

        Parallel.For(0, BuzzAttempts, i =>
        {
            var playerId = 1 + i % 50;
            if (round.Buzz(playerId).Changed)
            {
                changed.Add(playerId);
            }
        });

        var snapshot = round.GetAdminSnapshot();
        Assert.Equal(RoundPhase.Open, snapshot.Phase);
        Assert.Equal(50, snapshot.Buzzes.Count);
        Assert.Equal(50, changed.Count);
        Assert.Equal(Enumerable.Range(1, 50), changed.Order());
        Assert.Equal(1 + 50, snapshot.Version); // Begin + one per first buzz
    }

    [Fact]
    public void Only_one_concurrent_begin_wins()
    {
        var round = new BuzzRound(_time, new RoundSettings());
        var roster = BuildRoster();
        var successes = 0;

        Parallel.For(0, 50, _ =>
        {
            if (round.Begin(roster).Success)
            {
                Interlocked.Increment(ref successes);
            }
        });

        Assert.Equal(1, successes);
        Assert.Equal(1, round.GetPublicSnapshot().Version);
    }

    [Fact]
    public void Locked_record_is_taken_by_exactly_one_caller()
    {
        var round = NewOpenRound();
        foreach (var team in Enumerable.Range(1, TeamCount))
        {
            round.Buzz(team); // player id == team id for the first six players
        }

        var records = new ConcurrentBag<LockedRoundRecord>();
        Parallel.For(0, 50, _ =>
        {
            if (round.TakeLockedRecord() is { } record)
            {
                records.Add(record);
            }
        });

        Assert.Single(records);
    }

    [Fact]
    public void Tick_and_late_buzzes_racing_at_the_window_end_lock_exactly_once()
    {
        var round = new BuzzRound(_time, new RoundSettings { GraceWindow = TimeSpan.FromSeconds(2) });
        round.Begin(BuildRoster());
        round.Buzz(1);
        _time.Advance(TimeSpan.FromSeconds(2));
        var versionBefore = round.GetPublicSnapshot().Version;
        var locks = 0;

        Parallel.For(0, 100, i =>
        {
            // Mix clock ticks with buzzes from players on other teams, all after the window.
            var lockedHere = i % 2 == 0
                ? round.Tick()
                : round.Buzz(2 + i % 5).Changed;
            if (lockedHere)
            {
                Interlocked.Increment(ref locks);
            }
        });

        var snapshot = round.GetAdminSnapshot();
        Assert.Equal(1, locks);
        Assert.Equal(versionBefore + 1, snapshot.Version);
        Assert.Equal(RoundPhase.Locked, snapshot.Phase);
        Assert.Single(snapshot.TeamQueue);
        Assert.Single(snapshot.Buzzes);
        Assert.NotNull(round.TakeLockedRecord());
        Assert.Null(round.TakeLockedRecord());
    }

    [Fact]
    public void Snapshots_read_during_buzzing_are_consistent_and_versions_never_go_backwards()
    {
        var round = NewOpenRound();
        var players = TeamCount * PlayersPerTeam;
        var failures = new ConcurrentBag<string>();

        Parallel.Invoke(
            () => Parallel.For(0, BuzzAttempts, i => round.Buzz(1 + i % players)),
            () => ReadSnapshots(round, failures),
            () => ReadSnapshots(round, failures));

        Assert.Empty(failures);
    }

    private static void ReadSnapshots(BuzzRound round, ConcurrentBag<string> failures)
    {
        long lastVersion = -1;
        for (var i = 0; i < 500; i++)
        {
            var snapshot = round.GetAdminSnapshot();
            if (snapshot.Version < lastVersion)
            {
                failures.Add($"version went from {lastVersion} to {snapshot.Version}");
            }

            lastVersion = snapshot.Version;

            if (!snapshot.TeamQueue.Select(q => q.Position).SequenceEqual(Enumerable.Range(1, snapshot.TeamQueue.Count)))
            {
                failures.Add($"queue positions not contiguous at version {snapshot.Version}");
            }

            if (snapshot.Buzzes.Count(b => b.CountedForTeam) != snapshot.TeamQueue.Count)
            {
                failures.Add($"counted buzzes don't match queue at version {snapshot.Version}");
            }
        }
    }
}
