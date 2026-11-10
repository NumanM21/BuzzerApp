using System.Net;
using System.Net.Http.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class RegisterTests(ApiFactory factory)
{
    [Fact]
    public async Task Valid_registration_returns_201_and_the_callers_own_details()
    {
        var client = factory.CreateBrowser();
        var teamId = await factory.FirstTeamIdAsync();
        var real = ApiHelpers.UniqueName("Real");
        var display = ApiHelpers.UniqueName("Disp");

        var response = await client.RegisterAsync(real, display, teamId);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("/api/session/me", response.Headers.Location?.OriginalString);
        var me = await response.ReadJsonAsync();
        Assert.Equal(real, me.GetProperty("realName").GetString());
        Assert.Equal(display, me.GetProperty("displayName").GetString());
        Assert.Equal("player", me.GetProperty("role").GetString());   // enum serialised as a camelCase string
        Assert.Equal(teamId, me.GetProperty("teamId").GetInt32());
        Assert.Equal(await factory.TeamNameAsync(teamId), me.GetProperty("teamName").GetString());
    }

    [Fact]
    public async Task Registration_signs_the_player_in_so_me_works_straight_away()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var me = await player.Client.GetAsync("/api/session/me");

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(player.PlayerId, (await me.ReadJsonAsync()).GetProperty("playerId").GetInt32());
    }

    [Fact]
    public async Task The_auth_cookie_is_http_only_lax_persistent_and_not_secure_in_development()
    {
        var response = await factory.CreateBrowser().RegisterAsync(
            ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), await factory.FirstTeamIdAsync());

        var cookie = Assert.Single(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=", StringComparison.Ordinal));
        var attributes = cookie.Split(';', StringSplitOptions.TrimEntries).Skip(1).Select(a => a.ToLowerInvariant()).ToList();
        Assert.Contains("httponly", attributes);
        Assert.Contains("samesite=lax", attributes);
        Assert.Contains(attributes, a => a.StartsWith("expires=", StringComparison.Ordinal));   // persistent, not a session cookie
        // Phones on the venue LAN use plain http; a Secure cookie would never be stored.
        Assert.DoesNotContain("secure", attributes);
    }

    [Fact]
    public async Task The_cookie_value_does_not_contain_names()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().SignInAsync(player.RealName);
        var cookie = Assert.Single(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=", StringComparison.Ordinal));

        // The cookie is encrypted, so a readable name in it would mean a claim was added (D23).
        Assert.DoesNotContain(player.RealName, cookie, StringComparison.Ordinal);
        Assert.DoesNotContain(player.DisplayName, cookie, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_pin_is_stored_hashed_never_in_plain_text()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var stored = await factory.GetPlayerAsync(player.PlayerId);

        Assert.NotEqual(ApiHelpers.DefaultPin, stored.PinHash);
        Assert.True(stored.PinHash.Length > 40);
    }

    [Fact]
    public async Task Names_are_trimmed_before_they_are_stored()
    {
        var real = ApiHelpers.UniqueName("Trim");
        var display = ApiHelpers.UniqueName("Tdsp");

        var response = await factory.CreateBrowser().RegisterAsync($"   {real}  ", $" {display} ", await factory.FirstTeamIdAsync());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var me = await response.ReadJsonAsync();
        Assert.Equal(real, me.GetProperty("realName").GetString());
        Assert.Equal(display, me.GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task A_client_cannot_make_itself_an_admin_by_sending_a_role()
    {
        var response = await factory.CreateBrowser().PostAsJsonAsync("/api/session/register", new
        {
            joinCode = ApiFactory.JoinCode,
            realName = ApiHelpers.UniqueName("Sneak"),
            displayName = ApiHelpers.UniqueName("Snk"),
            pin = "1111",
            teamId = await factory.FirstTeamIdAsync(),
            role = "admin",
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("player", (await response.ReadJsonAsync()).GetProperty("role").GetString());
    }

    [Fact]
    public async Task A_client_supplied_player_or_event_id_is_ignored()
    {
        var response = await factory.CreateBrowser().PostAsJsonAsync("/api/session/register", new
        {
            joinCode = ApiFactory.JoinCode,
            realName = ApiHelpers.UniqueName("Spoof"),
            displayName = ApiHelpers.UniqueName("Spf"),
            pin = "1111",
            teamId = await factory.FirstTeamIdAsync(),
            id = 1,
            playerId = 1,
            eventId = 999,
        });

        Assert.NotEqual(1, (await response.ReadJsonAsync()).GetProperty("playerId").GetInt32());   // 1 is the seeded admin
    }

    [Fact]
    public async Task Same_real_name_in_a_different_case_and_spacing_is_a_409_that_says_to_sign_in()
    {
        var first = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().RegisterAsync(
            $"  {first.RealName.ToUpperInvariant()} ", ApiHelpers.UniqueName("Other"), first.TeamId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("Sign in", (await response.ReadJsonAsync()).GetProperty("detail").GetString());
        Assert.Empty(response.SetCookieHeaders());   // a failed registration must not sign anyone in
    }

    [Fact]
    public async Task Same_display_name_in_a_different_case_is_a_409_that_asks_for_another_name()
    {
        var first = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().RegisterAsync(
            ApiHelpers.UniqueName("Real"), first.DisplayName.ToLowerInvariant(), first.TeamId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("display name", (await response.ReadJsonAsync()).GetProperty("detail").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Real_and_display_names_are_separate_namespaces()
    {
        var first = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), first.RealName, first.TeamId);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Concurrent_registrations_of_the_same_real_name_produce_exactly_one_player()
    {
        // Several can pass the "name free?" pre-check; the unique index must turn the losers into 409s, not 500s.
        var real = ApiHelpers.UniqueName("Race");
        var teamId = await factory.FirstTeamIdAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(i =>
            factory.CreateBrowser().RegisterAsync(real, ApiHelpers.UniqueName($"Rc{i}"), teamId)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        var stored = await factory.WithDbAsync(db => db.Players.CountAsync(p => p.NormalizedRealName == real.ToUpperInvariant()));
        Assert.Equal(1, stored);
    }

    [Fact]
    public async Task Concurrent_registrations_of_the_same_display_name_produce_exactly_one_player()
    {
        var display = ApiHelpers.UniqueName("RaceD");
        var teamId = await factory.FirstTeamIdAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), display, teamId)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Invalid_fields_return_400_listing_every_problem_at_once()
    {
        var response = await factory.CreateBrowser().PostAsJsonAsync("/api/session/register",
            new { joinCode = ApiFactory.JoinCode, realName = "A", displayName = "", pin = "12a4", teamId = 1 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadJsonAsync()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("realName", out _));
        Assert.True(errors.TryGetProperty("displayName", out _));
        Assert.True(errors.TryGetProperty("pin", out _));
    }

    [Theory]
    [InlineData("123")]
    [InlineData("12345")]
    [InlineData("abcd")]
    [InlineData("")]
    public async Task A_bad_pin_is_rejected(string pin)
    {
        var response = await factory.CreateBrowser().RegisterAsync(
            ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), await factory.FirstTeamIdAsync(), pin);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_missing_body_is_400()
    {
        var response = await factory.CreateBrowser().PostAsync("/api/session/register", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_wrong_join_code_is_404_and_creates_nobody()
    {
        var real = ApiHelpers.UniqueName("Real");

        var response = await factory.CreateBrowser().RegisterAsync(
            real, ApiHelpers.UniqueName("Disp"), await factory.FirstTeamIdAsync(), joinCode: "WRONG");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(await factory.WithDbAsync(db => db.Players.AnyAsync(p => p.NormalizedRealName == real.ToUpperInvariant())));
    }

    [Fact]
    public async Task The_join_code_is_matched_case_insensitively_and_trimmed()
    {
        var response = await factory.CreateBrowser().RegisterAsync(
            ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), await factory.FirstTeamIdAsync(), joinCode: " test-2026 ");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData(9999)]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task A_team_that_does_not_exist_in_the_event_is_a_400_on_teamId(int teamId)
    {
        var response = await factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), teamId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.ReadJsonAsync()).GetProperty("errors").TryGetProperty("teamId", out _));
    }

    [Fact]
    public async Task The_registered_player_lands_on_the_chosen_team_with_the_player_role()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var stored = await factory.GetPlayerAsync(player.PlayerId);

        Assert.Equal(PlayerRole.Player, stored.Role);
        Assert.Equal(player.TeamId, stored.TeamId);
    }
}
