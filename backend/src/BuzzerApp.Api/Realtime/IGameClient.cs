using BuzzerApp.Core.Rounds;

namespace BuzzerApp.Api.Realtime;

/// <summary>
/// The messages the server pushes to browsers (PlanMVP §8.7). The method names are the SignalR event names the frontend
/// listens for, so renaming one is a breaking change. Typed parameters also stop an admin snapshot being sent as
/// <c>RoundUpdated</c>: it isn't a <see cref="PublicRoundSnapshot"/>, so it wouldn't compile.
/// </summary>
public interface IGameClient
{
    Task RoundUpdated(PublicRoundSnapshot snapshot);
    Task AdminRoundUpdated(AdminRoundSnapshot snapshot);
    Task TeamsChanged();
    Task ScoresChanged();
}

public static class GameGroups
{
    /// <summary>Only connections in this group receive <see cref="IGameClient.AdminRoundUpdated"/> (D6).</summary>
    public const string Admins = "admins";
}
