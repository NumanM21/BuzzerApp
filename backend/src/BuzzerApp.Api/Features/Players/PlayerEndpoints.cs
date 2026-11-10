using BuzzerApp.Api.Common;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Players;

public static class PlayerEndpoints
{
    public sealed record PlayerResponse(int Id, string RealName, string DisplayName, PlayerRole Role, int? TeamId, string? TeamName);

    /// <summary>A null field means "leave it as it is".</summary>
    public sealed record EditNamesRequest(string? DisplayName, string? RealName);

    public sealed record MovePlayerRequest(int? TeamId);

    public static IEndpointRouteBuilder MapPlayerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/players");

        // Any signed-in user (the fallback policy). Literal "me" never clashes with the int-constrained {id} routes.
        group.MapPatch("/me", EditOwnNamesAsync);

        var admin = group.MapGroup("").RequireAuthorization(AuthPolicies.Admin);
        admin.MapGet("/", GetPlayersAsync);
        admin.MapPatch("/{id:int}", EditPlayerNamesAsync);
        admin.MapPatch("/{id:int}/team", MovePlayerAsync);
        admin.MapPost("/{id:int}/promote", PromoteAsync);
        return app;
    }

    private static async Task<IResult> GetPlayersAsync(ICurrentUser user, AppDbContext db, CancellationToken ct)
    {
        var teamNames = await TeamNamesAsync(db, user.EventId, ct);
        var players = await db.Players.AsNoTracking()
            .Where(p => p.EventId == user.EventId)
            .ToListAsync(ct);

        // Sorted here, with an explicit comparer and an Id tiebreaker, so the order is the same on every database and every request.
        return Results.Ok(players
            .OrderBy(p => p.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(p => p.Id)
            .Select(p => ToResponse(p, p.TeamId is { } teamId && teamNames.TryGetValue(teamId, out var name) ? name : null)));
    }

    private static async Task<IResult> EditOwnNamesAsync(
        EditNamesRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == user.PlayerId, ct);
        if (player is null)
        {
            // The cookie outlived the player; the next call to /api/session/me clears it.
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Your session is no longer valid.");
        }

        return await EditNamesAsync(player, request, db, notifier, ct);
    }

    private static async Task<IResult> EditPlayerNamesAsync(
        int id,
        EditNamesRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        return player is null ? PlayerNotFound() : await EditNamesAsync(player, request, db, notifier, ct);
    }

    // Shared by "edit myself" and "admin edits anyone": the rules are identical, only who may call differs.
    private static async Task<IResult> EditNamesAsync(
        Player player,
        EditNamesRequest request,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var errors = new ValidationErrors()
            .OptionalPersonName("displayName", request.DisplayName, "Display name")
            .OptionalPersonName("realName", request.RealName, "Real name");
        if (request.DisplayName is null && request.RealName is null)
        {
            errors.Error("displayName", "Provide a display name, a real name, or both.");
        }

        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        // Excluding the player lets them change only the capitalisation of their own name.
        if (request.RealName is not null)
        {
            var normalized = NameNormalizer.Normalize(request.RealName);
            if (await db.Players.AnyAsync(p => p.EventId == player.EventId && p.Id != player.Id && p.NormalizedRealName == normalized, ct))
            {
                return Conflict(RealNameTaken);
            }

            player.SetRealName(request.RealName);
        }

        if (request.DisplayName is not null)
        {
            var normalized = NameNormalizer.Normalize(request.DisplayName);
            if (await db.Players.AnyAsync(p => p.EventId == player.EventId && p.Id != player.Id && p.NormalizedDisplayName == normalized, ct))
            {
                return Conflict(DisplayNameTaken);
            }

            player.SetDisplayName(request.DisplayName);
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(out var constraint))
        {
            // Another request took the name between the pre-check and the save; the unique index decides.
            return Conflict(constraint is not null && constraint.Contains("NormalizedDisplayName", StringComparison.Ordinal)
                ? DisplayNameTaken
                : RealNameTaken);
        }

        await NotifyAsync(notifier);
        return Results.Ok(await ToResponseAsync(db, player, ct));
    }

    private static async Task<IResult> MovePlayerAsync(
        int id,
        MovePlayerRequest request,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var errors = new ValidationErrors().Positive("teamId", request.TeamId, "A team");
        if (errors.HasErrors)
        {
            return errors.ToResult();
        }

        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        if (player is null)
        {
            return PlayerNotFound();
        }

        // Admins belong to no team, and the roster built at Begin takes every player with a team.
        if (player.Role != PlayerRole.Player)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Only players can be on a team.",
                detail: "Admins don't belong to a team.");
        }

        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Id == request.TeamId && t.EventId == user.EventId)
            .Select(t => new { t.Id, t.Name })
            .SingleOrDefaultAsync(ct);
        if (team is null)
        {
            return UnknownTeam();
        }

        if (player.TeamId == team.Id)
        {
            return Results.Ok(new PlayerResponse(player.Id, player.RealName, player.DisplayName, player.Role, team.Id, team.Name));
        }

        player.TeamId = team.Id;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            // The team was deleted between the lookup and the save.
            return UnknownTeam();
        }

        await NotifyAsync(notifier);
        return Results.Ok(new PlayerResponse(player.Id, player.RealName, player.DisplayName, player.Role, team.Id, team.Name));
    }

    private static async Task<IResult> PromoteAsync(
        int id,
        ICurrentUser user,
        AppDbContext db,
        IGameNotifier notifier,
        CancellationToken ct)
    {
        var player = await db.Players.SingleOrDefaultAsync(p => p.Id == id && p.EventId == user.EventId, ct);
        if (player is null)
        {
            return PlayerNotFound();
        }

        // Idempotent, so a double tap on the button isn't an error.
        if (player.Role == PlayerRole.Admin)
        {
            return Results.Ok(ToResponse(player, teamName: null));
        }

        player.Role = PlayerRole.Admin;
        player.TeamId = null;
        await db.SaveChangesAsync(ct);

        // The promoted player's own cookie still says Player until they sign in again (known limit from B3).
        await NotifyAsync(notifier);
        return Results.Ok(ToResponse(player, teamName: null));
    }

    // Both: names and teams show on the Teams screen and on the player leaderboard (which excludes admins).
    private static async Task NotifyAsync(IGameNotifier notifier)
    {
        await notifier.TeamsChangedAsync();
        await notifier.ScoresChangedAsync();
    }

    private static async Task<Dictionary<int, string>> TeamNamesAsync(AppDbContext db, int eventId, CancellationToken ct) =>
        await db.Teams.AsNoTracking().Where(t => t.EventId == eventId).ToDictionaryAsync(t => t.Id, t => t.Name, ct);

    private static PlayerResponse ToResponse(Player p, string? teamName) =>
        new(p.Id, p.RealName, p.DisplayName, p.Role, p.TeamId, teamName);

    private static async Task<PlayerResponse> ToResponseAsync(AppDbContext db, Player p, CancellationToken ct) =>
        ToResponse(p, p.TeamId is null
            ? null
            : await db.Teams.AsNoTracking().Where(t => t.Id == p.TeamId).Select(t => t.Name).SingleOrDefaultAsync(ct));

    private const string RealNameTaken = "Another player already has that real name.";
    private const string DisplayNameTaken = "Another player already has that display name.";

    private static IResult Conflict(string detail) =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Name already taken.", detail: detail);

    private static IResult PlayerNotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Player not found.");

    private static IResult UnknownTeam() =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["teamId"] = ["Choose one of the listed teams."] });
}
