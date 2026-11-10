using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using BuzzerApp.Infrastructure.Security;
using BuzzerApp.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BuzzerApp.Api.Tests.Seeding;

/// <summary>
/// The seeder against a database of its own (same container): no web host. Each test seeds the way a restart with a
/// given configuration would, and uses years of its own so the tests can share that database.
/// </summary>
[Collection(ApiCollection.Name)]
public class EventSeederTests(ApiFactory factory)
{
    // One migrated database for the whole class; created by the first test that needs it.
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static string? _connectionString;
    private static int _nextYear = 3000;

    private static int NewYear() => Interlocked.Increment(ref _nextYear);

    private async Task<AppDbContext> OpenAsync()
    {
        await Gate.WaitAsync();
        try
        {
            if (_connectionString is null)
            {
                var connectionString = factory.ConnectionStringFor(ApiFactory.NewDatabaseName());
                await using var setup = Create(connectionString);
                await setup.Database.MigrateAsync();
                _connectionString = connectionString;
            }
        }
        finally
        {
            Gate.Release();
        }

        return Create(_connectionString);
    }

    private static AppDbContext Create(string connectionString) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options);

    private static EventSeedOptions Config(int year, string joinCode, int teams = 3) => new()
    {
        Name = $"Games Night {year}",
        Year = year,
        JoinCode = joinCode,
        ThemeKey = "default",
        Teams = Enumerable.Range(1, teams)
            .Select(i => new TeamSeedOptions { Name = $"Team {i}", ColorKey = $"colour-{i}", IconKey = $"icon-{i}" })
            .ToList(),
    };

    private static List<AdminSeedOptions> Admins(string pin = "1234") =>
        [new AdminSeedOptions { RealName = "Seed Admin", DisplayName = "Boss", Pin = pin }];

    /// <summary>One application start: a fresh context, as the startup scope would give the seeder.</summary>
    private async Task SeedAsync(EventSeedOptions config, List<AdminSeedOptions>? admins = null)
    {
        await using var db = await OpenAsync();
        var seeder = new EventSeeder(db, new PinHasher(), TimeProvider.System, Options.Create(config), Options.Create(admins ?? Admins()), NullLogger<EventSeeder>.Instance);
        await seeder.SeedAsync();
    }

    private async Task<Event> EventOfAsync(int year)
    {
        await using var db = await OpenAsync();
        return await db.Events.AsNoTracking().SingleAsync(e => e.Year == year);
    }

    private async Task<int> ActiveEventIdAsync()
    {
        await using var db = await OpenAsync();
        return await db.Events.Where(e => e.IsActive).Select(e => e.Id).SingleAsync();   // Single: never two active events
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(8)]
    public async Task The_first_start_creates_the_event_its_teams_in_config_order_and_the_admins(int teamCount)
    {
        var year = NewYear();
        var config = Config(year, $"CODE-{year}", teamCount);

        await SeedAsync(config);

        var ev = await EventOfAsync(year);
        Assert.Equal((config.Name, config.JoinCode, "default", true), (ev.Name, ev.JoinCode, ev.ThemeKey, ev.IsActive));
        Assert.Equal(ev.Id, await ActiveEventIdAsync());
        await using var db = await OpenAsync();
        var teams = await db.Teams.AsNoTracking().Where(t => t.EventId == ev.Id).OrderBy(t => t.SortOrder).ThenBy(t => t.Id).ToListAsync();
        Assert.Equal(config.Teams.Select(t => t.Name), teams.Select(t => t.Name));
        Assert.Equal(Enumerable.Range(0, teamCount), teams.Select(t => t.SortOrder));
        var admin = await db.Players.AsNoTracking().SingleAsync(p => p.EventId == ev.Id);
        Assert.Equal((PlayerRole.Admin, "Seed Admin", (int?)null), (admin.Role, admin.RealName, admin.TeamId));
        Assert.NotEqual("1234", admin.PinHash);
    }

    [Fact]
    public async Task A_restart_never_undoes_what_admins_changed()
    {
        var year = NewYear();
        var config = Config(year, $"CODE-{year}");
        await SeedAsync(config);
        var ev = await EventOfAsync(year);
        string pinHashBefore;
        await using (var db = await OpenAsync())
        {
            // What an admin can do through the app: rename a team and delete another.
            var teams = await db.Teams.Where(t => t.EventId == ev.Id).OrderBy(t => t.SortOrder).ToListAsync();
            teams[0].Rename("Renamed By Admin");
            db.Teams.Remove(teams[1]);
            await db.SaveChangesAsync();
            pinHashBefore = await db.Players.Where(p => p.EventId == ev.Id).Select(p => p.PinHash).SingleAsync();
        }

        // The same configuration again, but with a different admin PIN: an existing admin's PIN is never reset.
        await SeedAsync(config, Admins(pin: "9999"));

        await using var after = await OpenAsync();
        var names = await after.Teams.Where(t => t.EventId == ev.Id).OrderBy(t => t.SortOrder).Select(t => t.Name).ToListAsync();
        Assert.Equal(["Renamed By Admin", "Team 3"], names);
        Assert.Equal(pinHashBefore, await after.Players.Where(p => p.EventId == ev.Id).Select(p => p.PinHash).SingleAsync());
        Assert.Equal(1, await after.Events.CountAsync(e => e.Year == year));
    }

    [Fact]
    public async Task Changing_the_join_code_keeps_the_same_event_and_everything_in_it()
    {
        // The first version looked the event up by join code, so a changed code made a second, empty event and
        // deactivated the real one mid-evening.
        var year = NewYear();
        await SeedAsync(Config(year, $"LEAKED-{year}"));
        var before = await EventOfAsync(year);

        await SeedAsync(Config(year, $"FRESH-{year}"));

        var after = await EventOfAsync(year);   // SingleAsync: still exactly one event for the year
        Assert.Equal(before.Id, after.Id);
        Assert.Equal($"FRESH-{year}", after.JoinCode);
        Assert.True(after.IsActive);
        await using var db = await OpenAsync();
        Assert.Equal(3, await db.Teams.CountAsync(t => t.EventId == after.Id));
        Assert.Equal(1, await db.Players.CountAsync(p => p.EventId == after.Id));
    }

    [Fact]
    public async Task A_new_year_creates_a_new_active_event_and_leaves_the_old_one_intact_but_inactive()
    {
        var lastYear = NewYear();
        var thisYear = NewYear();
        await SeedAsync(Config(lastYear, $"CODE-{lastYear}"));
        var old = await EventOfAsync(lastYear);

        await SeedAsync(Config(thisYear, $"CODE-{thisYear}", teams: 5));

        var current = await EventOfAsync(thisYear);
        Assert.NotEqual(old.Id, current.Id);
        Assert.Equal(current.Id, await ActiveEventIdAsync());
        Assert.False((await EventOfAsync(lastYear)).IsActive);
        await using var db = await OpenAsync();
        Assert.Equal(3, await db.Teams.CountAsync(t => t.EventId == old.Id));
        Assert.Equal(5, await db.Teams.CountAsync(t => t.EventId == current.Id));
        Assert.Equal(1, await db.Players.CountAsync(p => p.EventId == current.Id));   // admins are seeded per event
    }

    [Fact]
    public async Task Reusing_an_earlier_years_join_code_fails_with_a_clear_message_and_changes_nothing()
    {
        var lastYear = NewYear();
        var thisYear = NewYear();
        await SeedAsync(Config(lastYear, $"SAME-{lastYear}"));
        var activeBefore = await ActiveEventIdAsync();

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => SeedAsync(Config(thisYear, $"SAME-{lastYear}")));

        Assert.Contains(lastYear.ToString(System.Globalization.CultureInfo.InvariantCulture), ex.Message, StringComparison.Ordinal);
        Assert.Equal(activeBefore, await ActiveEventIdAsync());
        await using var db = await OpenAsync();
        Assert.False(await db.Events.AnyAsync(e => e.Year == thisYear));
    }

    [Fact]
    public async Task Going_back_to_an_earlier_years_configuration_makes_that_event_the_active_one_again()
    {
        var first = NewYear();
        var second = NewYear();
        await SeedAsync(Config(first, $"CODE-{first}"));
        await SeedAsync(Config(second, $"CODE-{second}"));

        await SeedAsync(Config(first, $"CODE-{first}"));

        Assert.Equal((await EventOfAsync(first)).Id, await ActiveEventIdAsync());
        Assert.False((await EventOfAsync(second)).IsActive);
    }
}
