using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Features.Event;

public static class EventEndpoints
{
    public static IEndpointRouteBuilder MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        // Both are needed before anyone can sign in (theme, team picker), so they are public by design.
        var group = app.MapGroup("/api/event").AllowAnonymous();

        group.MapGet("/", async (EventService events, CancellationToken ct) =>
            (await events.GetActiveAsync(ct)).ToOk());

        // The join code is a guessable-length secret, so this shares the registration limit.
        group.MapGet("/teams", async (string? code, EventService events, CancellationToken ct) =>
                (await events.GetJoinTeamsAsync(code, ct)).ToOk())
            .RequireRateLimiting(RateLimitPolicies.JoinCode);
        return app;
    }
}
