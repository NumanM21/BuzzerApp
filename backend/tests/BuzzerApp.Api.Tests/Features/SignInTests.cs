using System.Net;
using System.Net.Http.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class SignInTests(ApiFactory factory)
{
    [Fact]
    public async Task Signing_in_with_the_right_pin_returns_200_and_a_cookie_that_works()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var browser = factory.CreateBrowser();

        var response = await browser.SignInAsync(player.RealName);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=", StringComparison.Ordinal));
        var me = await (await browser.GetAsync("/api/session/me")).ReadJsonAsync();
        Assert.Equal(player.PlayerId, me.GetProperty("playerId").GetInt32());
    }

    [Theory]
    [InlineData("upper")]
    [InlineData("lower")]
    [InlineData("padded")]
    public async Task The_real_name_is_matched_ignoring_case_and_surrounding_spaces(string variant)
    {
        var player = await factory.RegisterNewPlayerAsync();
        var typed = variant switch
        {
            "upper" => player.RealName.ToUpperInvariant(),
            "lower" => player.RealName.ToLowerInvariant(),
            _ => $"   {player.RealName}  ",
        };

        var response = await factory.CreateBrowser().SignInAsync(typed);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_join_code_is_matched_ignoring_case()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().SignInAsync(player.RealName, joinCode: "test-2026");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_seeded_admin_can_sign_in_and_has_the_admin_role_and_no_team()
    {
        var response = await factory.CreateBrowser().SignInAsync(ApiFactory.AdminRealName, ApiFactory.AdminPin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await response.ReadJsonAsync();
        Assert.Equal("admin", me.GetProperty("role").GetString());
        Assert.Equal("Test Boss", me.GetProperty("displayName").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, me.GetProperty("teamId").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, me.GetProperty("teamName").ValueKind);
    }

    [Fact]
    public async Task A_wrong_pin_is_401_and_sets_no_cookie()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().SignInAsync(player.RealName, "0000");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(response.SetCookieHeaders());
    }

    [Fact]
    public async Task Wrong_pin_unknown_name_and_wrong_join_code_are_indistinguishable()
    {
        // Any difference would let someone discover which real names are registered.
        var player = await factory.RegisterNewPlayerAsync();
        var wrongPin = await factory.CreateBrowser().SignInAsync(player.RealName, "0000");
        var unknownName = await factory.CreateBrowser().SignInAsync(ApiHelpers.UniqueName("Ghost"), "0000");
        var wrongCode = await factory.CreateBrowser().SignInAsync(player.RealName, ApiHelpers.DefaultPin, joinCode: "WRONG");

        foreach (var response in new[] { wrongPin, unknownName, wrongCode })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        }

        var titles = new List<string?>();
        foreach (var response in new[] { wrongPin, unknownName, wrongCode })
        {
            titles.Add((await response.ReadJsonAsync()).GetProperty("title").GetString());
        }

        Assert.Single(titles.Distinct());
        Assert.Equal("Real name or PIN is incorrect.", titles[0]);
    }

    [Theory]
    [InlineData("A", "1234")]
    [InlineData("Valid Name", "12")]
    [InlineData("Valid Name", "abcd")]
    [InlineData("", "1234")]
    public async Task Malformed_input_is_a_400_validation_error(string realName, string pin)
    {
        var response = await factory.CreateBrowser().SignInAsync(realName, pin);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Malformed_json_is_400_not_a_server_error()
    {
        using var content = new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json");

        var response = await factory.CreateBrowser().PostAsync("/api/session/signin", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_missing_body_is_400()
    {
        var response = await factory.CreateBrowser().PostAsync("/api/session/signin", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_sixth_attempt_for_one_name_is_429_with_retry_after_even_with_the_right_pin()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var browser = factory.CreateBrowser();

        for (var i = 1; i <= 5; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.SignInAsync(player.RealName, "0000")).StatusCode);
        }

        var sixth = await browser.SignInAsync(player.RealName, ApiHelpers.DefaultPin);

        Assert.Equal(HttpStatusCode.TooManyRequests, sixth.StatusCode);
        Assert.True(sixth.Headers.TryGetValues("Retry-After", out var retry));
        Assert.True(int.Parse(retry.Single(), System.Globalization.CultureInfo.InvariantCulture) > 0);
        Assert.Empty(sixth.SetCookieHeaders());
    }

    [Fact]
    public async Task Throttling_one_name_does_not_affect_another_name_from_the_same_ip()
    {
        // The whole venue shares one public IP, so the limit must be per name (D24).
        var victim = await factory.RegisterNewPlayerAsync();
        var bystander = await factory.RegisterNewPlayerAsync();
        var browser = factory.CreateBrowser();
        for (var i = 0; i < 6; i++)
        {
            await browser.SignInAsync(victim.RealName, "0000");
        }

        var response = await browser.SignInAsync(bystander.RealName);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_limit_also_counts_unknown_names_so_it_cannot_reveal_who_exists()
    {
        var ghost = ApiHelpers.UniqueName("Ghost");
        var browser = factory.CreateBrowser();
        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.SignInAsync(ghost, "0000")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await browser.SignInAsync(ghost, "0000")).StatusCode);
    }

    [Fact]
    public async Task The_limit_uses_the_normalized_name_so_changing_case_does_not_reset_it()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var browser = factory.CreateBrowser();
        for (var i = 0; i < 5; i++)
        {
            await browser.SignInAsync(i % 2 == 0 ? player.RealName.ToUpperInvariant() : player.RealName.ToLowerInvariant(), "0000");
        }

        var response = await browser.SignInAsync($"  {player.RealName}  ", ApiHelpers.DefaultPin);

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task Malformed_requests_do_not_use_up_attempts()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var browser = factory.CreateBrowser();
        for (var i = 0; i < 10; i++)
        {
            await browser.SignInAsync(player.RealName, "bad");   // fails validation before the throttle
        }

        Assert.Equal(HttpStatusCode.OK, (await browser.SignInAsync(player.RealName)).StatusCode);
    }

    [Fact]
    public async Task An_outdated_pin_hash_is_upgraded_on_a_successful_sign_in()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var stored = await factory.GetPlayerAsync(player.PlayerId);
        // A hash made with far fewer PBKDF2 iterations than the current default: right PIN, but "rehash needed".
        var weakHash = new PasswordHasher<Player>(Options.Create(new PasswordHasherOptions { IterationCount = 1000 }))
            .HashPassword(stored, ApiHelpers.DefaultPin);
        await factory.WithDbAsync(db => db.Players.Where(p => p.Id == player.PlayerId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.PinHash, weakHash)));

        var response = await factory.CreateBrowser().SignInAsync(player.RealName);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var upgraded = (await factory.GetPlayerAsync(player.PlayerId)).PinHash;
        Assert.NotEqual(weakHash, upgraded);
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateBrowser().SignInAsync(player.RealName)).StatusCode);   // new hash still verifies
    }

    [Fact]
    public async Task Signing_in_on_a_second_browser_leaves_the_first_signed_in()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var other = factory.CreateBrowser();

        await other.SignInAsync(player.RealName);

        Assert.Equal(HttpStatusCode.OK, (await player.Client.GetAsync("/api/session/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/session/me")).StatusCode);
    }

    [Fact]
    public async Task Sign_in_returns_the_players_team_from_the_database()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await factory.CreateBrowser().PostAsJsonAsync("/api/session/signin",
            new { joinCode = ApiFactory.JoinCode, realName = player.RealName, pin = ApiHelpers.DefaultPin });

        var me = await response.ReadJsonAsync();
        Assert.Equal(player.TeamId, me.GetProperty("teamId").GetInt32());
        Assert.Equal("Rage Quitters", me.GetProperty("teamName").GetString());
    }
}
