using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Features.Scores;

public static class ScoreEndpoints
{
    private const string AdjustmentsPath = "/api/scores/adjustments";

    public static IEndpointRouteBuilder MapScoreEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/scores");

        // Any signed-in user (the fallback policy): the team leaderboard is public to the whole event.
        group.MapGet("/teams", async (ScoreService scores, CancellationToken ct) =>
            Results.Ok(await scores.TeamScoresAsync(ct)));

        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);

        admin.MapGet("/players", async (ScoreService scores, CancellationToken ct) =>
            Results.Ok(await scores.PlayerScoresAsync(ct)));

        admin.MapGet("/adjustments", async (int? take, ScoreService scores, CancellationToken ct) =>
            Results.Ok(await scores.RecentAdjustmentsAsync(take, ct)));

        admin.MapPost("/adjustments", async (AdjustmentRequest request, ScoreService scores, CancellationToken ct) =>
            (await scores.AdjustAsync(request, ct)).ToHttp(row => Results.Created(AdjustmentsPath, row)));

        // An undo is a new ledger row, so it is a 201 like any other adjustment.
        admin.MapPost("/adjustments/{id:long}/reverse", async (long id, ScoreService scores, CancellationToken ct) =>
            (await scores.ReverseAsync(id, ct)).ToHttp(row => Results.Created(AdjustmentsPath, row)));
        return app;
    }
}
