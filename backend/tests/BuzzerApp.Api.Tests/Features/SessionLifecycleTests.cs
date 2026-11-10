using System.Net;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class SessionLifecycleTests(ApiFactory factory)
{
    [Fact]
    public async Task Me_without_a_cookie_is_401_problem_details_and_not_a_redirect()
    {
        var response = await factory.CreateBrowser().GetAsync("/api/session/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);   // the SPA needs a status code, never a login-page redirect
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Me_with_a_forged_cookie_is_401()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/session/me");
        request.Headers.Add("Cookie", "buzzer.auth=not-a-real-cookie");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_reads_the_current_names_and_team_from_the_database_not_the_cookie()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var secondTeamId = await factory.WithDbAsync(db => db.Teams.OrderBy(t => t.SortOrder).Skip(1).Select(t => t.Id).FirstAsync());
        await factory.WithDbAsync(async db =>
        {
            var p = await db.Players.SingleAsync(x => x.Id == player.PlayerId);
            p.SetDisplayName("Renamed Now");
            p.TeamId = secondTeamId;
            await db.SaveChangesAsync();
        });

        var me = await (await player.Client.GetAsync("/api/session/me")).ReadJsonAsync();

        Assert.Equal("Renamed Now", me.GetProperty("displayName").GetString());
        Assert.Equal(secondTeamId, me.GetProperty("teamId").GetInt32());
        Assert.Equal("Pay To Win", me.GetProperty("teamName").GetString());
    }

    [Fact]
    public async Task Me_returns_only_the_callers_own_real_name()
    {
        var alice = await factory.RegisterNewPlayerAsync("Alice");
        var bob = await factory.RegisterNewPlayerAsync("Bob");

        var json = await (await alice.Client.GetAsync("/api/session/me")).Content.ReadAsStringAsync();

        Assert.Contains(alice.RealName, json, StringComparison.Ordinal);
        Assert.DoesNotContain(bob.RealName, json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Me_for_a_player_who_no_longer_exists_is_401_and_clears_the_cookie()
    {
        var player = await factory.RegisterNewPlayerAsync();
        await factory.WithDbAsync(db => db.Players.Where(p => p.Id == player.PlayerId).ExecuteDeleteAsync());

        var response = await player.Client.GetAsync("/api/session/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=;", StringComparison.Ordinal));
        // The cleared cookie means the next call is a plain "not signed in".
        Assert.Equal(HttpStatusCode.Unauthorized, (await player.Client.GetAsync("/api/session/me")).StatusCode);
    }

    [Fact]
    public async Task Sign_out_is_204_clears_the_cookie_and_ends_the_session()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.PostAsync("/api/session/signout", content: null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=;", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.Unauthorized, (await player.Client.GetAsync("/api/session/me")).StatusCode);
    }

    [Fact]
    public async Task Sign_out_without_a_session_is_401()
    {
        var response = await factory.CreateBrowser().PostAsync("/api/session/signout", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Signing_out_one_browser_does_not_sign_out_another()
    {
        // The cookie is a self-contained ticket, not a server session: this documents that sign-out is per browser.
        var player = await factory.RegisterNewPlayerAsync();
        var other = factory.CreateBrowser();
        await other.SignInAsync(player.RealName);

        await player.Client.PostAsync("/api/session/signout", content: null);

        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/session/me")).StatusCode);
    }

    [Fact]
    public async Task Me_for_an_admin_has_the_admin_role_and_no_team()
    {
        var admin = factory.CreateBrowser();
        await admin.SignInAsync(ApiFactory.AdminRealName, ApiFactory.AdminPin);

        var me = await (await admin.GetAsync("/api/session/me")).ReadJsonAsync();

        Assert.Equal("admin", me.GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, me.GetProperty("teamId").ValueKind);
    }

    [Fact]
    public async Task A_fresh_cookie_is_not_reissued_on_every_request()
    {
        // Sliding expiry only re-issues the cookie once more than half its lifetime has passed,
        // so ordinary requests don't churn Set-Cookie headers.
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.GetAsync("/api/session/me");

        Assert.Empty(response.SetCookieHeaders());
    }
}
