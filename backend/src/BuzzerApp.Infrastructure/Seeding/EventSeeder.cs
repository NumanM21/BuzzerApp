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

    private async Task<Event> GetOrCreateEventAsync(EventSeedOptions seed, CancellationToken ct)
    {
        var joinCode = seed.JoinCode.Trim();
        var existing = await db.Events.FirstOrDefaultAsync(e => e.JoinCode == joinCode, ct);
        if (existing is not null)
        {
            return existing;
        }

        // The unique index allows one active row, and Postgres checks it per statement, so the old
        // event must be deactivated before the new one is inserted, inside one transaction.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Events.Where(e => e.IsActive).ExecuteUpdateAsync(s => s.SetProperty(e => e.IsActive, false), ct);

        var created = new Event
        {
            Name = seed.Name.Trim(),
            Year = seed.Year,
            JoinCode = joinCode,
            ThemeKey = seed.ThemeKey.Trim(),
            IsActive = true,
            CreatedAt = time.GetUtcNow(),
        };
        db.Events.Add(created);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("Seeded event {EventName} ({Year}) and made it the active event", created.Name, created.Year);
        return created;
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
