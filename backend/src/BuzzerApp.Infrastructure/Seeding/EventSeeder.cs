using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Infrastructure.Seeding;

/// <summary>
/// Idempotent startup seeding (PlanMVP §7.2). Every step is "create only if missing" so a restart
/// can never undo what admins changed through the app (team renames, PIN changes).
/// </summary>
public sealed class EventSeeder(
    AppDbContext db,
    IPinHasher pinHasher,
    TimeProvider time,
    IOptions<EventSeedOptions> eventOptions,
    IOptions<List<AdminSeedOptions>> adminOptions,
    ILogger<EventSeeder> logger)
{
    public async Task SeedAsync(CancellationToken ct = default)
    {
        var eventSeed = eventOptions.Value;
        var ev = await GetOrCreateEventAsync(eventSeed, ct);
        await SeedTeamsIfNoneAsync(ev, eventSeed, ct);
        await SeedMissingAdminsAsync(ev, ct);
    }

    /// <summary>
    /// The configured <b>join code</b> says which event (session) this is. A code the database hasn't seen is a new
    /// session with its own teams, players and scores, so there can be several in one year, and a session that went
    /// wrong is replaced by configuring a new code. The configured session is always the active one: going back to an
    /// earlier code makes that session active again rather than leaving sign-in pointed at a different event.
    /// </summary>
    private async Task<Event> GetOrCreateEventAsync(EventSeedOptions seed, CancellationToken ct)
    {
        var joinCode = seed.JoinCode.Trim();
        var ev = await db.Events.FirstOrDefaultAsync(e => e.JoinCode == joinCode, ct);
        if (ev is { IsActive: true })
        {
            return ev;
        }

        // The unique index allows one active row, and Postgres checks it per statement, so the other event must be
        // deactivated before this one is inserted or activated, inside one transaction.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Events.Where(e => e.IsActive).ExecuteUpdateAsync(s => s.SetProperty(e => e.IsActive, false), ct);

        if (ev is null)
        {
            ev = new Event
            {
                Name = seed.Name.Trim(),
                Year = seed.Year,
                JoinCode = joinCode,
                ThemeKey = seed.ThemeKey.Trim(),
                IsActive = true,
                CreatedAt = time.GetUtcNow(),
            };
            db.Events.Add(ev);
            logger.LogInformation("Seeded event {EventName} ({Year}) and made it the active event", ev.Name, ev.Year);
        }
        else
        {
            // Only the active flag: the name, year and theme it was created with are left alone.
            ev.IsActive = true;
            logger.LogInformation("Made the existing event {EventName} ({Year}) the active event again", ev.Name, ev.Year);
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ev;
    }

    private async Task SeedTeamsIfNoneAsync(Event ev, EventSeedOptions seed, CancellationToken ct)
    {
        // "No teams at all" rather than "missing team names": otherwise a renamed team would come back as a duplicate.
        if (await db.Teams.AnyAsync(t => t.EventId == ev.Id, ct))
        {
            return;
        }

        var now = time.GetUtcNow();
        for (var i = 0; i < seed.Teams.Count; i++)
        {
            var t = seed.Teams[i];
            db.Teams.Add(new Team(ev.Id, t.Name, t.ColorKey.Trim(), t.IconKey.Trim(), sortOrder: i, now));
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} teams for event {EventId}", seed.Teams.Count, ev.Id);
    }

    private async Task SeedMissingAdminsAsync(Event ev, CancellationToken ct)
    {
        foreach (var admin in adminOptions.Value)
        {
            var normalized = NameNormalizer.Normalize(admin.RealName);
            if (await db.Players.AnyAsync(p => p.EventId == ev.Id && p.NormalizedRealName == normalized, ct))
            {
                // Never reset the PIN of an existing player, even if the configured one differs.
                continue;
            }

            var player = new Player(ev.Id, admin.RealName, admin.DisplayName, PlayerRole.Admin, teamId: null, time.GetUtcNow());
            player.PinHash = pinHasher.Hash(player, admin.Pin);
            db.Players.Add(player);
            await db.SaveChangesAsync(ct);

            // Display name only: real names and PINs stay out of the logs.
            logger.LogInformation("Seeded admin {DisplayName}", player.DisplayName);
        }
    }
}
