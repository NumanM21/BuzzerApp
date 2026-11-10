using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class TeamEndpointsTests(ApiFactory factory)
{
    private static JsonElement TeamById(JsonElement teams, int id) =>
        teams.EnumerateArray().Single(t => t.GetProperty("id").GetInt32() == id);

    private static JsonElement MemberById(JsonElement team, int playerId) =>
        team.GetProperty("members").EnumerateArray().Single(m => m.GetProperty("playerId").GetInt32() == playerId);

    // ---- GET /api/teams ----------------------------------------------------------------------------------------

    [Fact]
    public async Task Listing_teams_requires_signing_in()
    {
        var response = await factory.CreateBrowser().GetAsync("/api/teams");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Every_team_of_the_event_comes_back_in_sort_order()
    {
        // Compared with the database, not literals: the number and names of teams change every year.
        await factory.NewTeamIdAsync();   // make sure there is more than the seed alone
        var player = await factory.RegisterNewPlayerAsync();
        var expected = await factory.ActiveEventTeamsAsync();

        var teams = await (await player.Client.GetAsync("/api/teams")).ReadJsonAsync();

        Assert.True(expected.Count > 1);
        Assert.Equal(expected.Select(t => t.Id), teams.EnumerateArray().Select(t => t.GetProperty("id").GetInt32()));
        Assert.Equal(expected.Select(t => t.Name), teams.EnumerateArray().Select(t => t.GetProperty("name").GetString()!));
        Assert.Equal(expected.Select(t => t.ColorKey), teams.EnumerateArray().Select(t => t.GetProperty("colorKey").GetString()!));
        Assert.Equal(expected.Select(t => t.IconKey), teams.EnumerateArray().Select(t => t.GetProperty("iconKey").GetString()!));
        var sortOrders = teams.EnumerateArray().Select(t => t.GetProperty("sortOrder").GetInt32()).ToArray();
        Assert.Equal(sortOrders.Order(), sortOrders);
    }

    [Fact]
    public async Task A_player_sees_display_names_for_everyone_but_real_names_only_on_their_own_row()
    {
        var me = await factory.RegisterNewPlayerAsync("Me");
        var teammate = await factory.RegisterNewPlayerAsync("Mate");

        var teams = await (await me.Client.GetAsync("/api/teams")).ReadJsonAsync();

        var team = TeamById(teams, me.TeamId);
        var own = MemberById(team, me.PlayerId);
        var other = MemberById(team, teammate.PlayerId);
        Assert.Equal(me.RealName, own.GetProperty("realName").GetString());
        Assert.Equal(teammate.DisplayName, other.GetProperty("displayName").GetString());
        // The property is present and null (not omitted), and no real name appears anywhere else in the payload.
        Assert.Equal(JsonValueKind.Null, other.GetProperty("realName").ValueKind);
        Assert.DoesNotContain(teammate.RealName, teams.GetRawText());
    }

    [Fact]
    public async Task An_admin_sees_every_real_name()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();

        Assert.Equal(player.RealName, MemberById(TeamById(teams, player.TeamId), player.PlayerId).GetProperty("realName").GetString());
    }

    [Fact]
    public async Task Admins_are_not_listed_as_members_of_any_team()
    {
        var admin = await factory.CreateAdminAsync();

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();

        var memberIds = teams.EnumerateArray().SelectMany(t => t.GetProperty("members").EnumerateArray())
            .Select(m => m.GetProperty("playerId").GetInt32());
        Assert.DoesNotContain(admin.PlayerId, memberIds);
    }

    [Fact]
    public async Task Members_are_sorted_by_display_name_ignoring_case()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        var token = Guid.NewGuid().ToString("N")[..6];
        foreach (var display in new[] { $"zed {token}", $"Alpha {token}", $"mike {token}" })
        {
            (await factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), display, teamId)).EnsureSuccessStatusCode();
        }

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();

        var order = TeamById(teams, teamId).GetProperty("members").EnumerateArray().Select(m => m.GetProperty("displayName").GetString()!);
        Assert.Equal([$"Alpha {token}", $"mike {token}", $"zed {token}"], order);
    }

    [Fact]
    public async Task A_team_from_another_event_is_not_listed()
    {
        var other = await factory.CreateOtherEventAsync();
        var admin = await factory.CreateAdminAsync();

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();

        Assert.DoesNotContain(teams.EnumerateArray(), t => t.GetProperty("id").GetInt32() == other.TeamId);
    }

    // ---- authorization on the admin routes -----------------------------------------------------------------------

    [Fact]
    public async Task Team_write_routes_are_403_for_a_signed_in_player()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var teamId = await factory.NewTeamIdAsync();
        var originalName = await factory.TeamNameAsync(teamId);

        var create = await player.Client.PostAsJsonAsync("/api/teams", new { name = "Sneaky", colorKey = "teal", iconKey = "x" });
        var rename = await player.Client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name = "Sneaky" });
        var delete = await player.Client.DeleteAsync($"/api/teams/{teamId}");

        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, rename.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
        Assert.Null(create.Headers.Location);   // a status code, not a redirect to an access-denied page
        Assert.Equal(originalName, await factory.TeamNameAsync(teamId));
    }

    [Fact]
    public async Task Team_write_routes_are_401_when_not_signed_in()
    {
        var client = factory.CreateBrowser();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/teams", new { name = "X", colorKey = "x", iconKey = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync("/api/teams/1", new { name = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync("/api/teams/1")).StatusCode);
    }

    // ---- POST /api/teams ------------------------------------------------------------------------------------------

    [Fact]
    public async Task Creating_a_team_returns_201_and_puts_it_after_the_existing_teams()
    {
        var admin = await factory.CreateAdminAsync();
        var name = ApiHelpers.UniqueName("Team");
        var colorKey = ApiHelpers.UniqueName("c");

        var response = await admin.Client.PostAsJsonAsync("/api/teams", new { name = $"  {name} ", colorKey, iconKey = "star" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.ReadJsonAsync();
        Assert.Equal(name, created.GetProperty("name").GetString());   // trimmed
        Assert.Equal(colorKey, created.GetProperty("colorKey").GetString());
        Assert.Equal("star", created.GetProperty("iconKey").GetString());

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();
        var listed = TeamById(teams, created.GetProperty("id").GetInt32());
        Assert.Equal(teams.EnumerateArray().Max(t => t.GetProperty("sortOrder").GetInt32()), listed.GetProperty("sortOrder").GetInt32());
        Assert.Empty(listed.GetProperty("members").EnumerateArray());
    }

    [Theory]
    [InlineData("lower-case")]
    [InlineData("upper-case-and-padded")]
    public async Task Creating_a_team_with_an_existing_name_is_409(string variant)
    {
        var admin = await factory.CreateAdminAsync();
        var existing = (await factory.FirstTeamAsync()).Name;   // whatever the seed called it
        var name = variant == "lower-case" ? existing.ToLowerInvariant() : $"  {existing.ToUpperInvariant()}  ";

        var response = await admin.Client.PostAsJsonAsync("/api/teams", new { name, colorKey = ApiHelpers.UniqueName("c"), iconKey = "x" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("A team with that name already exists.", (await response.ReadJsonAsync()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Creating_a_team_with_an_existing_colour_is_409()
    {
        var admin = await factory.CreateAdminAsync();

        var takenColour = (await factory.FirstTeamAsync()).ColorKey;

        var response = await admin.Client.PostAsJsonAsync("/api/teams", new { name = ApiHelpers.UniqueName("Team"), colorKey = takenColour, iconKey = "x" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Another team already uses that colour.", (await response.ReadJsonAsync()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Creating_a_team_with_invalid_fields_is_400_and_lists_every_field()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsJsonAsync("/api/teams", new { name = "A", colorKey = "Red", iconKey = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadJsonAsync()).GetProperty("errors");
        Assert.Equal(["colorKey", "iconKey", "name"], errors.EnumerateObject().Select(p => p.Name).Order().ToArray());
    }

    [Fact]
    public async Task Creating_a_team_with_no_body_is_400()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsync("/api/teams", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Two_admins_creating_the_same_team_name_at_once_get_one_201_and_one_409_never_a_500()
    {
        // Both pre-checks can pass before either insert lands; only the unique index can decide, and its error must become a 409.
        var first = await factory.CreateAdminAsync();
        var second = await factory.CreateAdminAsync();
        var name = ApiHelpers.UniqueName("Race");

        var results = await Task.WhenAll(
            first.Client.PostAsJsonAsync("/api/teams", new { name, colorKey = ApiHelpers.UniqueName("c"), iconKey = "x" }),
            second.Client.PostAsJsonAsync("/api/teams", new { name, colorKey = ApiHelpers.UniqueName("c"), iconKey = "x" }));

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], results.Select(r => r.StatusCode).Order().ToArray());
    }

    // ---- PATCH /api/teams/{id} ---------------------------------------------------------------------------------------

    [Fact]
    public async Task Renaming_a_team_returns_the_new_name_and_keeps_its_colour_and_icon()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        var newName = ApiHelpers.UniqueName("Renamed");

        var response = await admin.Client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name = newName });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal(newName, body.GetProperty("name").GetString());
        Assert.Equal("icon", body.GetProperty("iconKey").GetString());
        var stored = await factory.WithDbAsync(db => db.Teams.AsNoTracking().SingleAsync(t => t.Id == teamId));
        Assert.Equal(newName.ToUpperInvariant(), stored.NormalizedName);   // the lookup column moved with the name
    }

    [Fact]
    public async Task A_team_can_be_renamed_to_a_different_capitalisation_of_its_own_name()
    {
        var admin = await factory.CreateAdminAsync();
        var name = ApiHelpers.UniqueName("Team");
        var teamId = await admin.CreateTeamAsync(name);

        var response = await admin.Client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name = name.ToUpperInvariant() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Renaming_a_team_to_another_teams_name_is_409()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        var otherName = (await factory.FirstTeamAsync()).Name.ToLowerInvariant();

        var response = await admin.Client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name = otherName });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("A")]
    [InlineData("1234567890123456789012345")]   // 25 characters
    public async Task Renaming_a_team_to_an_invalid_name_is_400(string name)
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/teams/{teamId}", new { name });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Renaming_an_unknown_team_is_404()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PatchAsJsonAsync("/api/teams/999999", new { name = "Whatever" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Renaming_a_team_from_another_event_is_404_and_leaves_it_alone()
    {
        var other = await factory.CreateOtherEventAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/teams/{other.TeamId}", new { name = "Hijacked" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual("Hijacked", await factory.WithDbAsync(db => db.Teams.Where(t => t.Id == other.TeamId).Select(t => t.Name).SingleAsync()));
    }

    // ---- DELETE /api/teams/{id} --------------------------------------------------------------------------------------

    [Fact]
    public async Task Deleting_an_empty_team_returns_204_and_removes_it()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();

        var response = await admin.Client.DeleteAsync($"/api/teams/{teamId}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await factory.WithDbAsync(db => db.Teams.AnyAsync(t => t.Id == teamId)));
    }

    [Fact]
    public async Task Deleting_a_team_that_has_players_is_409_and_keeps_the_team()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        (await factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), ApiHelpers.UniqueName("Disp"), teamId)).EnsureSuccessStatusCode();

        var response = await admin.Client.DeleteAsync($"/api/teams/{teamId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.True(await factory.WithDbAsync(db => db.Teams.AnyAsync(t => t.Id == teamId)));
    }

    [Fact]
    public async Task Deleting_a_team_that_has_score_rows_is_409()
    {
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        await factory.WithDbAsync(async db =>
        {
            db.ScoreAdjustments.Add(new ScoreAdjustment
            {
                EventId = await ApiHelpers.ActiveEventIdAsync(db), TeamId = teamId, Amount = 10,
                CreatedAt = DateTimeOffset.UtcNow, CreatedByPlayerId = admin.PlayerId,
            });
            await db.SaveChangesAsync();
        });

        var response = await admin.Client.DeleteAsync($"/api/teams/{teamId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_a_team_that_has_buzz_history_is_409_not_a_foreign_key_500()
    {
        // The buzz guard exists because BuzzRecord.TeamId is a Restrict FK: without the check this would throw.
        var admin = await factory.CreateAdminAsync();
        var teamId = await admin.CreateTeamAsync();
        await factory.WithDbAsync(async db =>
        {
            var eventId = await ApiHelpers.ActiveEventIdAsync(db);
            var round = new Round { Id = Guid.CreateVersion7(), EventId = eventId, StartedAt = DateTimeOffset.UtcNow };
            round.Buzzes.Add(new BuzzRecord { PlayerId = admin.PlayerId, TeamId = teamId, Sequence = 1, CountedForTeam = true });
            db.Rounds.Add(round);
            await db.SaveChangesAsync();
        });

        var response = await admin.Client.DeleteAsync($"/api/teams/{teamId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.True(await factory.WithDbAsync(db => db.Teams.AnyAsync(t => t.Id == teamId)));
    }

    [Fact]
    public async Task Deleting_an_unknown_team_is_404()
    {
        var admin = await factory.CreateAdminAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync("/api/teams/999999")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_team_from_another_event_is_404_and_keeps_it()
    {
        var other = await factory.CreateOtherEventAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.DeleteAsync($"/api/teams/{other.TeamId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.True(await factory.WithDbAsync(db => db.Teams.AnyAsync(t => t.Id == other.TeamId)));
    }
}
