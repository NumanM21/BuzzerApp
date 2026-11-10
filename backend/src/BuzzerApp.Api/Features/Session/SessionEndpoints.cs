using BuzzerApp.Api.Common;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace BuzzerApp.Api.Features.Session;

/// <summary>The session routes. <see cref="SessionService"/> decides who the caller is; this file owns the auth cookie.</summary>
public static class SessionEndpoints
{
    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/session");

        group.MapPost("/register", RegisterAsync).AllowAnonymous().RequireRateLimiting(RateLimitPolicies.JoinCode);
        group.MapPost("/signin", SignInAsync).AllowAnonymous();
        group.MapPost("/signout", SignOutAsync);
        group.MapGet("/me", MeAsync);
        return app;
    }

    private static async Task<IResult> RegisterAsync(RegisterRequest request, SessionService sessions, HttpContext http, CancellationToken ct)
    {
        var result = await sessions.RegisterAsync(request, ct);
        if (!result.IsSuccess)
        {
            return result.Error!.ToHttp();
        }

        await IssueCookieAsync(http, result.Value.Player);
        return Results.Created("/api/session/me", result.Value.Me);
    }

    private static async Task<IResult> SignInAsync(SignInRequest request, SessionService sessions, HttpContext http, CancellationToken ct)
    {
        var result = await sessions.SignInAsync(request, ct);
        if (!result.IsSuccess)
        {
            return result.Error!.ToHttp();
        }

        await IssueCookieAsync(http, result.Value.Player);
        return Results.Ok(result.Value.Me);
    }

    // A plain RequestDelegate (HttpContext in, Task out): it writes the status itself instead of returning an IResult.
    private static async Task SignOutAsync(HttpContext http)
    {
        await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        http.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    private static async Task<IResult> MeAsync(ICurrentUser user, SessionService sessions, HttpContext http, CancellationToken ct)
    {
        var result = await sessions.FindCurrentAsync(user.PlayerId, ct);
        if (!result.IsSuccess)
        {
            // Drop the stale cookie so the client lands on the join page instead of asking again.
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return result.Error!.ToHttp();
        }

        // The role is a claim, and a cookie can't be changed from the server, so a player promoted to admin would keep
        // getting 403 until they signed in again. Re-issuing the cookie here fixes that on the app's next start or refetch.
        var player = result.Value.Player;
        if (user.IsAdmin != (player.Role == PlayerRole.Admin))
        {
            await IssueCookieAsync(http, player);
        }

        return Results.Ok(result.Value.Me);
    }

    private static Task IssueCookieAsync(HttpContext http, Player player) =>
        http.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            CurrentUser.CreatePrincipal(player, CookieAuthenticationDefaults.AuthenticationScheme),
            // Persistent: phones should stay signed in after the browser is closed (D22).
            new AuthenticationProperties { IsPersistent = true });
}
