using System.Security.Claims;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;

namespace BuzzerApp.Api.Common;

public static class AuthPolicies
{
    public const string Admin = "Admin";
}

public static class AppClaims
{
    // Only these three claims exist (D23). TeamId and names are deliberately absent: they change
    // (moves, renames) and a cookie can't be updated from the server, so they are always read from the DB.
    public const string EventId = "event_id";
    public const string PlayerId = ClaimTypes.NameIdentifier;
    public const string Role = ClaimTypes.Role;
}

public static class AuthSetup
{
    public const string CookieName = "buzzer.auth";

    public static IServiceCollection AddAppAuth(this IServiceCollection services, IWebHostEnvironment env)
    {
        services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = CookieName;
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                // Phones on the venue LAN reach the dev server over plain http, and a Secure cookie
                // would silently never be stored. Production is https only.
                options.Cookie.SecurePolicy = env.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromDays(30);
                options.SlidingExpiration = true;

                // This is an API: the SPA needs a status code, never a redirect to a login page it can't render.
                options.Events.OnRedirectToLogin = ctx =>
                {
                    ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = ctx =>
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthPolicies.Admin, p => p.RequireRole(nameof(PlayerRole.Admin)))
            // Secure by default: a new endpoint that forgets a policy is private, not public.
            // Public endpoints must say AllowAnonymous() explicitly.
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        return services;
    }
}
