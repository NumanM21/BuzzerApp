using System.Net;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;

namespace BuzzerApp.Api.Tests.Features;

// GET /api/scores/adjustments.
public partial class ScoreEndpointsTests
{
    [Fact]
    public async Task The_history_names_the_target_and_the_admin_and_flags_reversed_rows()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var player = await factory.RegisterNewPlayerAsync();
        var teamName = await factory.TeamNameAsync(teamId);
        var adminDisplay = (await factory.GetPlayerAsync(admin.PlayerId)).DisplayName;
        var teamRow = await AdjustAsync(admin.Client, "team", teamId, 5);
        var playerRow = await AdjustAsync(admin.Client, "player", player.PlayerId, 2, "remove");
        var undo = await (await admin.Client.PostAsync($"/api/scores/adjustments/{teamRow}/reverse", content: null)).ReadJsonAsync();

        var history = await GetAsync(admin.Client, "/api/scores/adjustments");

        var rows = history.EnumerateArray().ToDictionary(r => r.GetProperty("id").GetInt64());
        Assert.Equal("team", rows[teamRow].GetProperty("target").GetString());
        Assert.Equal(teamName, rows[teamRow].GetProperty("targetName").GetString());
        Assert.Equal(adminDisplay, rows[teamRow].GetProperty("createdByDisplayName").GetString());
        Assert.True(rows[teamRow].GetProperty("isReversed").GetBoolean());
        Assert.Equal("player", rows[playerRow].GetProperty("target").GetString());
        Assert.Equal(player.DisplayName, rows[playerRow].GetProperty("targetName").GetString());
        Assert.Equal(-2, rows[playerRow].GetProperty("amount").GetInt32());
        Assert.False(rows[playerRow].GetProperty("isReversed").GetBoolean());
        var reversal = rows[undo.GetProperty("id").GetInt64()];
        Assert.Equal(teamRow, reversal.GetProperty("reversesAdjustmentId").GetInt64());
        Assert.Equal(-5, reversal.GetProperty("amount").GetInt32());
        Assert.False(reversal.GetProperty("isReversed").GetBoolean());
        Assert.DoesNotContain(player.RealName, history.GetRawText());   // players are named by display name here
    }

    [Fact]
    public async Task The_history_is_newest_first_with_id_breaking_ties_and_take_cuts_it_the_same_way_every_time()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        // Three rows in the same instant, placed in the future so they sit at the top of the shared ledger.
        var stamp = DateTimeOffset.UtcNow.AddDays(30);
        var tied = await InsertRowsAsync(admin.PlayerId, (teamId, null, 1, stamp), (teamId, null, 2, stamp), (teamId, null, 3, stamp));
        var newest = (await InsertRowsAsync(admin.PlayerId, (teamId, null, 4, stamp.AddSeconds(1))))[0];

        var all = await GetAsync(admin.Client, "/api/scores/adjustments?take=100");
        var firstTwo = await admin.Client.GetStringAsync("/api/scores/adjustments?take=2");
        var firstTwoAgain = await admin.Client.GetStringAsync("/api/scores/adjustments?take=2");

        Assert.Equal([newest, tied[2], tied[1], tied[0]], all.EnumerateArray().Take(4).Select(r => r.GetProperty("id").GetInt64()));
        var actual = all.EnumerateArray().Select(r => (At: r.GetProperty("createdAt").GetDateTimeOffset(), Id: r.GetProperty("id").GetInt64())).ToList();
        Assert.Equal(actual.OrderByDescending(r => r.At).ThenByDescending(r => r.Id), actual);
        Assert.Equal(firstTwo, firstTwoAgain);
        Assert.Equal([newest, tied[2]], JsonDocument.Parse(firstTwo).RootElement.EnumerateArray().Select(r => r.GetProperty("id").GetInt64()));
    }

    [Fact]
    public async Task Take_defaults_to_20_and_is_clamped_between_1_and_100()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var stamp = DateTimeOffset.UtcNow;
        await InsertRowsAsync(admin.PlayerId, [.. Enumerable.Range(0, 105).Select(i => ((int?)teamId, (int?)null, 1, stamp.AddSeconds(i)))]);

        Assert.Equal(20, (await GetAsync(admin.Client, "/api/scores/adjustments")).GetArrayLength());
        Assert.Equal(7, (await GetAsync(admin.Client, "/api/scores/adjustments?take=7")).GetArrayLength());
        Assert.Equal(1, (await GetAsync(admin.Client, "/api/scores/adjustments?take=0")).GetArrayLength());
        Assert.Equal(1, (await GetAsync(admin.Client, "/api/scores/adjustments?take=-5")).GetArrayLength());
        Assert.Equal(100, (await GetAsync(admin.Client, "/api/scores/adjustments?take=100")).GetArrayLength());
        Assert.Equal(100, (await GetAsync(admin.Client, "/api/scores/adjustments?take=100000")).GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync("/api/scores/adjustments?take=lots")).StatusCode);
    }

    [Fact]
    public async Task The_history_and_leaderboard_leave_out_other_events()
    {
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();
        // In the future, so an unscoped query would put it first.
        var otherRow = await factory.WithDbAsync(async db =>
        {
            var row = new ScoreAdjustment
            {
                EventId = other.EventId, TeamId = other.TeamId, Amount = 9, CreatedAt = DateTimeOffset.UtcNow.AddDays(60), CreatedByPlayerId = other.PlayerId,
            };
            db.ScoreAdjustments.Add(row);
            await db.SaveChangesAsync();
            return row.Id;
        });

        var history = await GetAsync(admin.Client, "/api/scores/adjustments?take=100");
        var teams = await GetAsync(admin.Client, "/api/scores/teams");

        Assert.DoesNotContain(history.EnumerateArray(), r => r.GetProperty("id").GetInt64() == otherRow);
        Assert.DoesNotContain(teams.EnumerateArray(), t => t.GetProperty("teamId").GetInt32() == other.TeamId);
    }
}
