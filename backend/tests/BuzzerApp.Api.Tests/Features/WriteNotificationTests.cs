using System.Net;
using System.Net.Http.Json;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// D7: after a REST write the server tells clients to refetch. B6 swaps the notifier for SignalR, so what matters now is
/// that every endpoint calls the seam after (and only after) a successful save.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class WriteNotificationTests(ApiFactory factory) : IDisposable
{
    // Each spied browser is a whole host (clock, persistence worker, a thread parked in app.Run). Left alone they would
    // all live until the end of the test run.
    private readonly List<IDisposable> _hosts = [];

    public void Dispose() => _hosts.ForEach(h => h.Dispose());

    private sealed class SpyNotifier : IGameNotifier
    {
        private int _teams;
        private int _scores;

        public int Teams => Volatile.Read(ref _teams);
        public int Scores => Volatile.Read(ref _scores);

        public Task TeamsChangedAsync()
        {
            Interlocked.Increment(ref _teams);
            return Task.CompletedTask;
        }

        public Task ScoresChangedAsync()
        {
            Interlocked.Increment(ref _scores);
            return Task.CompletedTask;
        }
    }

    // Same host and database as every other test, with the notifier swapped for a spy that only this test can see.
    private (SpyNotifier Spy, HttpClient Client) NewSpiedBrowser()
    {
        var spy = new SpyNotifier();
        var spied = factory.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddSingleton<IGameNotifier>(spy)));
        _hosts.Add(spied);
        return (spy, spied.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true }));
    }

    private static void AssertNotifiedOnce(SpyNotifier spy, ref int teamsSeen, ref int scoresSeen)
    {
        Assert.Equal(teamsSeen + 1, spy.Teams);
        Assert.Equal(scoresSeen + 1, spy.Scores);
        teamsSeen = spy.Teams;
        scoresSeen = spy.Scores;
    }

    [Fact]
    public async Task Every_successful_team_and_player_write_notifies_teams_and_scores_once()
    {
        var (spy, client) = NewSpiedBrowser();
        await factory.CreateAdminAsync(client);
        var player = (await factory.RegisterNewPlayerAsync()).PlayerId;   // a separate browser: registering on `client` would replace the admin cookie
        var targetTeam = await factory.NewTeamIdAsync();
        int teams = spy.Teams, scores = spy.Scores;

        var create = await client.PostAsJsonAsync("/api/teams", new { name = ApiHelpers.UniqueName("Team"), colorKey = ApiHelpers.UniqueName("c"), iconKey = "x" });
        create.EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);

        var teamId = (await create.ReadJsonAsync()).GetProperty("id").GetInt32();
        (await client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name = ApiHelpers.UniqueName("Renamed") })).EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);

        (await client.DeleteAsync($"/api/teams/{teamId}")).EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);

        (await client.PatchAsJsonAsync($"/api/players/{player}", new { displayName = ApiHelpers.UniqueName("Edited") })).EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);

        (await client.PatchAsJsonAsync($"/api/players/{player}/team", new { teamId = targetTeam })).EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);

        (await client.PostAsync($"/api/players/{player}/promote", content: null)).EnsureSuccessStatusCode();
        AssertNotifiedOnce(spy, ref teams, ref scores);
    }

    [Fact]
    public async Task A_player_editing_their_own_names_notifies_teams_and_scores_once()
    {
        var (spy, client) = NewSpiedBrowser();
        await client.RegisterNewPlayerOnAsync(factory);
        int teams = spy.Teams, scores = spy.Scores;

        (await client.PatchAsJsonAsync("/api/players/me", new { displayName = ApiHelpers.UniqueName("Mine") })).EnsureSuccessStatusCode();

        AssertNotifiedOnce(spy, ref teams, ref scores);
    }

    [Fact]
    public async Task Rejected_and_no_op_writes_notify_nobody()
    {
        var (spy, client) = NewSpiedBrowser();
        var admin = await factory.CreateAdminAsync(client);
        var playerId = (await factory.RegisterNewPlayerAsync()).PlayerId;
        var currentTeam = await factory.WithDbAsync(async db => (await db.Players.FindAsync(playerId))!.TeamId!.Value);
        var other = await factory.CreateOtherEventAsync();
        var existingTeamName = (await factory.FirstTeamAsync()).Name;
        int teams = spy.Teams, scores = spy.Scores;

        var responses = new[]
        {
            await client.PostAsJsonAsync("/api/teams", new { name = existingTeamName, colorKey = ApiHelpers.UniqueName("c"), iconKey = "x" }),   // 409 duplicate name
            await client.PostAsJsonAsync("/api/teams", new { name = "A", colorKey = "Bad", iconKey = "" }),                               // 400
            await client.PatchAsJsonAsync("/api/teams/999999", new { name = "Whatever" }),                                                // 404
            await client.DeleteAsync($"/api/teams/{currentTeam}"),                                                                        // 409 has players
            await client.DeleteAsync($"/api/teams/{other.TeamId}"),                                                                       // 404 other event
            await client.PatchAsJsonAsync($"/api/players/{playerId}", new { }),                                                           // 400 nothing to change
            await client.PatchAsJsonAsync($"/api/players/{playerId}/team", new { teamId = currentTeam }),                                 // 200 but already there
            await client.PatchAsJsonAsync($"/api/players/{admin.PlayerId}/team", new { teamId = currentTeam }),                           // 400 admin
            await client.PostAsync($"/api/players/{admin.PlayerId}/promote", content: null),                                              // 200 already admin
        };

        Assert.Equal(
            [HttpStatusCode.Conflict, HttpStatusCode.BadRequest, HttpStatusCode.NotFound, HttpStatusCode.Conflict, HttpStatusCode.NotFound,
             HttpStatusCode.BadRequest, HttpStatusCode.OK, HttpStatusCode.BadRequest, HttpStatusCode.OK],
            responses.Select(r => r.StatusCode).ToArray());
        Assert.Equal(teams, spy.Teams);
        Assert.Equal(scores, spy.Scores);
    }

    [Fact]
    public async Task A_forbidden_write_by_a_player_notifies_nobody()
    {
        var (spy, client) = NewSpiedBrowser();
        await client.RegisterNewPlayerOnAsync(factory);
        int teams = spy.Teams, scores = spy.Scores;

        var response = await client.PostAsJsonAsync("/api/teams", new { name = "Sneaky", colorKey = "teal", iconKey = "x" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(teams, spy.Teams);
        Assert.Equal(scores, spy.Scores);
    }

    [Fact]
    public async Task Adjusting_and_reversing_scores_notify_scores_once_and_never_teams()
    {
        var (spy, client) = NewSpiedBrowser();
        await factory.CreateAdminAsync(client);
        var teamId = await factory.NewTeamIdAsync();
        var playerId = (await factory.RegisterNewPlayerAsync()).PlayerId;
        int teams = spy.Teams, scores = spy.Scores;

        var team = await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = teamId, amount = 5, direction = "add" });
        team.EnsureSuccessStatusCode();
        Assert.Equal(scores + 1, spy.Scores);

        (await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "player", targetId = playerId, amount = 2, direction = "remove" })).EnsureSuccessStatusCode();
        Assert.Equal(scores + 2, spy.Scores);

        var id = (await team.ReadJsonAsync()).GetProperty("id").GetInt64();
        (await client.PostAsync($"/api/scores/adjustments/{id}/reverse", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(scores + 3, spy.Scores);
        Assert.Equal(teams, spy.Teams);   // scoring doesn't change who is on which team
    }

    [Fact]
    public async Task Rejected_and_forbidden_score_writes_notify_nobody()
    {
        var (spy, client) = NewSpiedBrowser();
        var admin = await factory.CreateAdminAsync(client);
        var teamId = await factory.NewTeamIdAsync();
        var original = (await (await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = teamId, amount = 5, direction = "add" })).ReadJsonAsync()).GetProperty("id").GetInt64();
        (await client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null)).EnsureSuccessStatusCode();
        int teams = spy.Teams, scores = spy.Scores;

        var responses = new[]
        {
            await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = teamId, amount = 0, direction = "add" }),        // 400 invalid
            await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = 999_999, amount = 5, direction = "add" }),     // 400 no such team
            await client.PostAsJsonAsync("/api/scores/adjustments", new { target = "player", targetId = admin.PlayerId, amount = 5, direction = "add" }),   // 400 admin
            await client.PostAsync("/api/scores/adjustments/999999999/reverse", content: null),                                                      // 404
            await client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null),                                                    // 409 already reversed
        };

        Assert.Equal(
            [HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.NotFound, HttpStatusCode.Conflict],
            responses.Select(r => r.StatusCode).ToArray());

        Assert.Equal(teams, spy.Teams);
        Assert.Equal(scores, spy.Scores);

        // A player is turned away before the handler runs (a separate spy, since this one's client is the admin).
        var (playerSpy, playerClient) = NewSpiedBrowser();
        await playerClient.RegisterNewPlayerOnAsync(factory);
        var forbidden = await playerClient.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = teamId, amount = 5, direction = "add" });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(0, playerSpy.Scores);
    }
}

internal static class SpiedClientExtensions
{
    /// <summary>Registers a fresh player on the given client (so it is signed in as them) and returns the new player's id.</summary>
    public static async Task<int> RegisterNewPlayerOnAsync(this HttpClient client, ApiFactory factory)
    {
        var response = await client.RegisterAsync(ApiHelpers.UniqueName("SpyR"), ApiHelpers.UniqueName("SpyD"), await factory.FirstTeamIdAsync());
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync()).GetProperty("playerId").GetInt32();
    }
}
