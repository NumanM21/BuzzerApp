using System.Net;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// Finalize and export. Almost every test builds an event of its own (see <c>CreateRoundEventAsync</c>) and acts as that
/// event's admin with a minted cookie, so the document holds exactly the teams and players the test made and can be
/// compared with the rule applied to the data, never with the 2026 seed.
/// </summary>
[Collection(ApiCollection.Name)]
public class ArchiveEndpointsTests(ApiFactory factory)
{
    // (teams, players per team): one team, a team with nobody in it, ties between many, and a crowd.
    public static TheoryData<int, int> Shapes => new()
    {
        { 1, 1 },
        { 2, 0 },
        { 2, 3 },
        { 6, 2 },
        { 13, 1 },
        { 30, 1 },
    };

    private HttpClient ClientFor(Player player, WebApplicationFactory<Program>? app = null)
    {
        var client = (app ?? factory).CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", (app ?? factory).CookieFor(player));
        return client;
    }

    private static Task<HttpResponseMessage> FinalizeAsync(HttpClient client) => client.PostAsync("/api/archive/finalize", content: null);

    private static Task<HttpResponseMessage> ExportAsync(HttpClient client, int eventId) => client.GetAsync($"/api/archive/{eventId}/export");

    private async Task<JsonElement> FinalizeAndExportAsync(HttpClient client, int eventId)
    {
        (await FinalizeAsync(client)).EnsureSuccessStatusCode();
        var export = await ExportAsync(client, eventId);
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        return await export.ReadJsonAsync();
    }

    private async Task AddLedgerRowAsync(RoundEvent ev, int amount, int? teamId = null, int? playerId = null) =>
        await factory.WithDbAsync(async db =>
        {
            db.ScoreAdjustments.Add(new ScoreAdjustment
            {
                EventId = ev.EventId,
                TeamId = teamId,
                PlayerId = playerId,
                Amount = amount,
                CreatedAt = DateTimeOffset.UtcNow,
                CreatedByPlayerId = ev.Admin.Id,
            });
            await db.SaveChangesAsync();
        });

    // Standard competition ranking: one more than the number of strictly higher totals.
    private static int RankOf(int total, IEnumerable<int> allTotals) => 1 + allTotals.Count(t => t > total);

    /// <summary>Scores that include ties, a negative total, a team with no rows at all, and totals made of several rows.</summary>
    private async Task<(int[] TeamTotals, Dictionary<int, int> PlayerTotals)> ScoreAsync(RoundEvent ev)
    {
        var teamTotals = new int[ev.Teams.Count];
        for (var i = 0; i < ev.Teams.Count; i++)
        {
            if (i % 4 == 0)
            {
                continue;   // no ledger rows: the team must still be in the document, at zero
            }

            var total = (i % 3) * 10 - 5;
            await AddLedgerRowAsync(ev, total + 7, teamId: ev.Teams[i].Id);
            await AddLedgerRowAsync(ev, -7, teamId: ev.Teams[i].Id);
            teamTotals[i] = total;
        }

        var playerTotals = new Dictionary<int, int>();
        var n = 0;
        foreach (var player in ev.Players)
        {
            var total = (n++ % 3) * 5;   // 0, 5, 10, 0, ...: ties, and players with no ledger rows
            if (total != 0)
            {
                await AddLedgerRowAsync(ev, total, playerId: player.Id);
            }

            playerTotals[player.Id] = total;
        }

        // A player promoted to admin keeps the old ledger rows. They must not reach the document.
        await AddLedgerRowAsync(ev, 999, playerId: ev.Admin.Id);
        return (teamTotals, playerTotals);
    }

