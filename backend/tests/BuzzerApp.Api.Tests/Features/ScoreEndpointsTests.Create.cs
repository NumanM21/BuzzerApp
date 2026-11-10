using System.Net;
using System.Net.Http.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

// POST /api/scores/adjustments: target checks, the total's range and concurrency (the rest of the create tests are in ScoreEndpointsTests.cs).
public partial class ScoreEndpointsTests
{
    [Fact]
    public async Task A_missing_body_is_a_400()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsync("/api/scores/adjustments", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Several_invalid_fields_are_all_reported_at_once()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsJsonAsync("/api/scores/adjustments", new { targetId = 0, amount = 0, multiplier = 5 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertProblemFields(await response.ReadJsonAsync(), "target", "targetId", "amount", "direction");
    }

    [Fact]
    public async Task Targets_outside_the_event_or_that_are_admins_are_rejected_with_400()
    {
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();

        var responses = new[]
        {
            await PostAdjustmentAsync(admin.Client, "team", 999_999, 5),            // no such team
            await PostAdjustmentAsync(admin.Client, "team", other.TeamId, 5),       // another event's team
            await PostAdjustmentAsync(admin.Client, "player", 999_999, 5),          // no such player
            await PostAdjustmentAsync(admin.Client, "player", other.PlayerId, 5),   // another event's player
            await PostAdjustmentAsync(admin.Client, "player", admin.PlayerId, 5),   // admins are never scored
        };

        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            AssertProblemFields(await response.ReadJsonAsync(), "targetId");
        }

        Assert.Equal(0, await factory.WithDbAsync(db =>
            db.ScoreAdjustments.CountAsync(a => a.TeamId == other.TeamId || a.PlayerId == other.PlayerId || a.PlayerId == admin.PlayerId)));
    }

    [Fact]
    public async Task A_player_id_is_never_scored_as_a_team()
    {
        // Teams and players have separate id sequences, so the same number can name both; the target decides which table is used.
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        var playerId = await InsertPlayerAsync("twin", teamId);

        var asPlayer = await PostAdjustmentAsync(admin.Client, "player", playerId, 5);

        Assert.Equal(HttpStatusCode.Created, asPlayer.StatusCode);
        var row = await factory.WithDbAsync(db => db.ScoreAdjustments.AsNoTracking().SingleAsync(a => a.PlayerId == playerId));
        Assert.Null(row.TeamId);
        Assert.Equal(0, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task An_adjustment_that_would_overflow_the_total_is_rejected_and_the_leaderboard_keeps_working()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();
        await AdjustAsync(admin.Client, "team", teamId, 21_474_836, multiplier: 100);   // 2 147 483 600

        var response = await PostAdjustmentAsync(admin.Client, "team", teamId, 100);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertProblemFields(await response.ReadJsonAsync(), "amount");
        Assert.Equal(2_147_483_600, await TeamTotalAsync(admin.Client, teamId));
    }

    [Fact]
    public async Task Concurrent_adjustments_all_land_and_add_up()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await factory.NewTeamIdAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => PostAdjustmentAsync(admin.Client, "team", teamId, 3)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        Assert.Equal(30, await TeamTotalAsync(admin.Client, teamId));
    }
}
