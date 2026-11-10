using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Features.Teams;

public static class TeamEndpoints
{
    public static IEndpointRouteBuilder MapTeamEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/teams");

        // Any signed-in user (the fallback policy); the admin routes below opt in to the stricter policy.
        group.MapGet("/", async (TeamService teams, CancellationToken ct) =>
            Results.Ok(await teams.ListAsync(ct)));

        // A nested group, so a route that forgets the policy falls back to "signed in" rather than "public".
        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);

        admin.MapPost("/", async (CreateTeamRequest request, TeamService teams, CancellationToken ct) =>
            (await teams.CreateAsync(request, ct)).ToHttp(team => Results.Created("/api/teams", team)));

        admin.MapPatch("/{id:int}", async (int id, RenameTeamRequest request, TeamService teams, CancellationToken ct) =>
            (await teams.RenameAsync(id, request, ct)).ToOk());

        admin.MapDelete("/{id:int}", async (int id, TeamService teams, CancellationToken ct) =>
            (await teams.DeleteAsync(id, ct)).ToHttp(Results.NoContent));
        return app;
    }
}
