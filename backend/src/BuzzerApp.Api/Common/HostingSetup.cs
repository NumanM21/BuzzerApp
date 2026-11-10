using BuzzerApp.Infrastructure.Persistence;

namespace BuzzerApp.Api.Common;

/// <summary>Everything that lets one process serve the API, the SignalR hub and the built React app (same origin, D22).</summary>
public static class HostingSetup
{
    public const string HealthPath = "/healthz";

    public static IServiceCollection AddAppHealthChecks(this IServiceCollection services)
    {
        // A database that can't be reached is the one failure that makes the whole app useless, so that is what "healthy" means.
        services.AddHealthChecks().AddDbContextCheck<AppDbContext>();
        return services;
    }

    /// <summary>
    /// Serves the built frontend from wwwroot. Before authentication on purpose: the join page must load for someone who
    /// isn't signed in, and files should not cost a cookie check.
    /// </summary>
    public static WebApplication UseFrontendFiles(this WebApplication app)
    {
        app.UseDefaultFiles();
        app.UseStaticFiles();
        return app;
    }

    /// <summary>
    /// Health check, 404s for unknown API and hub paths, and the SPA fallback. Call after every real endpoint is mapped.
    /// Endpoint routing ranks by specificity, not by order, so the catch-alls never shadow a real route such as
    /// /api/teams or /hubs/game/negotiate; the order here is for the reader.
    /// </summary>
    public static IEndpointRouteBuilder MapHostingEndpoints(this IEndpointRouteBuilder app)
    {
        // The fallback authorization policy requires a signed-in user, so each of these opts out (B3). Otherwise an
        // anonymous probe or a first page load would get a 401.
        app.MapHealthChecks(HealthPath).AllowAnonymous();

        // Without these an unknown /api/... path would fall through to the SPA and answer 200 with index.html, which a
        // client would then fail to parse as JSON. Any method, so a mistyped POST gets the same answer as a GET.
        app.Map("/api/{**path}", NotFoundProblem).AllowAnonymous();
        app.Map("/hubs/{**path}", NotFoundProblem).AllowAnonymous();

        // The default pattern skips paths with a file extension, so a missing /assets/x.js is a real 404 instead of HTML.
        app.MapFallbackToFile("index.html").AllowAnonymous();

        // Whatever is left (a missing /assets/x.js) matches no endpoint, and then the fallback authorization policy would
        // answer 401 to an anonymous caller. A missing file is a 404 whoever asks, so catch it here. The pattern is spelled
        // out because MapFallback's default also carries :nonfile and would skip exactly these paths; without the
        // constraint it is less specific than the SPA fallback, so it only sees what that one skips.
        app.MapFallback("{**path}", NotFoundProblem).AllowAnonymous();
        return app;
    }

    private static IResult NotFoundProblem(HttpContext context) =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not Found");
}
