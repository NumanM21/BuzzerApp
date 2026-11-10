using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Teams;

/// <summary>Team-name lookups that several features need (session, players, scores). They were written out in each one before.</summary>
public static class TeamQueries
{
    /// <summary>The team's name, or null for no team (an admin) or a team that no longer exists.</summary>
    public static async Task<string?> TeamNameAsync(this AppDbContext db, int? teamId, CancellationToken ct) =>
        teamId is null
            ? null
            : await db.Teams.AsNoTracking().Where(t => t.Id == teamId).Select(t => t.Name).SingleOrDefaultAsync(ct);

    /// <summary>Every team name of the event by id. For lookups only: never enumerate it into a response (shared ordering rule).</summary>
    public static Task<Dictionary<int, string>> TeamNamesAsync(this AppDbContext db, int eventId, CancellationToken ct) =>
        db.Teams.AsNoTracking().Where(t => t.EventId == eventId).ToDictionaryAsync(t => t.Id, t => t.Name, ct);
}
