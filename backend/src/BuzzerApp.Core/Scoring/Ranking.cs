namespace BuzzerApp.Core.Scoring;

public static class Ranking
{
    /// <summary>
    /// Orders by total, highest first, using competition ranking ("1224"): tied items share a
    /// rank and the next rank skips, so 100, 100, 90 → 1, 1, 3. Ties keep their input order,
    /// which lets callers pre-sort by a tiebreaker (e.g. team sort order) for a stable display.
    /// </summary>
    public static IReadOnlyList<(T Item, int Rank)> Rank<T>(IEnumerable<T> items, Func<T, int> total)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentNullException.ThrowIfNull(total);

        // Evaluate each total once; the selector may be a non-trivial calculation.
        // OrderByDescending is a stable sort, which is what keeps tied items in input order.
        var ordered = items
            .Select(item => (Item: item, Total: total(item)))
            .OrderByDescending(x => x.Total)
            .ToList();

        var ranked = new List<(T Item, int Rank)>(ordered.Count);
        var rank = 0;
        for (var i = 0; i < ordered.Count; i++)
        {
            if (i == 0 || ordered[i].Total != ordered[i - 1].Total)
            {
                rank = i + 1;
            }

            ranked.Add((ordered[i].Item, rank));
        }

        return ranked;
    }
}
