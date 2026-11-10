using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Features.Players;

public static class PlayerEndpoints
{
    public static IEndpointRouteBuilder MapPlayerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/players");

        // Any signed-in user (the fallback policy). Literal "me" never clashes with the int-constrained {id} routes.
        group.MapPatch("/me", async (EditNamesRequest request, PlayerService players, CancellationToken ct) =>
            (await players.EditOwnNamesAsync(request, ct)).ToOk());

        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);

        admin.MapGet("/", async (PlayerService players, CancellationToken ct) =>
            Results.Ok(await players.ListAsync(ct)));

        admin.MapPatch("/{id:int}", async (int id, EditNamesRequest request, PlayerService players, CancellationToken ct) =>
            (await players.EditNamesAsync(id, request, ct)).ToOk());

        admin.MapPatch("/{id:int}/team", async (int id, MovePlayerRequest request, PlayerService players, CancellationToken ct) =>
            (await players.MoveAsync(id, request, ct)).ToOk());

        admin.MapPost("/{id:int}/promote", async (int id, PlayerService players, CancellationToken ct) =>
            (await players.PromoteAsync(id, ct)).ToOk());
        return app;
    }
}
