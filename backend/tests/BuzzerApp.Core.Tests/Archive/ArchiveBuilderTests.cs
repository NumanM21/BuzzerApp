using System.Text.Json;
using BuzzerApp.Core.Archive;

namespace BuzzerApp.Core.Tests.Archive;

public class ArchiveBuilderTests
{
    private static readonly DateTimeOffset At = new(2026, 12, 5, 21, 0, 0, TimeSpan.Zero);
    private static readonly ArchiveEventInfo Info = new("Games night", 2026, "arcade-2026");
    private static readonly ArchiveStats NoStats = new(0, 0);

    public static TheoryData<int> TeamCounts => new() { 1, 2, 6, 13, 30 };

    /// <summary>Teams 1..n in sort order, totals chosen by the caller.</summary>
    private static List<ArchiveTeamInput> Teams(params int[] totals) =>
        totals.Select((total, i) => new ArchiveTeamInput(i + 1, $"Team {i + 1}", $"color-{i + 1}", $"icon-{i + 1}", total)).ToList();

    private static ArchivePlayerInput Player(int id, string name, int? teamId, int total, bool admin = false) =>
        new(id, name, $"Real {name}", teamId, admin, total);

    private static ArchiveDocument Build(IEnumerable<ArchiveTeamInput> teams, IEnumerable<ArchivePlayerInput> players, ArchiveStats? stats = null) =>
        ArchiveBuilder.Build(Info, teams, players, stats ?? NoStats, At);

    [Fact]
    public void Carries_the_event_the_stats_and_schema_version_one()
    {
        var stats = new ArchiveStats(RoundsPlayed: 7, TotalBuzzes: 91);

        var doc = Build(Teams(10), [], stats);

        Assert.Equal(1, doc.SchemaVersion);
        Assert.Equal(At, doc.GeneratedAt);
        Assert.Equal(Info, doc.Event);
        Assert.Equal(stats, doc.Stats);
    }

    [Theory]
    [MemberData(nameof(TeamCounts))]
    public void Ranks_teams_by_total_over_any_number_of_teams(int teamCount)
    {
        // Totals fall as the team number rises, so rank equals position in the input.
        var totals = Enumerable.Range(0, teamCount).Select(i => (teamCount - i) * 10).ToArray();

        var doc = Build(Teams(totals), []);

        Assert.Equal(teamCount, doc.Teams.Count);
        Assert.Equal(Enumerable.Range(1, teamCount), doc.Teams.Select(t => t.Rank));
        Assert.Equal(totals, doc.Teams.Select(t => t.Total));
    }

    [Fact]
    public void Teams_come_out_highest_total_first_whatever_the_input_order()
    {
        var doc = Build(Teams(10, 90, 50), []);

        Assert.Equal(["Team 2", "Team 3", "Team 1"], doc.Teams.Select(t => t.Name));
        Assert.Equal([1, 2, 3], doc.Teams.Select(t => t.Rank));
    }

    [Fact]
    public void Tied_teams_share_a_rank_keep_input_order_and_the_next_rank_skips()
    {
        var doc = Build(Teams(100, 90, 100, 100, 50), []);

        Assert.Equal(["Team 1", "Team 3", "Team 4", "Team 2", "Team 5"], doc.Teams.Select(t => t.Name));
        Assert.Equal([1, 1, 1, 4, 5], doc.Teams.Select(t => t.Rank));
    }

    [Fact]
    public void Negative_and_zero_totals_rank_below_positive_ones()
    {
        var doc = Build(Teams(-5, 0, 20, 0), []);

        Assert.Equal([("Team 3", 1), ("Team 2", 2), ("Team 4", 2), ("Team 1", 4)], doc.Teams.Select(t => (t.Name, t.Rank)));
    }

    [Fact]
    public void A_single_team_is_ranked_first()
    {
        var doc = Build(Teams(0), []);

        Assert.Equal(1, Assert.Single(doc.Teams).Rank);
    }

    [Fact]
    public void Team_colour_and_icon_keys_are_copied()
    {
        var doc = Build(Teams(10), []);

        var team = Assert.Single(doc.Teams);
        Assert.Equal("color-1", team.ColorKey);
        Assert.Equal("icon-1", team.IconKey);
    }

    [Fact]
    public void A_team_with_no_members_has_an_empty_member_list_and_still_ranks()
    {
        var doc = Build(Teams(30, 20), [Player(1, "Ann", teamId: 1, total: 5)]);

        Assert.Equal(["Ann"], doc.Teams[0].Members.Select(m => m.DisplayName));
        Assert.Empty(doc.Teams[1].Members);
        Assert.Equal(2, doc.Teams[1].Rank);
    }

