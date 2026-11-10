using BuzzerApp.Api.Common;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Event;

public static class EventEndpoints
{
    public sealed record EventInfoResponse(string Name, int Year, string ThemeKey);

    public sealed record JoinTeamResponse(int Id, string Name, string ColorKey, string IconKey, int MemberCount);

    public static IEndpointRouteBuilder MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        // Both are needed before anyone can sign in (theme, team picker), so they are public by design.
        var group = app.MapGroup("/api/event").AllowAnonymous();

        group.MapGet("/", GetEventAsync);
        // The join code is a guessable-length secret, so this shares the registration limit.
        group.MapGet("/teams", GetTeamsAsync).RequireRateLimiting(RateLimitPolicies.JoinCode);
        return app;
    }

    private static async Task<IResult> GetEventAsync(AppDbContext db, CancellationToken ct)
    {
        var info = await db.Events.AsNoTracking()
            .Where(e => e.IsActive)
            .Select(e => new EventInfoResponse(e.Name, e.Year, e.ThemeKey))
            .SingleOrDefaultAsync(ct);

        return info is null
            ? Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No active event.")
            : Results.Ok(info);
    }

    private static async Task<IResult> GetTeamsAsync(string? code, AppDbContext db, CancellationToken ct)
    {
        var eventId = await ActiveEvent.FindIdByJoinCodeAsync(db, code, ct);
        if (eventId is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "That join code is not recognised.");
        }

        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == eventId)
            .OrderBy(t => t.SortOrder)
            .Select(t => new JoinTeamResponse(t.Id, t.Name, t.ColorKey, t.IconKey, t.Players.Count))
            .ToListAsync(ct);

        return Results.Ok(teams);
    }
}
