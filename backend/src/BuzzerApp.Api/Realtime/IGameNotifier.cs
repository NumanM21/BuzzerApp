namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Tells connected clients that REST data changed so they refetch (D7). REST stays the source of truth;
/// this only says "look again". Endpoints call it after a write has been saved, never before.
/// </summary>
public interface IGameNotifier
{
    Task TeamsChangedAsync();
    Task ScoresChangedAsync();
}

/// <summary>Stand-in until B6 replaces it with the SignalR implementation.</summary>
public sealed class NullGameNotifier : IGameNotifier
{
    public Task TeamsChangedAsync() => Task.CompletedTask;
    public Task ScoresChangedAsync() => Task.CompletedTask;
}
