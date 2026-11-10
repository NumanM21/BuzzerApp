using System.Net;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

// POST /api/scores/adjustments/{id}/reverse.
public partial class ScoreEndpointsTests
{
    [Fact]
    public async Task Reversing_a_team_adjustment_adds_an_equal_and_opposite_row_and_restores_the_total()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        await AdjustAsync(admin.Client, "team", teamId, 4);
        var original = await AdjustAsync(admin.Client, "team", teamId, 6, multiplier: 2);   // +12
        Assert.Equal(16, await TeamTotalAsync(admin.Client, teamId));

        var response = await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal(-12, body.GetProperty("amount").GetInt32());
        Assert.Equal("team", body.GetProperty("target").GetString());
        Assert.Equal(teamId, body.GetProperty("targetId").GetInt32());
        Assert.Equal(original, body.GetProperty("reversesAdjustmentId").GetInt64());
        Assert.Equal(4, await TeamTotalAsync(admin.Client, teamId));
        var row = await factory.WithDbAsync(db => db.ScoreAdjustments.AsNoTracking().SingleAsync(a => a.Id == body.GetProperty("id").GetInt64()));
        Assert.Equal(admin.PlayerId, row.CreatedByPlayerId);
        Assert.Null(row.PlayerId);
    }

    [Fact]
    public async Task Reversing_a_player_adjustment_restores_the_players_total_only()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();
        var teamBefore = await TeamTotalAsync(admin.Client, player.TeamId);
        var original = await AdjustAsync(admin.Client, "player", player.PlayerId, 5, "remove");

        var response = await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(5, (await response.ReadJsonAsync()).GetProperty("amount").GetInt32());
        Assert.Equal(0, PlayerRow(await GetAsync(admin.Client, "/api/scores/players"), player.PlayerId).GetProperty("total").GetInt32());
        Assert.Equal(teamBefore, await TeamTotalAsync(admin.Client, player.TeamId));
    }

    [Fact]
    public async Task A_second_reverse_of_the_same_adjustment_is_a_409_and_adds_nothing()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var original = await AdjustAsync(admin.Client, "team", teamId, 5);
        (await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null)).EnsureSuccessStatusCode();

        var second = await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal(2, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.TeamId == teamId)));
        Assert.Equal(0, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task Concurrent_reverses_of_one_adjustment_produce_exactly_one_reversal()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var original = await AdjustAsync(admin.Client, "team", teamId, 5);

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));   // never a 500 from the unique index
        Assert.Equal(1, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.ReversesAdjustmentId == original)));
        Assert.Equal(0, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task A_reversal_cannot_itself_be_reversed()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var original = await AdjustAsync(admin.Client, "team", teamId, 5);
        var reversal = (await (await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null)).ReadJsonAsync()).GetProperty("id").GetInt64();

        var response = await admin.Client.PostAsync($"/api/scores/adjustments/{reversal}/reverse", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(2, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.TeamId == teamId)));
    }

    [Fact]
    public async Task Reversing_an_unknown_adjustment_or_one_from_another_event_is_a_404()
    {
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();
        var otherRow = await factory.WithDbAsync(async db =>
        {
            var row = new ScoreAdjustment { EventId = other.EventId, TeamId = other.TeamId, Amount = 9, CreatedAt = DateTimeOffset.UtcNow, CreatedByPlayerId = other.PlayerId };
            db.ScoreAdjustments.Add(row);
            await db.SaveChangesAsync();
            return row.Id;
        });

        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync("/api/scores/adjustments/999999999/reverse", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync($"/api/scores/adjustments/{otherRow}/reverse", content: null)).StatusCode);
        Assert.Equal(0, await factory.WithDbAsync(db => db.ScoreAdjustments.CountAsync(a => a.ReversesAdjustmentId == otherRow)));
    }

    [Fact]
    public async Task A_reversal_that_would_push_the_total_out_of_range_is_a_409()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var first = await AdjustAsync(admin.Client, "team", teamId, 20_000_000, multiplier: 100);          // +2e9
        await AdjustAsync(admin.Client, "team", teamId, 20_000_000, "remove", multiplier: 100);            // 0
        await AdjustAsync(admin.Client, "team", teamId, 20_000_000, "remove", multiplier: 100);            // -2e9

        // Undoing the first would make the total -4e9.
        var response = await admin.Client.PostAsync($"/api/scores/adjustments/{first}/reverse", content: null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(-2_000_000_000, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task A_player_promoted_to_admin_can_still_have_their_old_adjustment_reversed()
    {
        var admin = await factory.CreateAdminAsync();
        var player = await factory.RegisterNewPlayerAsync();
        var original = await AdjustAsync(admin.Client, "player", player.PlayerId, 5);
        (await admin.Client.PostAsync($"/api/players/{player.PlayerId}/promote", content: null)).EnsureSuccessStatusCode();

        var response = await admin.Client.PostAsync($"/api/scores/adjustments/{original}/reverse", content: null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(player.DisplayName, (await response.ReadJsonAsync()).GetProperty("targetName").GetString());
    }
}
