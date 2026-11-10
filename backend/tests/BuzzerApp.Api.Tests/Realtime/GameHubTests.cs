using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Rounds;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace BuzzerApp.Api.Tests.Realtime;

/// <summary>Who may connect, what each audience receives on connect, and which hub methods each role may call (§8.7).</summary>
[Collection(ApiCollection.Name)]
public class GameHubTests(ApiFactory factory)
{
    private HttpClient RawClient() =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });

    [Fact]
    public async Task An_anonymous_connection_is_refused_with_401()
    {
        var ex = await Assert.ThrowsAsync<HttpRequestException>(() => factory.ConnectGameAsync(cookie: null));

        Assert.Equal(HttpStatusCode.Unauthorized, ex.StatusCode);
    }

    [Fact]
    public async Task A_player_signed_in_through_the_api_gets_the_public_snapshot_on_connect_and_never_the_admin_one()
    {
        var cookie = (await RawClient().RegisterAsync(ApiHelpers.UniqueName("HubR"), ApiHelpers.UniqueName("HubD"), await factory.FirstTeamIdAsync())).AuthCookie();

        await using var player = await factory.ConnectGameAsync(cookie);
        var snapshot = await player.Public.NextAsync();
        await player.BarrierAsync();

        // Pins the wire format the frontend reads: camelCase fields, string enums, and no admin-only fields.
        Assert.Equal(
            ["version", "roundId", "phase", "roundStartedAt", "teamQueue", "currentTeamId", "windowEndsAt", "serverNow"],
            snapshot.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(JsonValueKind.String, snapshot.GetProperty("phase").ValueKind);
        Assert.Empty(player.Admin.All);
    }

    [Fact]
    public async Task An_admin_signed_in_through_the_api_gets_both_snapshots_on_connect()
    {
        var admin = await factory.CreateAdminAsync();
        var cookie = (await RawClient().SignInAsync(admin.RealName)).AuthCookie();

        await using var client = await factory.ConnectGameAsync(cookie);
        var pub = await client.Public.NextAsync();
        var adm = await client.Admin.NextAsync();

        Assert.Equal(pub.Version(), adm.Version());
        Assert.True(adm.TryGetProperty("buzzes", out _));
        Assert.True(adm.TryGetProperty("currentSince", out _));
    }

    [Fact]
    public async Task Players_cannot_run_rounds_and_admins_cannot_buzz()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 1);
        await using var host = GameHost.Start(factory);
        await using var player = await host.ConnectAsync(ev.PlayersByTeam[0][0]);
        await using var admin = await host.ConnectAsync(ev.Admin);

        foreach (var method in new[] { "BeginRound", "NextTeam", "ResetRound" })
        {
            var ex = await Assert.ThrowsAsync<HubException>(() => player.InvokeAsync(method));
            Assert.Contains("unauthorized", ex.Message, StringComparison.OrdinalIgnoreCase);
        }

        await Assert.ThrowsAsync<HubException>(() => admin.InvokeAsync("Buzz"));

        Assert.Equal(RoundPhase.Idle, host.Rounds.GetPublicSnapshot().Phase);
        Assert.Equal(0, host.Rounds.GetPublicSnapshot().Version);
    }

    [Fact]
    public async Task Buzz_takes_no_player_or_team_from_the_client()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 1);
        await using var host = GameHost.Start(factory);
        await using var player = await host.ConnectAsync(ev.PlayersByTeam[0][0]);

        // D8: there is no parameter to fake, so a client that tries to name someone else is turned away.
        await Assert.ThrowsAsync<HubException>(() => player.Connection.InvokeAsync<JsonElement>("Buzz", ev.PlayersByTeam[1][0].Id));
    }

    [Fact]
    public async Task Rest_writes_reach_connected_clients_as_change_notifications()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();
        var cookie = (await RawClient().SignInAsync(player.RealName)).AuthCookie();
        await using var client = await factory.ConnectGameAsync(cookie);

        var teamId = await admin.CreateTeamAsync();
        await client.TeamsChanged.NextAsync();
        await client.ScoresChanged.NextAsync();

        (await admin.Client.PostAsJsonAsync("/api/scores/adjustments", new { target = "team", targetId = teamId, amount = 3, direction = "add" }))
            .EnsureSuccessStatusCode();
        await client.ScoresChanged.NextAsync();
        await client.BarrierAsync();

        Assert.Single(client.TeamsChanged.All);    // scoring sends ScoresChanged only
        Assert.Equal(2, client.ScoresChanged.All.Count);
    }
}
