using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BuzzerApp.Api.Tests.Infrastructure;

public static class ApiHelpers
{
    public const string DefaultPin = "4321";

    /// <summary>Names must be unique per event and 2–20 characters, so tests share one database by never reusing one.</summary>
    public static string UniqueName(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..(prefix.Length + 9)];

    public static async Task<int> FirstTeamIdAsync(this ApiFactory factory) =>
        await factory.WithDbAsync(db => db.Teams.OrderBy(t => t.SortOrder).Select(t => t.Id).FirstAsync());

    public static Task<HttpResponseMessage> RegisterAsync(
        this HttpClient client, string realName, string displayName, int teamId,
        string pin = DefaultPin, string joinCode = ApiFactory.JoinCode) =>
        client.PostAsJsonAsync("/api/session/register", new { joinCode, realName, displayName, pin, teamId });

    public static Task<HttpResponseMessage> SignInAsync(
        this HttpClient client, string realName, string pin = DefaultPin, string joinCode = ApiFactory.JoinCode) =>
        client.PostAsJsonAsync("/api/session/signin", new { joinCode, realName, pin });

    /// <summary>Registers a fresh player and returns the browser (signed in), the names used and the new player id.</summary>
    public static async Task<RegisteredPlayer> RegisterNewPlayerAsync(this ApiFactory factory, string prefix = "Player")
    {
        var client = factory.CreateBrowser();
        var realName = UniqueName(prefix + "R");
        var displayName = UniqueName(prefix + "D");
        var teamId = await factory.FirstTeamIdAsync();

        var response = await client.RegisterAsync(realName, displayName, teamId);
        response.EnsureSuccessStatusCode();
        var me = await response.Content.ReadFromJsonAsync<JsonElement>();
        return new RegisteredPlayer(client, realName, displayName, teamId, me.GetProperty("playerId").GetInt32());
    }

    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    public static IReadOnlyList<string> SetCookieHeaders(this HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values) ? values.ToList() : [];

    public static async Task<Player> GetPlayerAsync(this ApiFactory factory, int playerId) =>
        await factory.WithDbAsync(db => db.Players.AsNoTracking().SingleAsync(p => p.Id == playerId));

    /// <summary>
    /// A browser signed in as a brand-new admin. A fresh admin per call (rather than the seeded one) because sign-in is
    /// throttled to 5 attempts per real name, and many tests need an admin.
    /// </summary>
    public static async Task<AdminSession> CreateAdminAsync(this ApiFactory factory, HttpClient? client = null)
    {
        var realName = UniqueName("AdminR");
        var admin = await factory.WithDbAsync(async db =>
        {
            var hasher = factory.Services.GetRequiredService<IPinHasher>();
            var player = new Player(await ActiveEventIdAsync(db), realName, UniqueName("AdminD"), PlayerRole.Admin, teamId: null, DateTimeOffset.UtcNow);
            player.PinHash = hasher.Hash(player, DefaultPin);
            db.Players.Add(player);
            await db.SaveChangesAsync();
            return player;
        });

        client ??= factory.CreateBrowser();
        (await client.SignInAsync(realName)).EnsureSuccessStatusCode();
        return new AdminSession(client, admin.Id, realName);
    }

    public static Task<int> ActiveEventIdAsync(AppDbContext db) =>
        db.Events.Where(e => e.IsActive).Select(e => e.Id).SingleAsync();

    /// <summary>The n-th seeded team (0-based, by SortOrder). Tests never rename or delete seeded teams, since the database is shared.</summary>
    public static async Task<int> SeededTeamIdAsync(this ApiFactory factory, int index) =>
        await factory.WithDbAsync(db => db.Teams.OrderBy(t => t.SortOrder).Skip(index).Select(t => t.Id).FirstAsync());

    /// <summary>Creates a team through the API (so the test also depends on the create endpoint working) and returns its id.</summary>
    public static async Task<int> CreateTeamAsync(this AdminSession admin, string? name = null)
    {
        var response = await admin.Client.PostAsJsonAsync("/api/teams",
            new { name = name ?? UniqueName("Team"), colorKey = UniqueName("c"), iconKey = "icon" });
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync()).GetProperty("id").GetInt32();
    }

    /// <summary>A second, inactive event with one team and one player: for "another event's data must look like it doesn't exist" tests.</summary>
    public static async Task<OtherEventData> CreateOtherEventAsync(this ApiFactory factory) =>
        await factory.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var other = new BuzzerApp.Core.Domain.Event
            {
                Name = "Other", Year = 1999, JoinCode = UniqueName("OTHER"), ThemeKey = "default", IsActive = false, CreatedAt = now,
            };
            db.Events.Add(other);
            await db.SaveChangesAsync();

            var team = new Team(other.Id, UniqueName("OTeam"), UniqueName("c"), "icon", 0, now);
            db.Teams.Add(team);
            await db.SaveChangesAsync();

            var player = new Player(other.Id, UniqueName("OReal"), UniqueName("ODisp"), PlayerRole.Player, team.Id, now) { PinHash = "x" };
            db.Players.Add(player);
            await db.SaveChangesAsync();
            return new OtherEventData(other.Id, team.Id, player.Id);
        });
}

public sealed record RegisteredPlayer(HttpClient Client, string RealName, string DisplayName, int TeamId, int PlayerId);

public sealed record AdminSession(HttpClient Client, int PlayerId, string RealName);

public sealed record OtherEventData(int EventId, int TeamId, int PlayerId);
