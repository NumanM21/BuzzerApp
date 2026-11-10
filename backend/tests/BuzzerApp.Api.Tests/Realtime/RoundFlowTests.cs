using System.Text.Json;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Realtime;

/// <summary>
/// Whole rounds through the hub, the clock and the persistence worker. Each test makes an event of its own, so the roster
/// holds exactly its teams, and runs a host of its own with a fake clock.
/// </summary>
[Collection(ApiCollection.Name)]
public class RoundFlowTests(ApiFactory factory)
{
    [Theory]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(13)]
    public async Task One_buzz_locks_after_the_grace_window_with_no_further_input(int teamCount)
    {
        var ev = await factory.CreateRoundEventAsync(teamCount, playersPerTeam: 2);
        await using var host = GameHost.Start(factory);
        var buzzer = ev.PlayersByTeam[0][0];
        await using var admin = await host.ConnectAsync(ev.Admin);
        await using var a = await host.ConnectAsync(buzzer);
        await using var b = await host.ConnectAsync(ev.PlayersByTeam[1][0]);
        var startedAt = host.Time.GetUtcNow();

        AssertResult(await admin.InvokeAsync("BeginRound"), success: true, error: null, changed: true);
        var open = await b.Public.WaitForAsync(s => s.IsPhase("open"), "open");
        var roundId = open.GetProperty("roundId").GetGuid();

        AssertResult(await a.InvokeAsync("Buzz"), success: true, error: null, changed: true);
        var queued = await b.Public.WaitForAsync(s => s.GetProperty("teamQueue").GetArrayLength() == 1, "one team queued");
        Assert.Equal("open", queued.Phase());
        Assert.Equal(startedAt + host.GraceWindow, queued.GetProperty("windowEndsAt").GetDateTimeOffset());

        // Not yet: the window closes at exactly first buzz + grace.
        host.Time.Advance(host.GraceWindow - TimeSpan.FromMilliseconds(1));
        await host.Rounds.TickAsync();
        Assert.Equal(Core.Rounds.RoundPhase.Open, host.Rounds.GetPublicSnapshot().Phase);

        // Nobody presses anything: the clock alone locks the round. Some clock tick falls inside any span of one interval.
        var windowEnd = startedAt + host.GraceWindow;
        host.Time.Advance(RoundClock.Interval);
        var locked = await b.Public.WaitForAsync(s => s.IsPhase("locked"), "locked");
        Assert.Equal(ev.Teams[0].Id, locked.GetProperty("currentTeamId").GetInt32());
        var entry = Assert.Single(locked.GetProperty("teamQueue").EnumerateArray());
        Assert.Equal(1, entry.GetProperty("position").GetInt32());
        Assert.Equal(ev.Teams[0].Id, entry.GetProperty("teamId").GetInt32());
        Assert.Equal(ev.Teams[0].Name, entry.GetProperty("teamName").GetString());
        Assert.Equal(buzzer.DisplayName, entry.GetProperty("buzzedByDisplayName").GetString());
        Assert.Equal("current", entry.GetProperty("status").GetString());

        // The admin sees the individual buzz; players' snapshots have no such field at all (D6).
        var adminLocked = await admin.Admin.WaitForAsync(s => s.IsPhase("locked"), "locked");
        var buzz = Assert.Single(adminLocked.GetProperty("buzzes").EnumerateArray());
        Assert.Equal(1, buzz.GetProperty("sequence").GetInt32());
        Assert.Equal(buzzer.Id, buzz.GetProperty("playerId").GetInt32());
        Assert.Equal(buzzer.DisplayName, buzz.GetProperty("displayName").GetString());
        Assert.Equal(ev.Teams[0].Id, buzz.GetProperty("teamId").GetInt32());
        Assert.Equal(0, buzz.GetProperty("offsetMs").GetInt32());
        Assert.True(buzz.GetProperty("countedForTeam").GetBoolean());
        Assert.False(locked.TryGetProperty("buzzes", out _));

        AssertResult(await admin.InvokeAsync("NextTeam"), success: true, error: null, changed: true);
        await b.Public.WaitForAsync(s => s.IsPhase("exhausted"), "exhausted");
        AssertResult(await admin.InvokeAsync("ResetRound"), success: true, error: null, changed: true);
        await b.Public.WaitForAsync(s => s.IsPhase("idle"), "idle");

        await a.BarrierAsync();
        await b.BarrierAsync();
        Assert.Empty(a.Admin.All);
        Assert.Empty(b.Admin.All);
        foreach (var client in new[] { a, b, admin })
        {
            // Sends are serialised and snapshotted inside the broadcast gate, so each connection sees versions rise.
            var versions = client.Public.All.Select(s => s.Version()).ToArray();
            Assert.Equal(versions.Order().Distinct(), versions);
            Assert.DoesNotContain(client.Public.All, s => s.GetRawText().Contains(buzzer.RealName, StringComparison.Ordinal));
        }

        await factory.EventuallyAsync(db => db.Rounds.AnyAsync(r => r.Id == roundId && r.EndedAt != null), "the round's end to be saved");
        var (round, buzzes) = await LoadRoundAsync(roundId);
        Assert.Equal(ev.EventId, round.EventId);
        Assert.Equal(startedAt, round.StartedAt);
        Assert.InRange(round.LockedAt!.Value, windowEnd, host.Time.GetUtcNow());
        Assert.Equal(host.Time.GetUtcNow(), round.EndedAt);   // the clock hasn't moved since Reset
        var saved = Assert.Single(buzzes);
        Assert.Equal((buzzer.Id, ev.Teams[0].Id, 1, 0, true, (int?)1, (TeamOutcome?)TeamOutcome.Passed),
            (saved.PlayerId, saved.TeamId, saved.Sequence, saved.OffsetMs, saved.CountedForTeam, saved.TeamQueuePosition, saved.Outcome));
    }

    public static TheoryData<int, int> EveryTeamShapes => new()
    {
        { 1, 0 }, { 2, 0 }, { 2, 1 }, { 2, 2 }, { 6, 3 }, { 13, 0 }, { 13, 13 },
    };

    [Theory]
    [MemberData(nameof(EveryTeamShapes))]
    public async Task Every_team_buzzing_locks_at_once_and_the_queue_and_outcomes_are_saved(int teamCount, int nextTeams)
    {
        var ev = await factory.CreateRoundEventAsync(teamCount, playersPerTeam: 2);
        await using var host = GameHost.Start(factory);
        await using var admin = await host.ConnectAsync(ev.Admin);
        AssertResult(await admin.InvokeAsync("BeginRound"), success: true, error: null, changed: true);
        var roundId = host.Rounds.GetPublicSnapshot().RoundId!.Value;

        // Teams buzz in reverse id order, so a queue position that followed team ids instead of arrival would show.
        // The last team's teammate buzzes too (recorded, not queued), before the final team buzz locks the round.
        var buzzOrder = Enumerable.Range(0, teamCount).Reverse().ToList();
        var buzzers = new List<Player>();
        foreach (var t in buzzOrder)
        {
            buzzers.Add(ev.PlayersByTeam[t][0]);
            if (t == buzzOrder[0] && teamCount > 1)
            {
                buzzers.Add(ev.PlayersByTeam[t][1]);
            }
        }

        foreach (var player in buzzers)
        {
            Assert.True((await host.Rounds.BuzzAsync(player.Id)).Success);
        }

        // No time has passed: the round locked because every team was queued.
        var locked = await admin.Admin.WaitForAsync(s => s.IsPhase("locked"), "locked");
        Assert.Equal(buzzOrder.Select(t => ev.Teams[t].Id), locked.GetProperty("teamQueue").EnumerateArray().Select(e => e.GetProperty("teamId").GetInt32()));
        Assert.Equal(Enumerable.Range(1, teamCount), locked.GetProperty("teamQueue").EnumerateArray().Select(e => e.GetProperty("position").GetInt32()));
        Assert.Equal(buzzers.Select(p => p.Id), locked.GetProperty("buzzes").EnumerateArray().Select(e => e.GetProperty("playerId").GetInt32()));

        for (var i = 0; i < nextTeams; i++)
        {
            AssertResult(await admin.InvokeAsync("NextTeam"), success: true, error: null, changed: true);
        }

        AssertResult(await admin.InvokeAsync("ResetRound"), success: true, error: null, changed: true);

        await factory.EventuallyAsync(db => db.Rounds.AnyAsync(r => r.Id == roundId && r.EndedAt != null), "the round's end to be saved");
        var (round, buzzes) = await LoadRoundAsync(roundId);
        Assert.Equal(round.StartedAt, round.LockedAt);
        Assert.Equal(buzzers.Select(p => p.Id), buzzes.Select(b => b.PlayerId));
        Assert.Equal(Enumerable.Range(1, buzzers.Count), buzzes.Select(b => b.Sequence));
        Assert.Equal(buzzes.Select(b => b.Id).Order(), buzzes.Select(b => b.Id));   // inserted in sequence order

        var counted = buzzes.Where(b => b.CountedForTeam).ToList();
        Assert.Equal(buzzOrder.Select(t => ev.Teams[t].Id), counted.Select(b => b.TeamId));
        Assert.Equal(Enumerable.Range(1, teamCount).Select(p => (int?)p), counted.Select(b => b.TeamQueuePosition));
        Assert.Equal(counted.Select(b => (TeamOutcome?)ExpectedOutcome(b.TeamQueuePosition!.Value, nextTeams)), counted.Select(b => b.Outcome));
        Assert.All(buzzes.Where(b => !b.CountedForTeam), b => Assert.Equal((null, null), (b.TeamQueuePosition, b.Outcome)));
    }

    // Positions before the current one passed; the current team was answering at Reset; later ones never got a turn.
    // After the last NextTeam (Exhausted) every team has passed.
    private static TeamOutcome ExpectedOutcome(int position, int nextTeams) =>
        position <= nextTeams ? TeamOutcome.Passed
        : position == nextTeams + 1 ? TeamOutcome.Current
        : TeamOutcome.Unreached;

    [Fact]
    public async Task A_round_reset_before_it_locked_is_not_saved()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 1);
        await using var host = GameHost.Start(factory);

        await host.Rounds.BeginAsync(ev.EventId);
        var unlockedId = host.Rounds.GetPublicSnapshot().RoundId!.Value;
        await host.Rounds.BuzzAsync(ev.PlayersByTeam[0][0].Id);
        await host.Rounds.ResetAsync();

        // A round that does lock afterwards: once it is saved, everything queued before it has been handled.
        var savedId = await RunLockedRoundAsync(host, ev);
        await factory.EventuallyAsync(db => db.Rounds.AnyAsync(r => r.Id == savedId && r.EndedAt != null), "the later round to be saved");

        Assert.False(await factory.WithDbAsync(db => db.Rounds.AnyAsync(r => r.Id == unlockedId)));
    }

    [Fact]
    public async Task Begin_with_nobody_on_a_team_fails_with_a_code_and_changes_nothing()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 3, playersPerTeam: 0);
        await using var host = GameHost.Start(factory);
        await using var admin = await host.ConnectAsync(ev.Admin);

        AssertResult(await admin.InvokeAsync("BeginRound"), success: false, error: "round.emptyRoster", changed: false);
        Assert.Equal(0, host.Rounds.GetPublicSnapshot().Version);
    }

    [Fact]
    public async Task A_player_who_joins_after_Begin_takes_part_from_the_next_round()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 1);
        await using var host = GameHost.Start(factory);
        await using var admin = await host.ConnectAsync(ev.Admin);
        await admin.InvokeAsync("BeginRound");

        var late = await factory.AddPlayerAsync(ev, teamIndex: 1);
        await using var lateClient = await host.ConnectAsync(late);

        AssertResult(await lateClient.InvokeAsync("Buzz"), success: false, error: "round.unknownPlayer", changed: false);

        await admin.InvokeAsync("ResetRound");
        await admin.InvokeAsync("BeginRound");
        AssertResult(await lateClient.InvokeAsync("Buzz"), success: true, error: null, changed: true);
    }

    [Fact]
    public async Task Racing_buzzes_ticks_and_resets_leave_every_saved_round_complete()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 4, playersPerTeam: 5);
        await using var host = GameHost.Start(factory);
        var players = ev.Players.ToList();

        for (var i = 0; i < 25; i++)
        {
            await host.Rounds.BeginAsync(ev.EventId);
            var buzzing = players.Select(p => (Task)Task.Run(() => host.Rounds.BuzzAsync(p.Id))).ToList();
            var ticking = Task.Run(async () =>
            {
                host.Time.Advance(host.GraceWindow);
                await host.Rounds.TickAsync();
            });
            Task resetting = Task.Run(() => host.Rounds.ResetAsync());
            await Task.WhenAll(buzzing.Append(ticking).Append(resetting));
            await host.Rounds.ResetAsync();
        }

        var lastId = await RunLockedRoundAsync(host, ev);
        await factory.EventuallyAsync(db => db.Rounds.AnyAsync(r => r.Id == lastId && r.EndedAt != null), "the last round to be saved");

        // Every round that locked was reset afterwards, so each saved one must have its end and outcomes; a lost or
        // reordered record would leave a round without them. This checks the invariant under load, but it can't force
        // the narrow interleaving RoundService's change gate exists for, so it is no proof of that guard.
        var rounds = await factory.WithDbAsync(db => db.Rounds.AsNoTracking().Include(r => r.Buzzes).Where(r => r.EventId == ev.EventId).ToListAsync());
        Assert.NotEmpty(rounds);
        Assert.All(rounds, r =>
        {
            Assert.NotNull(r.LockedAt);
            Assert.NotNull(r.EndedAt);
            Assert.All(r.Buzzes.Where(b => b.CountedForTeam), b => Assert.NotNull(b.Outcome));
        });
    }

    private static async Task<Guid> RunLockedRoundAsync(GameHost host, RoundEvent ev)
    {
        await host.Rounds.BeginAsync(ev.EventId);
        var id = host.Rounds.GetPublicSnapshot().RoundId!.Value;
        await host.Rounds.BuzzAsync(ev.PlayersByTeam[0][0].Id);
        host.Time.Advance(host.GraceWindow);
        await host.Rounds.TickAsync();
        await host.Rounds.ResetAsync();
        return id;
    }

    private async Task<(Round Round, List<BuzzRecord> Buzzes)> LoadRoundAsync(Guid roundId) =>
        await factory.WithDbAsync(async db =>
        {
            var round = await db.Rounds.AsNoTracking().SingleAsync(r => r.Id == roundId);
            var buzzes = await db.BuzzRecords.AsNoTracking().Where(b => b.RoundId == roundId).OrderBy(b => b.Sequence).ToListAsync();
            return (round, buzzes);
        });

    private static void AssertResult(JsonElement result, bool success, string? error, bool changed)
    {
        Assert.Equal(["success", "error", "changed"], result.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(success, result.GetProperty("success").GetBoolean());
        Assert.Equal(error, result.GetProperty("error").GetString());
        Assert.Equal(changed, result.GetProperty("changed").GetBoolean());
    }
}
