using System.Net;
using System.Security.Claims;
using BuzzerApp.Api.Common;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class AuthorizationTests(ApiFactory factory)
{
    private static ClaimsPrincipal PrincipalFor(PlayerRole role) =>
        CurrentUser.CreatePrincipal(
            new Player(1, "Some Body", "Somebody", role, role == PlayerRole.Player ? 1 : null, DateTimeOffset.UnixEpoch) { Id = 5 },
            CookieAuthenticationDefaults.AuthenticationScheme);

    private async Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, string? policy)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();
        return policy is null
            ? await auth.AuthorizeAsync(user, resource: null, new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            : await auth.AuthorizeAsync(user, policy);
    }

    [Fact]
    public async Task The_admin_policy_accepts_admins()
    {
        Assert.True((await AuthorizeAsync(PrincipalFor(PlayerRole.Admin), AuthPolicies.Admin)).Succeeded);
    }

    [Fact]
    public async Task The_admin_policy_rejects_players()
    {
        Assert.False((await AuthorizeAsync(PrincipalFor(PlayerRole.Player), AuthPolicies.Admin)).Succeeded);
    }

    [Fact]
    public async Task The_admin_policy_rejects_anonymous_callers()
    {
        Assert.False((await AuthorizeAsync(new ClaimsPrincipal(new ClaimsIdentity()), AuthPolicies.Admin)).Succeeded);
    }

    [Fact]
    public async Task The_fallback_policy_requires_a_signed_in_user()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var provider = scope.ServiceProvider.GetRequiredService<IAuthorizationPolicyProvider>();

        var fallback = await provider.GetFallbackPolicyAsync();

        Assert.NotNull(fallback);   // endpoints are private unless they say AllowAnonymous
        Assert.Contains(fallback.Requirements, r => r is Microsoft.AspNetCore.Authorization.Infrastructure.DenyAnonymousAuthorizationRequirement);
    }

    [Fact]
    public async Task Access_denied_is_a_403_status_code_and_never_a_redirect()
    {
        // No admin-only route exists yet (B4), so the cookie handler's event is exercised directly.
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);
        var http = new DefaultHttpContext();
        var context = new RedirectContext<CookieAuthenticationOptions>(
            http, new AuthenticationScheme("c", null, typeof(CookieAuthenticationHandler)),
            options, new AuthenticationProperties(), "/login");

        await options.Events.OnRedirectToAccessDenied(context);

        Assert.Equal(StatusCodes.Status403Forbidden, http.Response.StatusCode);
        Assert.False(http.Response.Headers.ContainsKey("Location"));
    }

    [Fact]
    public async Task Login_required_is_a_401_status_code_and_never_a_redirect()
    {
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);
        var http = new DefaultHttpContext();
        var context = new RedirectContext<CookieAuthenticationOptions>(
            http, new AuthenticationScheme("c", null, typeof(CookieAuthenticationHandler)),
            options, new AuthenticationProperties(), "/login");

        await options.Events.OnRedirectToLogin(context);

        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
        Assert.False(http.Response.Headers.ContainsKey("Location"));
    }

    [Fact]
    public void The_cookie_is_configured_for_a_thirty_day_sliding_expiry()
    {
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);

        Assert.Equal(TimeSpan.FromDays(30), options.ExpireTimeSpan);
        Assert.True(options.SlidingExpiration);
        Assert.True(options.Cookie.HttpOnly);
        Assert.Equal(SameSiteMode.Lax, options.Cookie.SameSite);
    }

    [Fact]
    public async Task OpenApi_document_stays_reachable_without_signing_in_during_development()
    {
        var response = await factory.CreateBrowser().GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
