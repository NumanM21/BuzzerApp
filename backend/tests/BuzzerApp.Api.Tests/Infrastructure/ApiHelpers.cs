using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

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
}

public sealed record RegisteredPlayer(HttpClient Client, string RealName, string DisplayName, int TeamId, int PlayerId);
