using System.Net;
using BuzzerApp.Api.Tests.Infrastructure;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// Runs on its own factory (and database) because it lowers the per-IP limit to something testable,
/// and the shared factory deliberately lifts it so the other tests aren't throttled.
/// </summary>
public class JoinCodeRateLimitTests(JoinCodeRateLimitTests.LowLimitFactory factory) : IClassFixture<JoinCodeRateLimitTests.LowLimitFactory>
{
    public sealed class LowLimitFactory : ApiFactory
    {
        protected override int JoinCodePerMinute => 3;
    }

    [Fact]
    public async Task Registration_and_team_lookup_share_a_per_ip_limit_that_returns_429_with_retry_after()
    {
        var client = factory.CreateBrowser();
        var teamId = await factory.FirstTeamIdAsync();

        // Three permits, shared across both endpoints: two lookups and one registration.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/event/teams?code={ApiFactory.JoinCode}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/event/teams?code={ApiFactory.JoinCode}")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.RegisterAsync(ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), teamId)).StatusCode);

        var limited = await client.RegisterAsync(ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), teamId);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.Contains("Retry-After"));
        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Sign_in_is_not_covered_by_the_per_ip_limit()
    {
        // Sign-in is limited per real name instead, so a shared venue IP can't lock everyone out.
        var client = factory.CreateBrowser();

        for (var i = 0; i < 10; i++)
        {
            var response = await client.SignInAsync(ApiFactory.AdminRealName, ApiFactory.AdminPin, ApiFactory.JoinCode);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                // Only the per-name throttle (5 attempts) may produce this, never the per-IP policy (3).
                Assert.True(i >= 5, $"throttled after only {i} attempts");
                return;
            }
        }

        Assert.Fail("expected the per-name sign-in throttle to engage by the 6th attempt");
    }
}
