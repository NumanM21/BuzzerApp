using BuzzerApp.Api.Common;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BuzzerApp.Api.Realtime;

/// <summary>
/// The live round over SignalR (PlanMVP §8.7). No method takes an id or a time from the client: who is buzzing and
/// which event a round belongs to come from the auth cookie, and arrival order is the server's (D8).
/// </summary>
[Authorize]
public sealed class GameHub(RoundService rounds) : Hub<IGameClient>
{
    public const string Path = "/hubs/game";

    public override async Task OnConnectedAsync()
    {
        var isAdmin = Context.User?.IsAdmin() == true;

        // Joined before the snapshot is sent, so no broadcast can fall between the two. A snapshot that arrives older
        // than one already received is dropped by the client (Version).
        if (isAdmin)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GameGroups.Admins);
        }

        var (publicSnapshot, adminSnapshot) = rounds.GetSnapshots();
        await Clients.Caller.RoundUpdated(publicSnapshot);
        if (isAdmin)
        {
            await Clients.Caller.AdminRoundUpdated(adminSnapshot);
        }

        await base.OnConnectedAsync();
    }

    // Admins don't buzz (§1 Roles). A player promoted mid-session keeps the Player claim until they sign in again, but
    // the roster only holds Player-role players, so their buzz is rejected from the next round on.
    [Authorize(Roles = nameof(PlayerRole.Player))]
    public Task<RoundResult> Buzz() => rounds.BuzzAsync(User.GetPlayerId());

    [Authorize(Roles = nameof(PlayerRole.Admin))]
    public Task<RoundResult> BeginRound() => rounds.BeginAsync(User.GetEventId(), Context.ConnectionAborted);

    [Authorize(Roles = nameof(PlayerRole.Admin))]
    public Task<RoundResult> NextTeam() => rounds.NextTeamAsync();

    [Authorize(Roles = nameof(PlayerRole.Admin))]
    public Task<RoundResult> ResetRound() => rounds.ResetAsync();

    // [Authorize] on the hub guarantees an authenticated user by the time a method runs.
    private System.Security.Claims.ClaimsPrincipal User =>
        Context.User ?? throw new InvalidOperationException("The hub connection has no user.");
}
