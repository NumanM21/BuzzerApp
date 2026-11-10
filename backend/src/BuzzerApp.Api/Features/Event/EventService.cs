using BuzzerApp.Api.Common;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Event;

/// <summary>What someone needs before they can sign in: the active event's theme, and its teams for the join page.</summary>
public sealed class EventService(AppDbContext db)
{
    public async Task<Result<EventInfoResponse>> GetActiveAsync(CancellationToken ct)
    {
        var info = await db.Events.AsNoTracking()
            .Where(e => e.IsActive)
            .Select(e => new EventInfoResponse(e.Name, e.Year, e.ThemeKey))
            .SingleOrDefaultAsync(ct);
        if (info is null)
        {
            return Error.NotFound("No active event.");
        }

        return info;
    }

    public async Task<Result<List<JoinTeamResponse>>> GetJoinTeamsAsync(string? joinCode, CancellationToken ct)
    {
        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, joinCode, ct);
        if (eventId is null)
        {
            return Error.NotFound("That join code is not recognised.");
        }

        return await db.Teams.AsNoTracking()
            .Where(t => t.EventId == eventId)
            .InDisplayOrder()
            .Select(t => new JoinTeamResponse(t.Id, t.Name, t.ColorKey, t.IconKey, t.Players.Count))
            .ToListAsync(ct);
    }
}
