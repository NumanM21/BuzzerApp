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
/// given configuration would, and uses join codes of its own so the tests can share that database.
/// </summary>
[Collection(ApiCollection.Name)]
public class EventSeederTests(ApiFactory factory)
{
    // One migrated database for the whole class; created by the first test that needs it.
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static string? _connectionString;

    private static string NewCode() => ApiHelpers.UniqueName("CODE");

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

    private static EventSeedOptions Config(string joinCode, int teams = 3, int year = 2027, string name = "Games Night") => new()
    {
        Name = name,
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

    private async Task<Event> EventOfAsync(string joinCode)
    {
        await using var db = await OpenAsync();
        return await db.Events.AsNoTracking().SingleAsync(e => e.JoinCode == joinCode);
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
        var code = NewCode();
        var config = Config(code, teamCount);

        await SeedAsync(config);

        var ev = await EventOfAsync(code);
        Assert.Equal((config.Name, config.Year, "default", true), (ev.Name, ev.Year, ev.ThemeKey, ev.IsActive));
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
        var code = NewCode();
        var config = Config(code);
        await SeedAsync(config);
        var ev = await EventOfAsync(code);
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

        // The same join code again, with a different admin PIN and event name: nothing that exists is overwritten.
        await SeedAsync(Config(code, name: "Renamed In Config"), Admins(pin: "9999"));

        await using var after = await OpenAsync();
        var names = await after.Teams.Where(t => t.EventId == ev.Id).OrderBy(t => t.SortOrder).Select(t => t.Name).ToListAsync();
        Assert.Equal(["Renamed By Admin", "Team 3"], names);
        Assert.Equal(pinHashBefore, await after.Players.Where(p => p.EventId == ev.Id).Select(p => p.PinHash).SingleAsync());
        Assert.Equal("Games Night", (await EventOfAsync(code)).Name);
    }

    [Fact]
    public async Task A_new_join_code_is_a_new_session_even_in_the_same_year_and_the_old_one_is_kept_but_inactive()
    {
        // Two games nights in one year, or a replacement for a session that went wrong: the code is the identity.
        var first = NewCode();
        var second = NewCode();
        await SeedAsync(Config(first, year: 2027));
        var old = await EventOfAsync(first);

        await SeedAsync(Config(second, teams: 5, year: 2027));

        var current = await EventOfAsync(second);
        Assert.NotEqual(old.Id, current.Id);
        Assert.Equal(current.Id, await ActiveEventIdAsync());
        Assert.False((await EventOfAsync(first)).IsActive);
        await using var db = await OpenAsync();
        Assert.Equal(3, await db.Teams.CountAsync(t => t.EventId == old.Id));
        Assert.Equal(1, await db.Players.CountAsync(p => p.EventId == old.Id));
        Assert.Equal(5, await db.Teams.CountAsync(t => t.EventId == current.Id));
        Assert.Equal(1, await db.Players.CountAsync(p => p.EventId == current.Id));   // admins are seeded per event
    }

    [Fact]
    public async Task Going_back_to_an_earlier_join_code_makes_that_session_the_active_one_again_without_changing_it()
    {
        // Without this the earlier event stayed inactive while its admins were the configured ones, so nobody could sign in.
        var first = NewCode();
        var second = NewCode();
        await SeedAsync(Config(first));
        await SeedAsync(Config(second));
        var firstEvent = await EventOfAsync(first);

        await SeedAsync(Config(first));

        Assert.Equal(firstEvent.Id, await ActiveEventIdAsync());
        Assert.False((await EventOfAsync(second)).IsActive);
        await using var db = await OpenAsync();
        Assert.Equal(3, await db.Teams.CountAsync(t => t.EventId == firstEvent.Id));
        Assert.Equal(1, await db.Players.CountAsync(p => p.EventId == firstEvent.Id));
    }
}
