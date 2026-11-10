using System.Globalization;
using BuzzerApp.Api.Common;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Session;

public static class SessionEndpoints
{
    public sealed record RegisterRequest(string? JoinCode, string? RealName, string? DisplayName, string? Pin, int? TeamId);

    public sealed record SignInRequest(string? JoinCode, string? RealName, string? Pin);

    public sealed record MeResponse(int PlayerId, string RealName, string DisplayName, PlayerRole Role, int? TeamId, string? TeamName);

    // One message for "no such player" and "wrong PIN" (and a wrong join code), so the response can't be used to find real names.
    private const string BadCredentials = "Real name or PIN is incorrect.";

    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/session");

        group.MapPost("/register", RegisterAsync).AllowAnonymous().RequireRateLimiting(RateLimitPolicies.JoinCode);
        group.MapPost("/signin", SignInAsync).AllowAnonymous();
        group.MapPost("/signout", SignOutAsync);
        group.MapGet("/me", MeAsync);
        return app;
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        HttpContext http,
        AppDbContext db,
        IPinHasher pinHasher,
        TimeProvider time,
        CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .Required("joinCode", request.JoinCode, "The join code")
            .PersonName("realName", request.RealName, "Real name")
            .PersonName("displayName", request.DisplayName, "Display name")
            .Pin("pin", request.Pin)
            .Positive("teamId", request.TeamId, "A team");
        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, request.JoinCode, ct);
        if (eventId is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "That join code is not recognised.");
        }

        // Scoped to the event: a team id from another event (or a made-up one) is just "not a valid team".
        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Id == request.TeamId && t.EventId == eventId)
            .Select(t => new { t.Id, t.Name })
            .SingleOrDefaultAsync(ct);
        if (team is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["teamId"] = ["Choose one of the listed teams."] });
        }

        var realName = request.RealName!;
        var displayName = request.DisplayName!;
        var normalizedReal = NameNormalizer.Normalize(realName);
        var normalizedDisplay = NameNormalizer.Normalize(displayName);

        if (await db.Players.AnyAsync(p => p.EventId == eventId && p.NormalizedRealName == normalizedReal, ct))
        {
            return NameTaken(RealNameTaken);
        }

        if (await db.Players.AnyAsync(p => p.EventId == eventId && p.NormalizedDisplayName == normalizedDisplay, ct))
        {
            return NameTaken(DisplayNameTaken);
        }

        var player = new Player(eventId.Value, realName, displayName, PlayerRole.Player, team.Id, time.GetUtcNow());
        player.PinHash = pinHasher.Hash(player, request.Pin!);
        db.Players.Add(player);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out var constraint))
        {
            // Two phones registering the same name at once both pass the pre-checks above; the unique index decides.
            return NameTaken(constraint is not null && constraint.Contains("NormalizedDisplayName", StringComparison.Ordinal)
                ? DisplayNameTaken
                : RealNameTaken);
        }

        await SignInPlayerAsync(http, player);
        var me = new MeResponse(player.Id, player.RealName, player.DisplayName, player.Role, player.TeamId, team.Name);
        return Results.Created("/api/session/me", me);
    }

    private static async Task<IResult> SignInAsync(
        SignInRequest request,
        HttpContext http,
        AppDbContext db,
        IPinHasher pinHasher,
        PinDecoy decoy,
        SignInThrottle throttle,
        CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .Required("joinCode", request.JoinCode, "The join code")
            .PersonName("realName", request.RealName, "Real name")
            .Pin("pin", request.Pin);
        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var normalizedReal = NameNormalizer.Normalize(request.RealName!);
        if (!throttle.TryAcquire(normalizedReal, out var retryAfter))
        {
            http.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
            return Results.Problem(
                statusCode: StatusCodes.Status429TooManyRequests,
                title: "Too many sign-in attempts.",
                detail: "Wait a few minutes before trying again.");
        }

        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, request.JoinCode, ct);
        var player = eventId is null
            ? null
            : await db.Players.SingleOrDefaultAsync(p => p.EventId == eventId && p.NormalizedRealName == normalizedReal, ct);

        if (player is null)
        {
            decoy.SpendVerifyCost(request.Pin!);
            return Unauthorized();
        }

        var verdict = pinHasher.Verify(player, player.PinHash, request.Pin!);
        if (verdict == PinVerifyResult.Failed)
        {
            return Unauthorized();
        }

        if (verdict == PinVerifyResult.SuccessRehashNeeded)
        {
            player.PinHash = pinHasher.Hash(player, request.Pin!);
            await db.SaveChangesAsync(ct);
        }

        await SignInPlayerAsync(http, player);
        return Results.Ok(await ToMeAsync(db, player, ct));
    }

    // A plain RequestDelegate (HttpContext in, Task out): it writes the status itself instead of returning an IResult.
    private static async Task SignOutAsync(HttpContext http)
    {
        await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        http.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    private static async Task<IResult> MeAsync(ICurrentUser user, HttpContext http, AppDbContext db, CancellationToken ct)
    {
        // From the DB, not the cookie: the cookie has no team or names, and a rename or move must show up immediately.
        var player = await db.Players.AsNoTracking().SingleOrDefaultAsync(p => p.Id == user.PlayerId, ct);

        // The cookie can outlive what it stands for: the player was removed (database wiped), or its event is no longer
        // the active one (a rehearsal event, last year's). A cookie lasts 30 days and only sign-in checks the join code,
        // so this is where a stale session ends: the app calls /me when it starts, gets 401 and shows the join page.
        if (player is null || !await db.Events.AnyAsync(e => e.Id == player.EventId && e.IsActive, ct))
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Your session is no longer valid.");
        }

        // The role is a claim, and a cookie can't be changed from the server, so a player promoted to admin would keep
        // getting 403 until they signed in again. Re-issuing the cookie here fixes that on the app's next start or refetch.
        if (user.IsAdmin != (player.Role == PlayerRole.Admin))
        {
            await SignInPlayerAsync(http, player);
        }

        return Results.Ok(await ToMeAsync(db, player, ct));
    }

    private static Task SignInPlayerAsync(HttpContext http, Player player) =>
        http.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            CurrentUser.CreatePrincipal(player, CookieAuthenticationDefaults.AuthenticationScheme),
            // Persistent: phones should stay signed in after the browser is closed (D22).
            new AuthenticationProperties { IsPersistent = true });

    private static async Task<MeResponse> ToMeAsync(AppDbContext db, Player player, CancellationToken ct)
    {
        var teamName = player.TeamId is null
            ? null
            : await db.Teams.AsNoTracking().Where(t => t.Id == player.TeamId).Select(t => t.Name).SingleOrDefaultAsync(ct);
        return new MeResponse(player.Id, player.RealName, player.DisplayName, player.Role, player.TeamId, teamName);
    }

    private const string RealNameTaken = "A player with that real name is already registered. Sign in instead.";
    private const string DisplayNameTaken = "That display name is already taken. Pick a different one.";

    private static IResult NameTaken(string message) =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Name already taken.", detail: message);

    private static IResult Unauthorized() =>
        Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: BadCredentials);
}
