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
    /// The configured <b>year</b> says which event this is (D15: one per year); the join code is only its current
    /// password. Looking the event up by join code, as the first version did, meant that changing a leaked code created
    /// a second, empty event and deactivated the real one, and that reusing last year's code silently reused last year's
    /// event. The year's event is created if missing, follows the configured join code, and is the active one.
    /// </summary>
    private async Task<Event> GetOrCreateEventAsync(EventSeedOptions seed, CancellationToken ct)
    {
        var joinCode = seed.JoinCode.Trim();

        var sameYear = await db.Events.Where(e => e.Year == seed.Year).OrderBy(e => e.Id).ToListAsync(ct);
        if (sameYear.Count > 1)
        {
            // Only possible if rows were added by hand; guessing which one is meant could seed admins into the wrong event.
            throw new InvalidOperationException(
                $"There are {sameYear.Count} events for {seed.Year}. The seeder identifies an event by its year, so it can't tell which one the configuration means.");
        }

        var codeOwnerYear = await db.Events
            .Where(e => e.JoinCode == joinCode && e.Year != seed.Year)
            .Select(e => (int?)e.Year)
            .FirstOrDefaultAsync(ct);
        if (codeOwnerYear is not null)
        {
            // Join codes are unique across events; say so here rather than let the insert fail on the index.
            throw new InvalidOperationException(
                $"Event:JoinCode is already the join code of the {codeOwnerYear} event. Choose a new code for {seed.Year}.");
        }

        var ev = sameYear.SingleOrDefault();
        if (ev is not null && ev.IsActive && ev.JoinCode == joinCode)
        {
            return ev;
        }

        // The unique index allows one active row, and Postgres checks it per statement, so any other event must be
        // deactivated before this one is inserted or activated, inside one transaction.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Events.Where(e => e.IsActive && e.Year != seed.Year)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsActive, false), ct);

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
            // Name and theme are left alone: only the two things the configuration must control are applied.
            if (ev.JoinCode != joinCode)
            {
                ev.JoinCode = joinCode;
                logger.LogInformation("The join code of the {Year} event was changed to the configured one", ev.Year);
            }

            if (!ev.IsActive)
            {
                ev.IsActive = true;
                logger.LogInformation("Made the {Year} event the active event", ev.Year);
            }
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
