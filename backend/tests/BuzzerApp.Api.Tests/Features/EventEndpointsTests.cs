using System.Net;
using BuzzerApp.Api.Tests.Infrastructure;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class EventEndpointsTests(ApiFactory factory)
{
    [Fact]
    public async Task Get_event_is_public_and_returns_the_active_events_theme()
    {
        var response = await factory.CreateBrowser().GetAsync("/api/event");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal("Sully's 5th Annual Games Night", body.GetProperty("name").GetString());
        Assert.Equal(2026, body.GetProperty("year").GetInt32());
        Assert.Equal("arcade-2026", body.GetProperty("themeKey").GetString());
    }

    [Fact]
    public async Task Get_event_does_not_leak_the_join_code()
    {
        var json = await (await factory.CreateBrowser().GetAsync("/api/event")).Content.ReadAsStringAsync();

        Assert.DoesNotContain(ApiFactory.JoinCode, json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(ApiFactory.JoinCode)]
    [InlineData("test-2026")]       // case-insensitive
    [InlineData("  TEST-2026  ")]   // trimmed
    public async Task Teams_with_a_valid_code_lists_the_six_seeded_teams_in_order(string code)
    {
        var response = await factory.CreateBrowser().GetAsync($"/api/event/teams?code={Uri.EscapeDataString(code)}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var teams = (await response.ReadJsonAsync()).EnumerateArray().ToList();
        Assert.Equal(
            ["Rage Quitters", "Pay To Win", "Cheat Codes", "Smurfs", "AFK Allstars", "RNG Lovers"],
            teams.Select(t => t.GetProperty("name").GetString()!).ToArray());
        Assert.Equal("red", teams[0].GetProperty("colorKey").GetString());
        Assert.Equal("rage-quitters", teams[0].GetProperty("iconKey").GetString());
    }

    [Theory]
    [InlineData("WRONG")]
    [InlineData("")]
    public async Task Teams_with_a_wrong_or_empty_code_is_404_problem_details(string code)
    {
        var response = await factory.CreateBrowser().GetAsync($"/api/event/teams?code={code}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Teams_without_a_code_parameter_is_404()
    {
        var response = await factory.CreateBrowser().GetAsync("/api/event/teams");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Member_count_goes_up_when_a_player_registers()
    {
        var client = factory.CreateBrowser();
        var before = await MemberCountOfFirstTeamAsync(client);

        await factory.RegisterNewPlayerAsync();

        Assert.Equal(before + 1, await MemberCountOfFirstTeamAsync(client));
    }

    [Fact]
    public async Task Member_count_covers_team_members_only_so_admins_are_not_counted()
    {
        var teams = await factory.CreateBrowser().GetAsync($"/api/event/teams?code={ApiFactory.JoinCode}");
        var total = (await teams.ReadJsonAsync()).EnumerateArray().Sum(t => t.GetProperty("memberCount").GetInt32());
        var onTeams = await factory.WithDbAsync(db => Task.FromResult(db.Players.Count(p => p.TeamId != null)));

        Assert.Equal(onTeams, total);
    }

    [Fact]
    public async Task An_unknown_route_is_401_when_anonymous_because_the_fallback_policy_makes_everything_private()
    {
        var response = await factory.CreateBrowser().GetAsync("/api/nope");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_route_is_404_once_signed_in()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.GetAsync("/api/nope");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static async Task<int> MemberCountOfFirstTeamAsync(HttpClient client)
    {
        var response = await client.GetAsync($"/api/event/teams?code={ApiFactory.JoinCode}");
        return (await response.ReadJsonAsync()).EnumerateArray().First().GetProperty("memberCount").GetInt32();
    }
}
