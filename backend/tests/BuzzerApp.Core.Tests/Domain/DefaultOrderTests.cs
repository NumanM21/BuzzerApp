using BuzzerApp.Core.Domain;

namespace BuzzerApp.Core.Tests.Domain;

/// <summary>The default list orders. Every list the app returns goes through these, so the tiebreakers are pinned here once.</summary>
public class DefaultOrderTests
{
    private static readonly DateTimeOffset Now = new(2026, 12, 5, 19, 0, 0, TimeSpan.Zero);

    private static Team NewTeam(int id, int sortOrder) => new(1, $"Team {id}", $"colour-{id}", "icon", sortOrder, Now) { Id = id };

    private static Player NewPlayer(int id, string displayName) => new(1, $"Real {id}", displayName, PlayerRole.Player, 1, Now) { Id = id };

    public static TheoryData<int> Counts => new() { 1, 2, 6, 13, 30 };

    [Theory]
    [MemberData(nameof(Counts))]
    public void Teams_come_out_by_sort_order_then_id_however_they_went_in(int count)
    {
        // Sort orders repeat (two admins can create teams at once), so the id has to decide between them.
        var teams = Enumerable.Range(1, count).Select(id => NewTeam(id, sortOrder: id % 3)).ToList();
        var expected = teams.OrderBy(t => t.SortOrder).ThenBy(t => t.Id).Select(t => t.Id).ToList();

        foreach (var shuffled in new[] { teams, Enumerable.Reverse(teams).ToList(), teams.OrderBy(t => t.Id * 7 % 11).ToList() })
        {
            Assert.Equal(expected, shuffled.AsQueryable().InDisplayOrder().Select(t => t.Id));
        }
    }

    [Fact]
    public void Teams_with_the_same_sort_order_are_ordered_by_id()
    {
        var teams = new[] { NewTeam(9, 500), NewTeam(3, 500), NewTeam(5, 0) };

        Assert.Equal([5, 3, 9], teams.AsQueryable().InDisplayOrder().Select(t => t.Id));
    }

    [Fact]
    public void People_are_ordered_by_display_name_ignoring_case()
    {
        var players = new[] { NewPlayer(1, "bob"), NewPlayer(2, "Alice"), NewPlayer(3, "alfred"), NewPlayer(4, "Bea") };

        Assert.Equal(["alfred", "Alice", "Bea", "bob"], players.InNameOrder().Select(p => p.DisplayName));
    }

    [Theory]
    [MemberData(nameof(Counts))]
    public void People_with_names_that_differ_only_by_case_fall_back_to_id_however_they_went_in(int count)
    {
        // Display names are unique per event, but a list can mix events or projections; the id keeps it deterministic anyway.
        var players = Enumerable.Range(1, count).Select(id => NewPlayer(id, id % 2 == 0 ? "sam" : "SAM")).ToList();

        Assert.Equal(Enumerable.Range(1, count), players.InNameOrder().Select(p => p.Id));
        Assert.Equal(Enumerable.Range(1, count), Enumerable.Reverse(players).ToList().InNameOrder().Select(p => p.Id));
    }

    [Fact]
    public void Any_shape_with_a_name_and_an_id_can_use_the_same_order()
    {
        var rows = new[] { (Id: 2, Name: "zed"), (Id: 1, Name: "Zed"), (Id: 3, Name: "amy") };

        Assert.Equal([3, 1, 2], rows.InNameOrder(r => r.Name, r => r.Id).Select(r => r.Id));
    }
}
