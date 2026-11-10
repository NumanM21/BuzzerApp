using Microsoft.AspNetCore.SignalR;

namespace BuzzerApp.Api.Realtime;

public sealed class HubGameNotifier(IHubContext<GameHub, IGameClient> hub, ILogger<HubGameNotifier> logger) : IGameNotifier
{
    public Task TeamsChangedAsync() => SendAsync(c => c.TeamsChanged(), nameof(IGameClient.TeamsChanged));

    public Task ScoresChangedAsync() => SendAsync(c => c.ScoresChanged(), nameof(IGameClient.ScoresChanged));

    // The write is already saved when this runs. Letting a send failure turn it into a 500 would invite the admin to
    // retry, and a retried score adjustment is a second ledger row. A missed nudge only delays a refetch.
    private async Task SendAsync(Func<IGameClient, Task> send, string name)
    {
        try
        {
            await send(hub.Clients.All);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not send {Notification} to clients", name);
        }
    }
}