    [Theory]
    [MemberData(nameof(Shapes))]
    public async Task Finalize_then_export_gives_a_version_1_document_with_the_right_totals_ranks_and_order(int teamCount, int playersPerTeam)
    {
        var ev = await factory.CreateRoundEventAsync(teamCount, playersPerTeam);
        var (teamTotals, playerTotals) = await ScoreAsync(ev);
        var client = ClientFor(ev.Admin);

        var doc = await FinalizeAndExportAsync(client, ev.EventId);

        Assert.Equal(["schemaVersion", "generatedAt", "event", "teams", "players", "stats"], doc.EnumerateObject().Select(p => p.Name));
        Assert.Equal(1, doc.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(["name", "year", "themeKey"], doc.GetProperty("event").EnumerateObject().Select(p => p.Name));
        Assert.Equal("Round test", doc.GetProperty("event").GetProperty("name").GetString());
        Assert.Equal(2000, doc.GetProperty("event").GetProperty("year").GetInt32());
        Assert.Equal("default", doc.GetProperty("event").GetProperty("themeKey").GetString());

        // Teams: rank (total, highest first), then SortOrder, Id. SortOrder is the index here and rises with Id.
        var expectedTeams = ev.Teams.Select((t, i) => (Team: t, Index: i, Total: teamTotals[i]))
            .OrderByDescending(x => x.Total).ThenBy(x => x.Index).ToList();
        var teams = doc.GetProperty("teams").EnumerateArray().ToList();
        Assert.Equal(expectedTeams.Select(x => x.Team.Name), teams.Select(t => t.GetProperty("name").GetString()));
        for (var i = 0; i < teams.Count; i++)
        {
            var team = teams[i];
            var expected = expectedTeams[i];
            Assert.Equal(["name", "colorKey", "iconKey", "total", "rank", "members"], team.EnumerateObject().Select(p => p.Name));
            Assert.Equal(expected.Team.ColorKey, team.GetProperty("colorKey").GetString());
            Assert.Equal("icon", team.GetProperty("iconKey").GetString());
            Assert.Equal(expected.Total, team.GetProperty("total").GetInt32());
            Assert.Equal(RankOf(expected.Total, teamTotals), team.GetProperty("rank").GetInt32());

            // Members: display name ignoring case, then Id. Real names are in the file (it is admin-only).
            var expectedMembers = ev.PlayersByTeam[expected.Index]
                .OrderBy(p => p.DisplayName, StringComparer.OrdinalIgnoreCase).ThenBy(p => p.Id).ToList();
            var members = team.GetProperty("members").EnumerateArray().ToList();
            Assert.Equal(expectedMembers.Select(p => p.DisplayName), members.Select(m => m.GetProperty("displayName").GetString()));
            Assert.Equal(expectedMembers.Select(p => p.RealName), members.Select(m => m.GetProperty("realName").GetString()));
            Assert.Equal(expectedMembers.Select(p => playerTotals[p.Id]), members.Select(m => m.GetProperty("total").GetInt32()));
            Assert.All(members, m => Assert.Equal(["displayName", "realName", "total"], m.EnumerateObject().Select(p => p.Name)));
        }

        // Players: rank, then display name ignoring case, then Id. The admin's 999 is nowhere.
        var expectedPlayers = ev.PlayersByTeam
            .SelectMany((players, teamIndex) => players.Select(p => (Player: p, TeamName: ev.Teams[teamIndex].Name)))
            .OrderByDescending(x => playerTotals[x.Player.Id])
            .ThenBy(x => x.Player.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.Player.Id)
            .ToList();
        var players = doc.GetProperty("players").EnumerateArray().ToList();
        Assert.Equal(expectedPlayers.Select(x => x.Player.DisplayName), players.Select(p => p.GetProperty("displayName").GetString()));
        Assert.Equal(expectedPlayers.Select(x => x.Player.RealName), players.Select(p => p.GetProperty("realName").GetString()));
        Assert.Equal(expectedPlayers.Select(x => x.TeamName), players.Select(p => p.GetProperty("teamName").GetString()));
        Assert.Equal(expectedPlayers.Select(x => playerTotals[x.Player.Id]), players.Select(p => p.GetProperty("total").GetInt32()));
        Assert.Equal(expectedPlayers.Select(x => RankOf(playerTotals[x.Player.Id], playerTotals.Values)), players.Select(p => p.GetProperty("rank").GetInt32()));
        Assert.DoesNotContain(players, p => p.GetProperty("displayName").GetString() == ev.Admin.DisplayName);
        Assert.DoesNotContain(teams.SelectMany(t => t.GetProperty("members").EnumerateArray()), m => m.GetProperty("displayName").GetString() == ev.Admin.DisplayName);

        // No rounds were played in this event.
        Assert.Equal(0, doc.GetProperty("stats").GetProperty("roundsPlayed").GetInt32());
        Assert.Equal(0, doc.GetProperty("stats").GetProperty("totalBuzzes").GetInt32());
    }

    [Fact]
    public async Task Team_and_player_totals_stay_separate_in_the_document()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 1);
        await AddLedgerRowAsync(ev, 40, teamId: ev.Teams[0].Id);
        await AddLedgerRowAsync(ev, 500, playerId: ev.PlayersByTeam[0][0].Id);

