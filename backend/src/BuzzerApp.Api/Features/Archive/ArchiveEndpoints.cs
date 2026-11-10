using System.Text.Json;
using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Scores;
using BuzzerApp.Core.Archive;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using EventEntity = BuzzerApp.Core.Domain.Event;

namespace BuzzerApp.Api.Features.Archive;

public static class ArchiveEndpoints
{
    public sealed record FinalizeResponse(int EventId, int Year, int SchemaVersion, DateTimeOffset FinalizedAt);

    // Web defaults = camelCase, the same wire format as the rest of the API. The document has no enums, and no
    // type needs the converter that Program.cs adds for HTTP.
    private static readonly JsonSerializerOptions StoredOptions = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions ExportOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static IEndpointRouteBuilder MapArchiveEndpoints(this IEndpointRouteBuilder app)
    {
        // Both routes are admin-only: the document holds every real name.
        var group = app.MapGroup("/api/archive").RequireAuthorization(AuthPolicies.Admin);
        group.MapPost("/finalize", FinalizeAsync);
        group.MapGet("/{eventId:int}/export", ExportAsync);
        return app;
    }

    private static async Task<IResult> FinalizeAsync(ICurrentUser user, AppDbContext db, TimeProvider time, CancellationToken ct)
    {
        var ev = await db.Events.SingleOrDefaultAsync(e => e.Id == user.EventId, ct);
        if (ev is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Event not found.");
        }

        var now = time.GetUtcNow();
        var document = await BuildDocumentAsync(db, ev, now, ct);
        var json = JsonSerializer.Serialize(document, StoredOptions);

        // Re-running replaces the archive, so a second admin (or a double click) racing the first insert is not an
        // error: the loser's insert hits the unique index on EventId, and the retry finds the row and updates it.
        for (var attempt = 1; ; attempt++)
        {
            var archive = await db.EventArchives.SingleOrDefaultAsync(a => a.EventId == ev.Id, ct);
            if (archive is null)
            {
                archive = new EventArchive { EventId = ev.Id };
                db.EventArchives.Add(archive);
            }

            // The row describes the latest finalize, so who and when are replaced along with the data.
            archive.SchemaVersion = document.SchemaVersion;
            archive.Data = json;
            archive.CreatedAt = now;
            archive.CreatedByPlayerId = user.PlayerId;
            ev.FinalizedAt = now;

            try
            {
                await db.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException ex) when (attempt == 1 && ex.IsUniqueViolation(out _))
            {
                // Forget the failed insert (and the Event change) before reloading, or it would be retried as-is.
                db.ChangeTracker.Clear();
                ev = await db.Events.SingleAsync(e => e.Id == user.EventId, ct);
            }
        }

        return Results.Ok(new FinalizeResponse(ev.Id, ev.Year, document.SchemaVersion, now));
    }

    private static async Task<IResult> ExportAsync(int eventId, ICurrentUser user, AppDbContext db, HttpResponse response, CancellationToken ct)
    {
        // Another event's archive looks like it doesn't exist, as for every other route; so does an event never finalized.
        var data = eventId == user.EventId
            ? await db.EventArchives.AsNoTracking().Where(a => a.EventId == eventId).Select(a => a.Data).SingleOrDefaultAsync(ct)
            : null;
        if (data is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No archive for that event.", detail: "Finalize the event first.");
        }

        // jsonb doesn't keep key order (it sorts keys by length), so the stored text reads as a jumble. Round-tripping through the
        // document gives the file its declared field order and a stable layout. Arrays keep their order either way.
        var document = JsonSerializer.Deserialize<ArchiveDocument>(data, StoredOptions)!;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(document, ExportOptions);

        // Real names inside: keep proxies and the browser cache from holding a copy.
        response.Headers.CacheControl = "no-store";
        return Results.File(bytes, "application/json", $"buzzer-archive-{document.Event.Year}.json");
    }

    private static async Task<ArchiveDocument> BuildDocumentAsync(AppDbContext db, EventEntity ev, DateTimeOffset now, CancellationToken ct)
    {
        // Pre-sorted: ArchiveBuilder keeps input order, and the sorts end in Id so ties are decided the same way every time.
        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.EventId == ev.Id)
            .OrderBy(t => t.SortOrder)
            .ThenBy(t => t.Id)
            .ToListAsync(ct);

        // Admins are loaded and left for the builder to drop, so the "no admins" rule lives in one tested place.
        var players = (await db.Players.AsNoTracking()
                .Where(p => p.EventId == ev.Id)
                .ToListAsync(ct))
            .OrderBy(p => p.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(p => p.Id)
            .ToList();

        var teamTotals = await ScoreTotals.ByTeamAsync(db, ev.Id, ct);
        var playerTotals = await ScoreTotals.ByPlayerAsync(db, ev.Id, ct);

        // Only rounds that locked are ever saved, but the filter states the meaning of "played" rather than relying on that.
        var roundsPlayed = await db.Rounds.CountAsync(r => r.EventId == ev.Id && r.LockedAt != null, ct);
        var totalBuzzes = await db.BuzzRecords.CountAsync(b => db.Rounds.Any(r => r.Id == b.RoundId && r.EventId == ev.Id), ct);

        return ArchiveBuilder.Build(
            new ArchiveEventInfo(ev.Name, ev.Year, ev.ThemeKey),
            teams.Select(t => new ArchiveTeamInput(t.Id, t.Name, t.ColorKey, t.IconKey, teamTotals.GetValueOrDefault(t.Id))),
            players.Select(p => new ArchivePlayerInput(
                p.Id, p.DisplayName, p.RealName, p.TeamId, p.Role == PlayerRole.Admin, playerTotals.GetValueOrDefault(p.Id))),
            new ArchiveStats(roundsPlayed, totalBuzzes),
            now);
    }
}
