namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Tells connected clients that REST data changed so they refetch (D7). REST stays the source of truth;
/// this only says "look again". Feature services call it after a write has been saved, never before.
/// </summary>
public interface IGameNotifier
{
    Task TeamsChangedAsync();
    Task ScoresChangedAsync();
}

public static class GameNotifierExtensions
{
    /// <summary>
    /// For writes to teams and players: the Teams screen changes, and so do the leaderboards (every team is a row even
    /// at zero, and names, team membership and who is an admin all show there).
    /// </summary>
    public static async Task TeamsAndScoresChangedAsync(this IGameNotifier notifier)
    {
        await notifier.TeamsChangedAsync();
        await notifier.ScoresChangedAsync();
    }
}
