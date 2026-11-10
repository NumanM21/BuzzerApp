using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// The shared database holds other tests' teams, players and ledger rows, so every test creates what it needs and
/// looks only at its own ids. Ranks, which are global, are checked against the rule applied to the whole response.
/// </summary>
[Collection(ApiCollection.Name)]
public partial class ScoreEndpointsTests(ApiFactory factory)
{
    // How many teams or players there are changes from year to year: ranking and ordering run over several shapes.
    public static TheoryData<int> Counts => new() { 2, 6, 13, 30 };

    // ---- helpers -----------------------------------------------------------------------------------------------

    private static Task<HttpResponseMessage> PostAdjustmentAsync(
        HttpClient client, string target, int targetId, int amount, string direction = "add", int? multiplier = null, string? reason = null)
    {
        var body = new Dictionary<string, object?> { ["target"] = target, ["targetId"] = targetId, ["amount"] = amount, ["direction"] = direction };
        if (multiplier is not null)
        {
            body["multiplier"] = multiplier;
        }

        if (reason is not null)
        {
            body["reason"] = reason;
        }

        return client.PostAsJsonAsync("/api/scores/adjustments", body);
    }

    private static async Task<long> AdjustAsync(HttpClient client, string target, int targetId, int amount, string direction = "add", int? multiplier = null)
    {
        var response = await PostAdjustmentAsync(client, target, targetId, amount, direction, multiplier);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.ReadJsonAsync()).GetProperty("id").GetInt64();
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadJsonAsync();
    }

    private static JsonElement TeamRow(JsonElement teams, int teamId) =>
        teams.EnumerateArray().Single(t => t.GetProperty("teamId").GetInt32() == teamId);

    private static JsonElement PlayerRow(JsonElement players, int playerId) =>
        players.EnumerateArray().Single(p => p.GetProperty("playerId").GetInt32() == playerId);

    private static async Task<int> TeamTotalAsync(HttpClient client, int teamId) =>
        TeamRow(await GetAsync(client, "/api/scores/teams"), teamId).GetProperty("total").GetInt32();

    /// <summary>Writes ledger rows straight to the database: faster than the API for arranging many rows, and it can set timestamps.</summary>
    private async Task<List<long>> InsertRowsAsync(int createdBy, params (int? TeamId, int? PlayerId, int Amount, DateTimeOffset At)[] rows) =>
        await factory.WithDbAsync(async db =>
        {
            var eventId = await ApiHelpers.ActiveEventIdAsync(db);
            var entities = rows.Select(r => new ScoreAdjustment
            {
                EventId = eventId, TeamId = r.TeamId, PlayerId = r.PlayerId, Amount = r.Amount, CreatedAt = r.At, CreatedByPlayerId = createdBy,
            }).ToList();
            db.ScoreAdjustments.AddRange(entities);
            await db.SaveChangesAsync();
            return entities.Select(e => e.Id).ToList();
        });

    private async Task<int> InsertPlayerAsync(string displayNamePrefix, int teamId, PlayerRole role = PlayerRole.Player) =>
        await factory.WithDbAsync(async db =>
        {
            var player = new Player(await ApiHelpers.ActiveEventIdAsync(db), ApiHelpers.UniqueName("ScR"), ApiHelpers.UniqueName(displayNamePrefix),
                role, role == PlayerRole.Player ? teamId : null, DateTimeOffset.UtcNow) { PinHash = "x" };
            db.Players.Add(player);
            await db.SaveChangesAsync();
            return player.Id;
        });

    // A spread of totals with plenty of ties (and negatives and zeros) however many items there are.
    private static int TotalFor(int index) => 10 * (index * 7 % 5) - 20;

    private static void AssertProblemFields(JsonElement problem, params string[] fields) =>
        Assert.Equal(fields.Order().ToArray(), problem.GetProperty("errors").EnumerateObject().Select(p => p.Name).Order().ToArray());

    // ---- authorization -----------------------------------------------------------------------------------------

    [Fact]
    public async Task Every_score_route_requires_signing_in()
    {
        var anonymous = factory.CreateBrowser();

        var responses = new[]
        {
            await anonymous.GetAsync("/api/scores/teams"),
            await anonymous.GetAsync("/api/scores/players"),
            await anonymous.GetAsync("/api/scores/adjustments"),
            await anonymous.PostAsJsonAsync("/api/scores/adjustments", new { }),
            await anonymous.PostAsync("/api/scores/adjustments/1/reverse", content: null),
        };

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
    }

    [Fact]
    public async Task Players_get_the_team_leaderboard_but_every_other_score_route_is_forbidden()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var leaderboard = await player.Client.GetAsync("/api/scores/teams");
        var forbidden = new[]
        {
            await player.Client.GetAsync("/api/scores/players"),
            await player.Client.GetAsync("/api/scores/adjustments"),
            await PostAdjustmentAsync(player.Client, "team", player.TeamId, 5),
            await player.Client.PostAsync("/api/scores/adjustments/1/reverse", content: null),
        };

        Assert.Equal(HttpStatusCode.OK, leaderboard.StatusCode);
        Assert.All(forbidden, r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
    }

    [Fact]
    public async Task A_forbidden_adjustment_by_a_player_writes_nothing()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var before = await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.TeamId == player.TeamId));

        await PostAdjustmentAsync(player.Client, "team", player.TeamId, 5);

        Assert.Equal(before, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.TeamId == player.TeamId)));
    }

    // ---- GET /api/scores/teams ---------------------------------------------------------------------------------

    [Theory]
    [MemberData(nameof(Counts))]
    public async Task Team_scores_rank_every_team_with_ties_sharing_a_rank_and_zero_totals_included(int teamCount)
    {
        var admin = await factory.CreateAdminAsync();
        var teamIds = new List<int>();
        for (var i = 0; i < teamCount; i++)
        {
            teamIds.Add(await factory.NewTeamIdAsync());
        }

        // Even-indexed zeros have no ledger rows at all; odd-indexed zeros have rows that cancel out.
        var now = DateTimeOffset.UtcNow;
        var rows = new List<(int?, int?, int, DateTimeOffset)>();
        for (var i = 0; i < teamCount; i++)
        {
            var total = TotalFor(i);
            if (total != 0)
            {
                rows.Add((teamIds[i], null, total, now));
            }
            else if (i % 2 == 1)
            {
                rows.Add((teamIds[i], null, 5, now));
                rows.Add((teamIds[i], null, -5, now));
            }
        }

        await InsertRowsAsync(admin.PlayerId, [.. rows]);

        var scores = await GetAsync(admin.Client, "/api/scores/teams");

        // Every team of the event is listed, including the ones nobody has scored for.
        var activeTeams = await factory.ActiveEventTeamsAsync();
        Assert.Equal(activeTeams.Count, scores.GetArrayLength());
        for (var i = 0; i < teamCount; i++)
        {
            Assert.Equal(TotalFor(i), TeamRow(scores, teamIds[i]).GetProperty("total").GetInt32());
        }

        // Order and ranks follow the rule: total descending, ties in the teams' own order (SortOrder, Id), competition ranking.
        var totalById = scores.EnumerateArray().ToDictionary(t => t.GetProperty("teamId").GetInt32(), t => t.GetProperty("total").GetInt32());
        Assert.Equal(
            activeTeams.OrderByDescending(t => totalById[t.Id]).Select(t => t.Id),
            scores.EnumerateArray().Select(t => t.GetProperty("teamId").GetInt32()));
        foreach (var row in scores.EnumerateArray())
        {
            var total = row.GetProperty("total").GetInt32();
            Assert.Equal(1 + totalById.Values.Count(other => other > total), row.GetProperty("rank").GetInt32());
        }
    }

    [Fact]
    public async Task Tied_teams_share_a_rank_and_the_next_rank_skips()
    {
        var admin = await factory.CreateAdminAsync();
        var (a, b, c) = (await factory.NewTeamIdAsync(), await factory.NewTeamIdAsync(), await factory.NewTeamIdAsync());
        // Far above anything another test scores, so no outside team lands between or beside these three.
        await AdjustAsync(admin.Client, "team", a, 1_500_000_000);
        await AdjustAsync(admin.Client, "team", b, 1_500_000_000);
        await AdjustAsync(admin.Client, "team", c, 1_400_000_000);

        var scores = await GetAsync(admin.Client, "/api/scores/teams");

        var (rankA, rankB, rankC) = (TeamRow(scores, a).GetProperty("rank").GetInt32(), TeamRow(scores, b).GetProperty("rank").GetInt32(), TeamRow(scores, c).GetProperty("rank").GetInt32());
        Assert.Equal(rankA, rankB);
        Assert.Equal(rankA + 2, rankC);   // 100, 100, 90 → 1, 1, 3
    }

    [Fact]
    public async Task Team_rows_carry_the_teams_name_and_visuals_and_leave_out_other_events()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var other = await factory.CreateOtherEventAsync();
        var team = await factory.WithDbAsync(db => db.Teams.AsNoTracking().SingleAsync(t => t.Id == player.TeamId));

        var scores = await GetAsync(player.Client, "/api/scores/teams");

        var row = TeamRow(scores, team.Id);
        Assert.Equal(team.Name, row.GetProperty("name").GetString());
        Assert.Equal(team.ColorKey, row.GetProperty("colorKey").GetString());
        Assert.Equal(team.IconKey, row.GetProperty("iconKey").GetString());
        Assert.DoesNotContain(scores.EnumerateArray(), t => t.GetProperty("teamId").GetInt32() == other.TeamId);
    }

    [Fact]
    public async Task The_team_leaderboard_is_identical_on_two_requests()
    {
        var admin = await factory.CreateAdminAsync();
        await AdjustAsync(admin.Client, "team", await factory.NewTeamIdAsync(), 3);

        var first = await admin.Client.GetStringAsync("/api/scores/teams");
        var second = await admin.Client.GetStringAsync("/api/scores/teams");

        Assert.Equal(first, second);
    }

    // ---- GET /api/scores/players -------------------------------------------------------------------------------

    [Theory]
    [MemberData(nameof(Counts))]
    public async Task Player_scores_list_every_player_by_total_then_name_ignoring_case_then_id(int playerCount)
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        // Mixed-case prefixes: a case-sensitive comparer would put "Beta" before "alpha".
        string[] prefixes = ["alpha", "Beta", "gamma", "Delta"];
        var ids = new List<int>();
        for (var i = 0; i < playerCount; i++)
        {
            ids.Add(await InsertPlayerAsync(prefixes[i % prefixes.Length], teamId));
        }

        var now = DateTimeOffset.UtcNow;
        var rows = ids.Select((id, i) => ((int?)null, (int?)id, TotalFor(i), now)).Where(r => r.Item3 != 0).ToArray();
        await InsertRowsAsync(admin.PlayerId, rows);

        var scores = await GetAsync(admin.Client, "/api/scores/players");

        // Zero totals (no ledger rows) are included, and every total matches what was inserted.
        for (var i = 0; i < playerCount; i++)
        {
            Assert.Equal(TotalFor(i), PlayerRow(scores, ids[i]).GetProperty("total").GetInt32());
        }

        var actual = scores.EnumerateArray().Select(p => (
            Id: p.GetProperty("playerId").GetInt32(), Total: p.GetProperty("total").GetInt32(), Name: p.GetProperty("displayName").GetString()!)).ToList();
        Assert.Equal(
            actual.OrderByDescending(p => p.Total).ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ThenBy(p => p.Id).Select(p => p.Id),
            actual.Select(p => p.Id));
    }

    [Fact]
    public async Task Player_rows_show_both_names_and_the_team_and_exclude_admins_and_other_events()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();
        var other = await factory.CreateOtherEventAsync();
        var teamName = await factory.TeamNameAsync(player.TeamId);

        var scores = await GetAsync(admin.Client, "/api/scores/players");

        var row = PlayerRow(scores, player.PlayerId);
        Assert.Equal(player.DisplayName, row.GetProperty("displayName").GetString());
        Assert.Equal(player.RealName, row.GetProperty("realName").GetString());
        Assert.Equal(player.TeamId, row.GetProperty("teamId").GetInt32());
        Assert.Equal(teamName, row.GetProperty("teamName").GetString());
        Assert.DoesNotContain(scores.EnumerateArray(), p => p.GetProperty("playerId").GetInt32() == admin.PlayerId);
        Assert.DoesNotContain(scores.EnumerateArray(), p => p.GetProperty("playerId").GetInt32() == other.PlayerId);
    }

    [Fact]
    public async Task A_promoted_player_leaves_the_player_leaderboard_even_though_their_old_score_rows_remain()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();
        await AdjustAsync(admin.Client, "player", player.PlayerId, 7);
        (await admin.Client.PostAsync($"/api/players/{player.PlayerId}/promote", content: null)).EnsureSuccessStatusCode();

        var scores = await GetAsync(admin.Client, "/api/scores/players");

        Assert.DoesNotContain(scores.EnumerateArray(), p => p.GetProperty("playerId").GetInt32() == player.PlayerId);
        Assert.Equal(1, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.PlayerId == player.PlayerId)));
    }

    // ---- POST /api/scores/adjustments --------------------------------------------------------------------------

    [Fact]
    public async Task Adding_points_to_a_team_returns_201_with_the_ledger_row_and_moves_the_total()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var teamName = await factory.TeamNameAsync(teamId);
        var adminDisplay = (await factory.GetPlayerAsync(admin.PlayerId)).DisplayName;

        var response = await PostAdjustmentAsync(admin.Client, "team", teamId, 5, "add", multiplier: 3, reason: "  Round one  ");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal("team", body.GetProperty("target").GetString());
        Assert.Equal(teamId, body.GetProperty("targetId").GetInt32());
        Assert.Equal(teamName, body.GetProperty("targetName").GetString());
        Assert.Equal(15, body.GetProperty("amount").GetInt32());
        Assert.Equal("Round one", body.GetProperty("reason").GetString());   // trimmed
        Assert.Equal(JsonValueKind.Null, body.GetProperty("reversesAdjustmentId").ValueKind);
        Assert.False(body.GetProperty("isReversed").GetBoolean());
        Assert.Equal(adminDisplay, body.GetProperty("createdByDisplayName").GetString());
        Assert.Equal(15, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task Removing_points_from_a_player_stores_a_negative_amount_against_the_player_only()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();

        var response = await PostAdjustmentAsync(admin.Client, "player", player.PlayerId, 4, "remove", multiplier: 5);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal("player", body.GetProperty("target").GetString());
        Assert.Equal(player.DisplayName, body.GetProperty("targetName").GetString());
        Assert.Equal(-20, body.GetProperty("amount").GetInt32());
        var id = body.GetProperty("id").GetInt64();
        var row = await factory.WithDbAsync(db => db.ScoreAdjustments.AsNoTracking().SingleAsync(a => a.Id == id));
        Assert.Equal(player.PlayerId, row.PlayerId);
        Assert.Null(row.TeamId);   // exactly one target; and a player's points never count towards their team (D25)
        Assert.Equal(admin.PlayerId, row.CreatedByPlayerId);
        Assert.Equal(-20, PlayerRow(await GetAsync(admin.Client, "/api/scores/players"), player.PlayerId).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task A_players_points_do_not_change_their_teams_total()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var playerId = await InsertPlayerAsync("solo", teamId);
        await AdjustAsync(admin.Client, "team", teamId, 10);

        await AdjustAsync(admin.Client, "player", playerId, 99);

        Assert.Equal(10, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task The_multiplier_defaults_to_one()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();

        var response = await PostAdjustmentAsync(admin.Client, "team", teamId, 8);

        Assert.Equal(8, (await response.ReadJsonAsync()).GetProperty("amount").GetInt32());
    }

    [Fact]
    public async Task A_blank_reason_is_stored_as_null()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();

        var body = await (await PostAdjustmentAsync(admin.Client, "team", teamId, 1, reason: "   ")).ReadJsonAsync();

        Assert.Equal(JsonValueKind.Null, body.GetProperty("reason").ValueKind);
    }

    public static TheoryData<object?, object?, object?, object?, object?, object?, string> InvalidAdjustments => new()
    {
        // target,   targetId, amount, multiplier, direction, reason,        the field that must be reported
        { "team",    null,     5,      null,       "add",     null,          "targetId" },
        { "team",    0,        5,      null,       "add",     null,          "targetId" },
        { null,      1,        5,      null,       "add",     null,          "target" },
        { "group",   1,        5,      null,       "add",     null,          "target" },   // not a known target name (rejected by the binder)
        { 7,         1,        5,      null,       "add",     null,          "target" },   // a number that is no enum member
        { "team",    1,        null,   null,       "add",     null,          "amount" },
        { "team",    1,        0,      null,       "add",     null,          "amount" },
        { "team",    1,        -5,     null,       "add",     null,          "amount" },
        { "team",    1,        5,      0,          "add",     null,          "multiplier" },
        { "team",    1,        5,      101,        "add",     null,          "multiplier" },
        { "team",    1,        5,      -1,         "add",     null,          "multiplier" },
        { "team",    1,        int.MaxValue, 2,    "add",     null,          "amount" },   // overflows when multiplied
        { "team",    1,        5,      null,       null,      null,          "direction" },   // a missing direction must not default to "add"
        { "team",    1,        5,      null,       "sideways", null,         "direction" },
        { "team",    1,        5,      null,       7,         null,          "direction" },
        { "team",    1,        5,      null,       "add",     "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "reason" },   // 201 characters
    };

    [Theory]
    [MemberData(nameof(InvalidAdjustments))]
    public async Task Invalid_adjustments_are_rejected_with_400_and_write_nothing(
        object? target, object? targetId, object? amount, object? multiplier, object? direction, object? reason, string field)
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var body = new Dictionary<string, object?> { ["target"] = target, ["targetId"] = targetId is 1 ? teamId : targetId, ["amount"] = amount, ["multiplier"] = multiplier, ["direction"] = direction, ["reason"] = reason };

        var response = await admin.Client.PostAsJsonAsync("/api/scores/adjustments", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // A value the JSON binder itself rejects (an unknown enum name) gives a plain 400 without the field list.
        if (target is not "group" && direction is not "sideways")
        {
            AssertProblemFields(await response.ReadJsonAsync(), field);
        }

        Assert.Equal(0, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.TeamId == teamId)));
    }

}