    [Fact]
    public void Members_sit_under_their_own_team_in_input_order_with_their_own_totals()
    {
        var players = new[]
        {
            Player(1, "Ann", 1, 5),
            Player(2, "Bob", 2, 50),
            Player(3, "Cy", 1, 7),
        };

        var doc = Build(Teams(10, 20), players);

        var team1 = doc.Teams.Single(t => t.Name == "Team 1");
        Assert.Equal([("Ann", "Real Ann", 5), ("Cy", "Real Cy", 7)], team1.Members.Select(m => (m.DisplayName, m.RealName, m.Total)));
        Assert.Equal(["Bob"], doc.Teams.Single(t => t.Name == "Team 2").Members.Select(m => m.DisplayName));
    }

    [Fact]
    public void Player_scores_are_not_added_to_the_team_total()
    {
        var doc = Build(Teams(10), [Player(1, "Ann", 1, 500)]);

        Assert.Equal(10, Assert.Single(doc.Teams).Total);
    }

    [Fact]
    public void Players_are_ranked_by_total_with_ties_sharing_a_rank_in_input_order()
    {
        var players = new[]
        {
            Player(1, "Ann", 1, 10),
            Player(2, "Bob", 1, 30),
            Player(3, "Cy", 2, 30),
            Player(4, "Di", 2, 20),
        };

        var doc = Build(Teams(0, 0), players);

        Assert.Equal([("Bob", 1), ("Cy", 1), ("Di", 3), ("Ann", 4)], doc.Players.Select(p => (p.DisplayName, p.Rank)));
        Assert.Equal(["Team 1", "Team 2", "Team 2", "Team 1"], doc.Players.Select(p => p.TeamName));
        Assert.Equal("Real Bob", doc.Players[0].RealName);
    }

    [Fact]
    public void Admins_are_left_out_of_players_and_members_even_with_a_score_and_a_team()
    {
        var players = new[]
        {
            Player(1, "Ann", 1, 5),
            Player(2, "Boss", 1, 999, admin: true),
            Player(3, "Boss2", null, 999, admin: true),
        };

        var doc = Build(Teams(10), players);

        Assert.Equal(["Ann"], doc.Players.Select(p => p.DisplayName));
        Assert.Equal(["Ann"], Assert.Single(doc.Teams).Members.Select(m => m.DisplayName));
        Assert.Equal(1, doc.Players[0].Rank);   // the admin's 999 doesn't push Ann down
    }

    [Fact]
    public void A_player_without_a_team_is_listed_with_no_team_name_and_is_no_teams_member()
    {
        var doc = Build(Teams(10), [Player(1, "Ann", teamId: null, total: 5)]);

        Assert.Null(Assert.Single(doc.Players).TeamName);
        Assert.Empty(Assert.Single(doc.Teams).Members);
    }

    [Fact]
    public void No_teams_and_no_players_gives_an_empty_document()
    {
        var doc = Build([], []);

        Assert.Empty(doc.Teams);
        Assert.Empty(doc.Players);
    }

    [Fact]
    public void Building_twice_from_the_same_input_gives_identical_json()
    {
        var teams = Teams(30, 10, 30);
        var players = new[] { Player(1, "Ann", 1, 5), Player(2, "Bob", 2, 5), Player(3, "Cy", 3, 9) };

        Assert.Equal(Json(Build(teams, players)), Json(Build(teams, players)));
    }

    [Fact]
    public void The_same_data_in_any_input_order_gives_the_same_json_once_sorted_by_the_documented_rules()
    {
        // Equal totals and display names that differ only in case, so only the Id tiebreaker can decide.
        var teams = Teams(40, 40, 10, 40, 10);
        var players = new[]
        {
            Player(1, "ann", 1, 5),
            Player(2, "Ann", 1, 5),
            Player(3, "Bob", 2, 5),
            Player(4, "bob", 3, 9),
            Player(5, "Cy", 4, 9),
            Player(6, "Di", 4, 0),
            Player(7, "Boss", null, 5, admin: true),
        };
        var expected = Json(Build(SortTeams(teams), SortPlayers(players)));

        var random = new Random(12345);
        for (var i = 0; i < 25; i++)
        {
            var shuffledTeams = teams.OrderBy(_ => random.Next()).ToList();
            var shuffledPlayers = players.OrderBy(_ => random.Next()).ToList();

            Assert.Equal(expected, Json(Build(SortTeams(shuffledTeams), SortPlayers(shuffledPlayers))));
        }
    }

    // The order the endpoint feeds the builder (BackendSteps B7 "Order"): teams by SortOrder then Id (here the team
    // number is both), players by display name ignoring case then Id.
    private static IEnumerable<ArchiveTeamInput> SortTeams(IEnumerable<ArchiveTeamInput> teams) => teams.OrderBy(t => t.Id);

    private static IEnumerable<ArchivePlayerInput> SortPlayers(IEnumerable<ArchivePlayerInput> players) =>
        players.OrderBy(p => p.DisplayName, StringComparer.OrdinalIgnoreCase).ThenBy(p => p.Id);

    private static string Json(ArchiveDocument doc) => JsonSerializer.Serialize(doc, new JsonSerializerOptions(JsonSerializerDefaults.Web));
}
