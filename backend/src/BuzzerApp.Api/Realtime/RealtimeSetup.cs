using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Realtime;

public static class RealtimeSetup
{
    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        // Same enum format as the REST API ("open", "current"), so the frontend has one set of types.
        services.AddSignalR().AddJsonProtocol(o => AppJson.Configure(o.PayloadSerializerOptions));

        services.AddSingleton<IGameNotifier, HubGameNotifier>();
        services.AddSingleton<IRosterSource, DbRosterSource>();
        services.AddSingleton<IRoundBroadcaster, HubRoundBroadcaster>();
        services.AddSingleton<RoundPersistenceQueue>();
        services.AddSingleton<IRoundRecordSink>(sp => sp.GetRequiredService<RoundPersistenceQueue>());
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
