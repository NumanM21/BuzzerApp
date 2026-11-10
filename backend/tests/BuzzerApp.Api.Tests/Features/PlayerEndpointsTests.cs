using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

[Collection(ApiCollection.Name)]
public class PlayerEndpointsTests(ApiFactory factory)
{
    // ---- GET /api/players -------------------------------------------------------------------------------------------

    [Fact]
    public async Task Listing_players_is_403_for_a_player_and_401_when_not_signed_in()
    {
        var player = await factory.RegisterNewPlayerAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.GetAsync("/api/players")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowser().GetAsync("/api/players")).StatusCode);
    }

    [Fact]
    public async Task An_admin_lists_every_player_with_real_names_roles_and_team_names()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var players = await (await admin.Client.GetAsync("/api/players")).ReadJsonAsync();

        var row = players.EnumerateArray().Single(p => p.GetProperty("id").GetInt32() == player.PlayerId);
        Assert.Equal(player.RealName, row.GetProperty("realName").GetString());
        Assert.Equal(player.DisplayName, row.GetProperty("displayName").GetString());
        Assert.Equal("player", row.GetProperty("role").GetString());
        Assert.Equal(player.TeamId, row.GetProperty("teamId").GetInt32());
        Assert.Equal(await factory.TeamNameAsync(player.TeamId), row.GetProperty("teamName").GetString());

        var adminRow = players.EnumerateArray().Single(p => p.GetProperty("id").GetInt32() == admin.PlayerId);
        Assert.Equal("admin", adminRow.GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, adminRow.GetProperty("teamId").ValueKind);
        Assert.Equal(JsonValueKind.Null, adminRow.GetProperty("teamName").ValueKind);
    }

    [Fact]
    public async Task The_player_list_is_sorted_by_display_name_ignoring_case_and_is_identical_on_every_request()
    {
        var token = Guid.NewGuid().ToString("N")[..6];
        foreach (var display in new[] { $"zed {token}", $"Alpha {token}", $"mike {token}" })
        {
            (await factory.CreateBrowser().RegisterAsync(ApiHelpers.UniqueName("Real"), display, await factory.FirstTeamIdAsync())).EnsureSuccessStatusCode();
        }

        var admin = await factory.CreateAdminAsync();
        var first = await (await admin.Client.GetAsync("/api/players")).ReadJsonAsync();
        var second = await (await admin.Client.GetAsync("/api/players")).ReadJsonAsync();

        var names = first.EnumerateArray().Select(p => p.GetProperty("displayName").GetString()!).ToList();
        Assert.Equal(names.Order(StringComparer.OrdinalIgnoreCase), names);
        Assert.Equal(first.GetRawText(), second.GetRawText());   // same data, same bytes: no dependence on row order in the database
    }

    [Fact]
    public async Task The_player_list_does_not_include_players_from_another_event()
    {
        var other = await factory.CreateOtherEventAsync();
        var admin = await factory.CreateAdminAsync();

        var players = await (await admin.Client.GetAsync("/api/players")).ReadJsonAsync();

        Assert.DoesNotContain(players.EnumerateArray(), p => p.GetProperty("id").GetInt32() == other.PlayerId);
    }

    // ---- PATCH /api/players/me -----------------------------------------------------------------------------------------

    [Fact]
    public async Task A_player_can_change_their_own_display_name()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var newName = ApiHelpers.UniqueName("NewD");

        var response = await player.Client.PatchAsJsonAsync("/api/players/me", new { displayName = newName });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal(newName, body.GetProperty("displayName").GetString());
        Assert.Equal(player.RealName, body.GetProperty("realName").GetString());   // untouched when not sent
        Assert.Equal(await factory.TeamNameAsync(player.TeamId), body.GetProperty("teamName").GetString());
        Assert.Equal(newName, (await factory.GetPlayerAsync(player.PlayerId)).DisplayName);
    }

    [Fact]
    public async Task Changing_the_real_name_changes_what_signs_in_and_keeps_the_pin_working()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var newReal = ApiHelpers.UniqueName("NewR");

        (await player.Client.PatchAsJsonAsync("/api/players/me", new { realName = newReal })).EnsureSuccessStatusCode();

        var viaNewName = await factory.CreateBrowser().SignInAsync(newReal);
        Assert.Equal(HttpStatusCode.OK, viaNewName.StatusCode);
        Assert.Equal(player.PlayerId, (await viaNewName.ReadJsonAsync()).GetProperty("playerId").GetInt32());
        // The old name no longer identifies anyone.
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowser().SignInAsync(player.RealName)).StatusCode);
    }

    [Fact]
    public async Task Both_names_can_be_changed_in_one_request_and_the_teams_list_reflects_it()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var newReal = ApiHelpers.UniqueName("NewR");
        var newDisplay = ApiHelpers.UniqueName("NewD");

        (await player.Client.PatchAsJsonAsync("/api/players/me", new { realName = newReal, displayName = newDisplay })).EnsureSuccessStatusCode();

        var teams = await (await player.Client.GetAsync("/api/teams")).ReadJsonAsync();
        var member = teams.EnumerateArray().Single(t => t.GetProperty("id").GetInt32() == player.TeamId)
            .GetProperty("members").EnumerateArray().Single(m => m.GetProperty("playerId").GetInt32() == player.PlayerId);
        Assert.Equal(newDisplay, member.GetProperty("displayName").GetString());
        Assert.Equal(newReal, member.GetProperty("realName").GetString());
    }

    [Fact]
    public async Task A_player_can_change_only_the_capitalisation_of_their_own_name()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.PatchAsJsonAsync("/api/players/me",
            new { realName = player.RealName.ToUpperInvariant(), displayName = player.DisplayName.ToLowerInvariant() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);   // not a clash with themselves
    }

    [Fact]
    public async Task Editing_with_nothing_to_change_is_400()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.PatchAsJsonAsync("/api/players/me", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_names_are_400_and_every_bad_field_is_listed()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.PatchAsJsonAsync("/api/players/me", new { realName = "A", displayName = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadJsonAsync()).GetProperty("errors");
        Assert.Equal(["displayName", "realName"], errors.EnumerateObject().Select(p => p.Name).Order().ToArray());
        Assert.NotEqual("A", (await factory.GetPlayerAsync(player.PlayerId)).RealName);
    }

    [Fact]
    public async Task Taking_another_players_display_name_is_409_whatever_the_case()
    {
        var first = await factory.RegisterNewPlayerAsync();
        var second = await factory.RegisterNewPlayerAsync();

        var response = await second.Client.PatchAsJsonAsync("/api/players/me", new { displayName = $" {first.DisplayName.ToUpperInvariant()} " });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(second.DisplayName, (await factory.GetPlayerAsync(second.PlayerId)).DisplayName);
    }

    [Fact]
    public async Task Taking_another_players_real_name_is_409_and_changes_nothing()
    {
        var first = await factory.RegisterNewPlayerAsync();
        var second = await factory.RegisterNewPlayerAsync();
        var freeDisplay = ApiHelpers.UniqueName("Free");

        // The display name is free but the real name isn't: the whole request must fail, not half apply.
        var response = await second.Client.PatchAsJsonAsync("/api/players/me", new { realName = first.RealName.ToLowerInvariant(), displayName = freeDisplay });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var stored = await factory.GetPlayerAsync(second.PlayerId);
        Assert.Equal(second.RealName, stored.RealName);
        Assert.Equal(second.DisplayName, stored.DisplayName);
    }

    [Fact]
    public async Task Two_players_claiming_the_same_free_display_name_at_once_get_one_200_and_one_409()
    {
        var first = await factory.RegisterNewPlayerAsync();
        var second = await factory.RegisterNewPlayerAsync();
        var contested = ApiHelpers.UniqueName("Race");

        var results = await Task.WhenAll(
            first.Client.PatchAsJsonAsync("/api/players/me", new { displayName = contested }),
            second.Client.PatchAsJsonAsync("/api/players/me", new { displayName = contested }));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], results.Select(r => r.StatusCode).Order().ToArray());
    }

    [Fact]
    public async Task Editing_own_names_requires_signing_in()
    {
        var response = await factory.CreateBrowser().PatchAsJsonAsync("/api/players/me", new { displayName = "Nope" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---- PATCH /api/players/{id} ------------------------------------------------------------------------------------------

    [Fact]
    public async Task An_admin_can_edit_any_players_names()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();
        var newDisplay = ApiHelpers.UniqueName("ByAdmin");

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}", new { displayName = newDisplay });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(newDisplay, (await factory.GetPlayerAsync(player.PlayerId)).DisplayName);
    }

    [Fact]
    public async Task A_player_cannot_edit_another_players_names_through_the_admin_route()
    {
        var victim = await factory.RegisterNewPlayerAsync();
        var attacker = await factory.RegisterNewPlayerAsync();

        var response = await attacker.Client.PatchAsJsonAsync($"/api/players/{victim.PlayerId}", new { displayName = "Hacked" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(victim.DisplayName, (await factory.GetPlayerAsync(victim.PlayerId)).DisplayName);
    }

    [Fact]
    public async Task An_admin_editing_to_a_taken_name_gets_409()
    {
        var first = await factory.RegisterNewPlayerAsync();
        var second = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{second.PlayerId}", new { displayName = first.DisplayName });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Editing_an_unknown_player_or_one_from_another_event_is_404()
    {
        var other = await factory.CreateOtherEventAsync();
        var admin = await factory.CreateAdminAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PatchAsJsonAsync("/api/players/999999", new { displayName = "Ghost" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PatchAsJsonAsync($"/api/players/{other.PlayerId}", new { displayName = "Hijacked" })).StatusCode);
        Assert.NotEqual("Hijacked", (await factory.GetPlayerAsync(other.PlayerId)).DisplayName);
    }

    // ---- PATCH /api/players/{id}/team ---------------------------------------------------------------------------------------

    [Fact]
    public async Task An_admin_can_move_a_player_to_another_team()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();
        var target = await factory.NewTeamIdAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { teamId = target });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal(target, body.GetProperty("teamId").GetInt32());
        Assert.Equal(await factory.TeamNameAsync(target), body.GetProperty("teamName").GetString());
        Assert.Equal(target, (await factory.GetPlayerAsync(player.PlayerId)).TeamId);

        // And the Teams screen shows them in the new team only.
        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();
        bool IsMemberOf(int teamId) => teams.EnumerateArray().Single(t => t.GetProperty("id").GetInt32() == teamId)
            .GetProperty("members").EnumerateArray().Any(m => m.GetProperty("playerId").GetInt32() == player.PlayerId);
        Assert.True(IsMemberOf(target));
        Assert.False(IsMemberOf(player.TeamId));
    }

    [Fact]
    public async Task Moving_a_player_to_the_team_they_are_already_on_is_a_200_no_op()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { teamId = player.TeamId });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(player.TeamId, (await factory.GetPlayerAsync(player.PlayerId)).TeamId);
    }

    [Fact]
    public async Task A_player_cannot_move_themselves_or_anyone_else()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var target = await factory.NewTeamIdAsync();

        var response = await player.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { teamId = target });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);   // D21: players can't switch teams
        Assert.Equal(player.TeamId, (await factory.GetPlayerAsync(player.PlayerId)).TeamId);
    }

    [Fact]
    public async Task An_admin_cannot_be_put_on_a_team()
    {
        var admin = await factory.CreateAdminAsync();
        var target = await factory.NewTeamIdAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{admin.PlayerId}/team", new { teamId = target });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null((await factory.GetPlayerAsync(admin.PlayerId)).TeamId);
    }

    [Fact]
    public async Task Moving_to_a_team_from_another_event_or_one_that_does_not_exist_is_400()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();

        var foreign = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { teamId = other.TeamId });
        var missing = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { teamId = 999999 });

        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal(player.TeamId, (await factory.GetPlayerAsync(player.PlayerId)).TeamId);
    }

    [Fact]
    public async Task Moving_without_a_team_id_is_400()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PatchAsJsonAsync($"/api/players/{player.PlayerId}/team", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Moving_an_unknown_player_or_one_from_another_event_is_404()
    {
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();
        var target = await factory.NewTeamIdAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PatchAsJsonAsync("/api/players/999999/team", new { teamId = target })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PatchAsJsonAsync($"/api/players/{other.PlayerId}/team", new { teamId = target })).StatusCode);
        Assert.Equal(other.TeamId, (await factory.GetPlayerAsync(other.PlayerId)).TeamId);
    }

    // ---- POST /api/players/{id}/promote ---------------------------------------------------------------------------------------

    [Fact]
    public async Task Promoting_a_player_makes_them_an_admin_with_no_team()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsync($"/api/players/{player.PlayerId}/promote", content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal("admin", body.GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("teamId").ValueKind);
        var stored = await factory.GetPlayerAsync(player.PlayerId);
        Assert.Equal(PlayerRole.Admin, stored.Role);
        Assert.Null(stored.TeamId);

        var teams = await (await admin.Client.GetAsync("/api/teams")).ReadJsonAsync();
        Assert.DoesNotContain(teams.EnumerateArray().SelectMany(t => t.GetProperty("members").EnumerateArray()),
            m => m.GetProperty("playerId").GetInt32() == player.PlayerId);
    }

    [Fact]
    public async Task A_promoted_player_can_use_admin_routes_after_signing_in_again()
    {
        var player = await factory.RegisterNewPlayerAsync();
        var admin = await factory.CreateAdminAsync();
        (await admin.Client.PostAsync($"/api/players/{player.PlayerId}/promote", content: null)).EnsureSuccessStatusCode();

        // Known limit (B3): the old cookie still says Player until the next sign-in.
        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.GetAsync("/api/players")).StatusCode);

        var fresh = factory.CreateBrowser();
        (await fresh.SignInAsync(player.RealName)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await fresh.GetAsync("/api/players")).StatusCode);
    }

    [Fact]
    public async Task Promoting_an_existing_admin_is_a_harmless_200()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await admin.Client.PostAsync($"/api/players/{admin.PlayerId}/promote", content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("admin", (await response.ReadJsonAsync()).GetProperty("role").GetString());
    }

    [Fact]
    public async Task A_player_cannot_promote_themselves()
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.PostAsync($"/api/players/{player.PlayerId}/promote", content: null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(PlayerRole.Player, (await factory.GetPlayerAsync(player.PlayerId)).Role);
    }

    [Fact]
    public async Task Promoting_an_unknown_player_or_one_from_another_event_is_404()
    {
        var admin = await factory.CreateAdminAsync();
        var other = await factory.CreateOtherEventAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync("/api/players/999999/promote", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync($"/api/players/{other.PlayerId}/promote", content: null)).StatusCode);
        Assert.Equal(PlayerRole.Player, (await factory.GetPlayerAsync(other.PlayerId)).Role);
    }

    [Fact]
    public async Task Admin_player_routes_are_401_when_not_signed_in()
    {
        var client = factory.CreateBrowser();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync("/api/players/1", new { displayName = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync("/api/players/1/team", new { teamId = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/players/1/promote", content: null)).StatusCode);
    }
}