        var doc = await FinalizeAndExportAsync(ClientFor(ev.Admin), ev.EventId);

        var first = doc.GetProperty("teams")[0];
        Assert.Equal(ev.Teams[0].Name, first.GetProperty("name").GetString());
        Assert.Equal(40, first.GetProperty("total").GetInt32());
        Assert.Equal(500, first.GetProperty("members")[0].GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Finalize_reports_the_event_and_marks_it_finalized_without_touching_other_events()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);
        var bystander = await factory.CreateRoundEventAsync(2, 1);
        var before = DateTimeOffset.UtcNow.AddSeconds(-1);

        var response = await FinalizeAsync(ClientFor(ev.Admin));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadJsonAsync();
        Assert.Equal(ev.EventId, body.GetProperty("eventId").GetInt32());
        Assert.Equal(2000, body.GetProperty("year").GetInt32());
        Assert.Equal(1, body.GetProperty("schemaVersion").GetInt32());
        var finalizedAt = body.GetProperty("finalizedAt").GetDateTimeOffset();
        Assert.True(finalizedAt > before);

        await factory.WithDbAsync(async db =>
        {
            var stored = await db.Events.AsNoTracking().SingleAsync(e => e.Id == ev.EventId);
            Assert.NotNull(stored.FinalizedAt);
            Assert.True(Math.Abs((stored.FinalizedAt.Value - finalizedAt).TotalMilliseconds) < 1);

            var archive = await db.EventArchives.AsNoTracking().SingleAsync(a => a.EventId == ev.EventId);
            Assert.Equal(1, archive.SchemaVersion);
            Assert.Equal(ev.Admin.Id, archive.CreatedByPlayerId);

            Assert.Null((await db.Events.AsNoTracking().SingleAsync(e => e.Id == bystander.EventId)).FinalizedAt);
            Assert.False(await db.EventArchives.AnyAsync(a => a.EventId == bystander.EventId));
        });
    }

    [Fact]
    public async Task Export_is_a_json_attachment_named_for_the_year_that_must_not_be_cached()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);
        var client = ClientFor(ev.Admin);
        (await FinalizeAsync(client)).EnsureSuccessStatusCode();

        var response = await ExportAsync(client, ev.EventId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("buzzer-archive-2000.json", response.Content.Headers.ContentDisposition?.FileName);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        Assert.Contains("\n", await response.Content.ReadAsStringAsync());   // indented, so it can be read and diffed by a person
    }

    [Fact]
    public async Task Finalizing_again_replaces_the_archive_with_the_current_data()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);
        var client = ClientFor(ev.Admin);
        var first = await FinalizeAndExportAsync(client, ev.EventId);
        Assert.Equal(0, first.GetProperty("teams")[0].GetProperty("total").GetInt32());
        var firstFinalizedAt = await factory.WithDbAsync(db => db.Events.Where(e => e.Id == ev.EventId).Select(e => e.FinalizedAt).SingleAsync());

        await AddLedgerRowAsync(ev, 25, teamId: ev.Teams[1].Id);
        var second = await FinalizeAndExportAsync(client, ev.EventId);

        var top = second.GetProperty("teams")[0];
        Assert.Equal(ev.Teams[1].Name, top.GetProperty("name").GetString());
        Assert.Equal(25, top.GetProperty("total").GetInt32());
        Assert.Equal(1, top.GetProperty("rank").GetInt32());
        Assert.True(second.GetProperty("generatedAt").GetDateTimeOffset() >= first.GetProperty("generatedAt").GetDateTimeOffset());
        await factory.WithDbAsync(async db =>
        {
            Assert.Equal(1, await db.EventArchives.CountAsync(a => a.EventId == ev.EventId));
            var finalizedAt = (await db.Events.AsNoTracking().SingleAsync(e => e.Id == ev.EventId)).FinalizedAt;
            Assert.True(finalizedAt >= firstFinalizedAt);
        });
    }

    [Fact]
    public async Task Finalizing_unchanged_data_twice_gives_the_same_document_apart_from_generatedAt()
    {
        var ev = await factory.CreateRoundEventAsync(6, 3);
        await ScoreAsync(ev);
        var client = ClientFor(ev.Admin);

        var first = await FinalizeAndExportAsync(client, ev.EventId);
        var second = await FinalizeAndExportAsync(client, ev.EventId);

        Assert.Equal(WithoutGeneratedAt(first), WithoutGeneratedAt(second));
    }

    private static string WithoutGeneratedAt(JsonElement doc) =>
        string.Join(",", doc.EnumerateObject().Where(p => p.Name != "generatedAt").Select(p => p.ToString()));

    [Fact]
    public async Task Racing_finalizes_all_succeed_and_leave_one_archive_row()
    {
        // The race is between "no archive yet" and the insert, so each round uses a fresh event (nothing to update) and
        // many callers; one round alone often finishes before the others start.
        for (var round = 0; round < 5; round++)
        {
            var ev = await factory.CreateRoundEventAsync(3, 2);
            await ScoreAsync(ev);
            var client = ClientFor(ev.Admin);

            var responses = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ => Task.Run(() => FinalizeAsync(client))));

            Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
            Assert.Equal(1, await factory.WithDbAsync(db => db.EventArchives.CountAsync(a => a.EventId == ev.EventId)));
            var export = await (await ExportAsync(client, ev.EventId)).ReadJsonAsync();
            Assert.Equal(1, export.GetProperty("schemaVersion").GetInt32());
        }
    }

    [Fact]
    public async Task Stats_count_the_locked_rounds_of_this_event_and_every_recorded_buzz()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 2, playersPerTeam: 2);
        var other = await factory.CreateOtherEventAsync();
        await using var host = GameHost.Start(factory);
        var a1 = ev.PlayersByTeam[0][0];
        var a2 = ev.PlayersByTeam[0][1];
        var b1 = ev.PlayersByTeam[1][0];
        await using var admin = await host.ConnectAsync(ev.Admin);
        await using var pa1 = await host.ConnectAsync(a1);
        await using var pa2 = await host.ConnectAsync(a2);
        await using var pb1 = await host.ConnectAsync(b1);

        // A real round: a teammate's second buzz is recorded but not counted for the team, and the last team to buzz locks it.
        await admin.InvokeAsync("BeginRound");
        await pa1.InvokeAsync("Buzz");
        await pa2.InvokeAsync("Buzz");
        await pb1.InvokeAsync("Buzz");
        await factory.EventuallyAsync(
            async db => await db.BuzzRecords.CountAsync(b => db.Rounds.Any(r => r.Id == b.RoundId && r.EventId == ev.EventId)) == 3,
            "the round's three buzzes to be saved");

        await factory.WithDbAsync(async db =>
        {
            // Never-locked rounds aren't "played", and another event's rounds and buzzes aren't ours.
            db.Rounds.Add(new Round { Id = Guid.CreateVersion7(), EventId = ev.EventId, StartedAt = DateTimeOffset.UtcNow });
            var foreign = new Round { Id = Guid.CreateVersion7(), EventId = other.EventId, StartedAt = DateTimeOffset.UtcNow, LockedAt = DateTimeOffset.UtcNow };
            foreign.Buzzes.Add(new BuzzRecord { PlayerId = other.PlayerId, TeamId = other.TeamId, Sequence = 1, CountedForTeam = true, TeamQueuePosition = 1 });
            db.Rounds.Add(foreign);
            await db.SaveChangesAsync();
        });

        var doc = await FinalizeAndExportAsync(ClientFor(ev.Admin, host.App), ev.EventId);

        Assert.Equal(1, doc.GetProperty("stats").GetProperty("roundsPlayed").GetInt32());
        Assert.Equal(3, doc.GetProperty("stats").GetProperty("totalBuzzes").GetInt32());
    }

    [Fact]
    public async Task An_event_with_no_teams_and_no_players_still_finalizes()
    {
        var ev = await factory.CreateRoundEventAsync(teamCount: 0, playersPerTeam: 0);

        var doc = await FinalizeAndExportAsync(ClientFor(ev.Admin), ev.EventId);

        Assert.Equal(0, doc.GetProperty("teams").GetArrayLength());
        Assert.Equal(0, doc.GetProperty("players").GetArrayLength());
    }

    [Fact]
    public async Task Export_before_finalizing_is_404()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);

        var response = await ExportAsync(ClientFor(ev.Admin), ev.EventId);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Export_of_an_unknown_event_is_404()
    {
        var admin = await factory.CreateAdminAsync();

        var response = await ExportAsync(admin.Client, 999_999_999);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task One_events_admin_cannot_export_another_events_archive()
    {
        var mine = await factory.CreateRoundEventAsync(2, 1);
        var theirs = await factory.CreateRoundEventAsync(2, 1);
        var theirClient = ClientFor(theirs.Admin);
        (await FinalizeAsync(theirClient)).EnsureSuccessStatusCode();

        var response = await ExportAsync(ClientFor(mine.Admin), theirs.EventId);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ExportAsync(theirClient, theirs.EventId)).StatusCode);
    }

    [Fact]
    public async Task Finalize_archives_the_callers_own_event_not_the_active_one()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);
        var activeEventId = await factory.WithDbAsync(ApiHelpers.ActiveEventIdAsync);

        (await FinalizeAsync(ClientFor(ev.Admin))).EnsureSuccessStatusCode();

        Assert.True(await factory.WithDbAsync(db => db.EventArchives.AnyAsync(a => a.EventId == ev.EventId)));
        Assert.False(await factory.WithDbAsync(db => db.EventArchives.AnyAsync(a => a.EventId == activeEventId && a.CreatedByPlayerId == ev.Admin.Id)));
    }

    [Fact]
    public async Task The_active_events_admin_can_finalize_and_export_end_to_end_through_a_real_sign_in()
    {
        var admin = await factory.CreateAdminAsync();
        var eventId = await factory.WithDbAsync(ApiHelpers.ActiveEventIdAsync);

        (await FinalizeAsync(admin.Client)).EnsureSuccessStatusCode();
        var export = await ExportAsync(admin.Client, eventId);

        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        var doc = await export.ReadJsonAsync();
        Assert.Equal(1, doc.GetProperty("schemaVersion").GetInt32());

        // The active event's document lists every team the database holds for it (the shared database has more than the seed).
        var teams = await factory.ActiveEventTeamsAsync();
        Assert.Equal(teams.Count, doc.GetProperty("teams").GetArrayLength());
        Assert.Equal(
            teams.Select(t => t.Name).Order(StringComparer.Ordinal),
            doc.GetProperty("teams").EnumerateArray().Select(t => t.GetProperty("name").GetString()!).Order(StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("POST", "/api/archive/finalize")]
    [InlineData("GET", "/api/archive/1/export")]
    public async Task Anonymous_callers_get_401(string method, string url)
    {
        var response = await factory.CreateBrowser().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("POST", "/api/archive/finalize")]
    [InlineData("GET", "/api/archive/1/export")]
    public async Task Players_get_403(string method, string url)
    {
        var player = await factory.RegisterNewPlayerAsync();

        var response = await player.Client.SendAsync(new HttpRequestMessage(new HttpMethod(method), url));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task A_player_cannot_export_even_their_own_events_finalized_archive()
    {
        var ev = await factory.CreateRoundEventAsync(2, 1);
        (await FinalizeAsync(ClientFor(ev.Admin))).EnsureSuccessStatusCode();

        var response = await ExportAsync(ClientFor(ev.PlayersByTeam[0][0]), ev.EventId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
