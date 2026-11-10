using BuzzerApp.Infrastructure.Persistence;

namespace BuzzerApp.Api.Common;

/// <summary>Everything that lets one process serve the API, the SignalR hub and the built React app (same origin, D22).</summary>
public static class HostingSetup
{
    public const string HealthPath = "/healthz";

    private const string IndexFile = "/index.html";

    // Paths the server owns. An unknown path under these is a 404, never the React app: a client would fail to parse
    // index.html as JSON.
    private static readonly string[] ServerPrefixes = ["/api", "/hubs"];

    public static IServiceCollection AddAppHosting(this IServiceCollection services)
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
    /// Decides what a request that matched no route gets: the React app for a client-side route (/join, /admin/scores,
    /// so a refresh or a shared link works), and a 404 ProblemDetails for everything else (an unknown /api or /hubs
    /// path, a missing file). Call right after <c>UseRouting</c> and before authorization, because the fallback policy
    /// would otherwise tell an anonymous caller to sign in (401) for a path that doesn't exist.
    /// <para>
    /// A middleware rather than fallback routes (B8's first version). A catch-all endpoint takes part in route
    /// selection: it accepts every method and content type, so a real route's "wrong method" (405), "wrong content
    /// type" (415) and "missing body" (400) all became the catch-all's 404. Keeping the fallbacks out of the route
    /// table leaves those answers to the real routes.
    /// </para>
    /// </summary>
    public static WebApplication UseFallbackForUnmatchedRequests(this WebApplication app)
    {
        // Its own small pipeline: the static-file middleware serves index.html (with its caching headers), and if the
        // frontend hasn't been built there is no file, so it falls through to the 404.
        var serveIndex = ((IApplicationBuilder)app).New()
            .UseStaticFiles()
            .Use((RequestDelegate _) => WriteNotFoundAsync)
            .Build();

        app.Use(async (context, next) =>
        {
            if (context.GetEndpoint() is not null)
            {
                await next(context);
            }
            else if (IsClientRoute(context.Request))
            {
                context.Request.Path = IndexFile;
                await serveIndex(context);
            }
            else
            {
                await WriteNotFoundAsync(context);
            }
        });
        return app;
    }

    public static IEndpointRouteBuilder MapHostingEndpoints(this IEndpointRouteBuilder app)
    {
        // The fallback authorization policy requires a signed-in user, so this opts out (B3): a health probe is anonymous.
        app.MapHealthChecks(HealthPath).AllowAnonymous();
        return app;
    }

    /// <summary>
    /// A page the React router owns: a GET for a path outside /api and /hubs whose last segment has no file extension.
    /// A missing /assets/x.js must stay a 404, because HTML served as a script fails with a confusing syntax error.
    /// </summary>
    internal static bool IsClientRoute(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
        {
            return false;
        }

        var path = request.Path;
        if (ServerPrefixes.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        var value = path.Value ?? "";
        return !value[(value.LastIndexOf('/') + 1)..].Contains('.');
    }

    private static Task WriteNotFoundAsync(HttpContext context) =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not Found").ExecuteAsync(context);
}
