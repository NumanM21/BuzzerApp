using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Realtime;

// RoundService used to load the roster from the database and push snapshots through the hub itself, which meant its
// own rules (what is queued for saving, when a broadcast happens, in what order) could only be tested with a host, a
// database and SignalR connections. These two interfaces are the edges it talks to; the tests replace them with fakes.

/// <summary>Who can buzz in a round that is about to begin.</summary>
public interface IRosterSource
{
    /// <summary>The event's players that are on a team, with display names only (the snapshots built from it go to every player, D19).</summary>
    Task<IReadOnlyList<RosterEntry>> LoadAsync(int eventId, CancellationToken ct);
}

/// <summary>Sends the two snapshots of the live round to their audiences (D6).</summary>
public interface IRoundBroadcaster
{
    Task BroadcastAsync(PublicRoundSnapshot publicSnapshot, AdminRoundSnapshot adminSnapshot);
}

/// <summary>Reads the roster with a DbContext of its own scope: it is used by the singleton <see cref="RoundService"/>, which must never hold one.</summary>
public sealed class DbRosterSource(IServiceScopeFactory scopes) : IRosterSource
{
    public async Task<IReadOnlyList<RosterEntry>> LoadAsync(int eventId, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Sorted so the same data always gives the same roster.
        var rows = await db.Players.AsNoTracking()
            .Where(p => p.EventId == eventId && p.Role == PlayerRole.Player && p.TeamId != null)
            .Join(db.Teams.Where(t => t.EventId == eventId), p => p.TeamId, t => (int?)t.Id,
                (p, t) => new { PlayerId = p.Id, p.DisplayName, TeamId = t.Id, TeamName = t.Name })
            .OrderBy(r => r.TeamId)
            .ThenBy(r => r.PlayerId)
            .ToListAsync(ct);
        return rows.ConvertAll(r => new RosterEntry(r.PlayerId, r.DisplayName, r.TeamId, r.TeamName));
    }
}

public sealed class HubRoundBroadcaster(IHubContext<GameHub, IGameClient> hub) : IRoundBroadcaster
{
    public async Task BroadcastAsync(PublicRoundSnapshot publicSnapshot, AdminRoundSnapshot adminSnapshot)
    {
        await hub.Clients.All.RoundUpdated(publicSnapshot);
        await hub.Clients.Group(GameGroups.Admins).AdminRoundUpdated(adminSnapshot);
    }
}
