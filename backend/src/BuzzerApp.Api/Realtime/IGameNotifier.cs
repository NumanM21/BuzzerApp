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
