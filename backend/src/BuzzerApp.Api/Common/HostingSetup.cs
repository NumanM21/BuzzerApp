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

    public static IEndpointRouteBuilder MapHostingEndpoints(this IEndpointRouteBuilder app)
    {
        // The fallback authorization policy requires a signed-in user, so a probe would get a 401 without this (B3).
        app.MapHealthChecks(HealthPath).AllowAnonymous();
        return app;
    }
}
