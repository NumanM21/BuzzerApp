using System.Text.Json;
using System.Text.Json.Serialization;

namespace BuzzerApp.Api.Realtime;

public static class RealtimeSetup
{
    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        // Same enum format as the REST API ("open", "current"), so the frontend has one set of types.
        services.AddSignalR().AddJsonProtocol(o =>
            o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

        services.AddSingleton<IGameNotifier, HubGameNotifier>();
        services.AddSingleton<RoundPersistenceQueue>();
        services.AddSingleton<RoundService>();
        services.AddSingleton<IRoundTicker>(sp => sp.GetRequiredService<RoundService>());
        services.AddHostedService<RoundPersistenceWorker>();
        services.AddHostedService<RoundClock>();
        return services;
    }

    public static IEndpointRouteBuilder MapRealtime(this IEndpointRouteBuilder app)
    {
        app.MapHub<GameHub>(GameHub.Path);
        return app;
    }
}
