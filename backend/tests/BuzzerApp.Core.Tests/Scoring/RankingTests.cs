using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Core.Tests.Scoring;

public class RankingTests
{
    private sealed record Entry(string Name, int Total);

    private static IReadOnlyList<(string Name, int Rank)> RankNames(params Entry[] entries) =>
        Ranking.Rank(entries, e => e.Total).Select(r => (r.Item.Name, r.Rank)).ToList();

    [Fact]
    public void Orders_by_total_descending()
    {
        var ranked = RankNames(new("low", 10), new("high", 90), new("mid", 50));

        Assert.Equal([("high", 1), ("mid", 2), ("low", 3)], ranked);
    }

    [Fact]
    public void Ties_share_a_rank_and_the_next_rank_skips()
    {
        var ranked = RankNames(new("a", 100), new("b", 100), new("c", 90));

        Assert.Equal([("a", 1), ("b", 1), ("c", 3)], ranked);
    }

    [Fact]
    public void Tie_in_the_middle_skips_the_following_rank()
    {
        var ranked = RankNames(new("a", 100), new("b", 90), new("c", 90), new("d", 80));

        Assert.Equal([("a", 1), ("b", 2), ("c", 2), ("d", 4)], ranked);
    }

    [Fact]
    public void Everyone_tied_is_all_first()
    {
        var ranked = RankNames(new("a", 0), new("b", 0), new("c", 0));

        Assert.All(ranked, r => Assert.Equal(1, r.Rank));
    }

    [Fact]
    public void Ties_keep_input_order()
    {
        var ranked = RankNames(new("z", 5), new("y", 20), new("x", 5), new("w", 5));

        Assert.Equal(["y", "z", "x", "w"], ranked.Select(r => r.Name));
    }

    [Fact]
    public void Negative_totals_rank_below_zero()
    {
        var ranked = RankNames(new("neg", -10), new("zero", 0), new("pos", 10));

        Assert.Equal([("pos", 1), ("zero", 2), ("neg", 3)], ranked);
    }

    [Fact]
    public void Empty_input_gives_empty_result()
    {
        Assert.Empty(Ranking.Rank(Array.Empty<Entry>(), e => e.Total));
    }

    [Fact]
    public void Total_selector_is_called_once_per_item()
    {
        var calls = 0;
        Entry[] entries = [new("a", 3), new("b", 1), new("c", 2)];

        Ranking.Rank(entries, e => { calls++; return e.Total; });

        Assert.Equal(entries.Length, calls);
    }
}
