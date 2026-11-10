using BuzzerApp.Api.Features.Archive;
using BuzzerApp.Api.Features.Event;
using BuzzerApp.Api.Features.Players;
using BuzzerApp.Api.Features.Scores;
using BuzzerApp.Api.Features.Session;
using BuzzerApp.Api.Features.Teams;

namespace BuzzerApp.Api.Features;

/// <summary>
/// The list of REST features. Each is a folder with three kinds of file:
/// <list type="bullet">
/// <item><c>*Contracts.cs</c>: the request and response records (the wire format).</item>
/// <item><c>*Service.cs</c>: everything that reads or writes data and decides. Returns values or <c>Result</c>, knows nothing about HTTP.</item>
/// <item><c>*Endpoints.cs</c>: routes and authorization, and turning a service result into a response. No logic.</item>
/// </list>
/// A new feature (Shop, Schedule, Questions) is a new folder plus one line in each method here.
/// </summary>
public static class FeatureSetup
{
    public static IServiceCollection AddFeatures(this IServiceCollection services)
    {
        // Scoped: each uses the request's DbContext and current user.
        services.AddScoped<EventService>();
        services.AddScoped<SessionService>();
        services.AddScoped<TeamService>();
        services.AddScoped<PlayerService>();
        services.AddScoped<ScoreService>();
        services.AddScoped<ArchiveService>();

        // Singletons: the throttle counts attempts across requests, and the decoy hash is made once.
        services.AddSingleton<SignInThrottle>();
        services.AddSingleton<PinDecoy>();
        return services;
    }

    public static IEndpointRouteBuilder MapFeatures(this IEndpointRouteBuilder app)
    {
        app.MapEventEndpoints();
        app.MapSessionEndpoints();
        app.MapTeamEndpoints();
        app.MapPlayerEndpoints();
        app.MapScoreEndpoints();
        app.MapArchiveEndpoints();
        return app;
    }
}
