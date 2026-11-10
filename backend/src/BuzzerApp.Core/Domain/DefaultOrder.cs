namespace BuzzerApp.Core.Domain;

/// <summary>
/// The one definition of the default list orders (shared rule "every list has a deterministic order"). Each ends in a
/// unique tiebreaker, so the same data always comes back in the same order. Before this existed the two sorts were
/// written out in every endpoint that returned a list, and a new one could forget the tiebreaker.
/// </summary>
public static class DefaultOrder
{
    /// <summary>Teams: <c>SortOrder</c>, then <c>Id</c> (SortOrder isn't unique: two admins can create teams at once). A database query.</summary>
    public static IOrderedQueryable<Team> InDisplayOrder(this IQueryable<Team> teams) =>
        teams.OrderBy(t => t.SortOrder).ThenBy(t => t.Id);

    /// <summary>
    /// People: display name ignoring case, then id. In memory on purpose, with an explicit comparer, so a laptop's
    /// Postgres and Azure's can't disagree through their collations. It takes a loaded collection, not a query, so it
    /// can't be called on a <c>DbSet</c> by accident and pull a whole table.
    /// </summary>
    public static IOrderedEnumerable<T> InNameOrder<T>(this IReadOnlyCollection<T> people, Func<T, string> displayName, Func<T, int> id) =>
        people.OrderBy(displayName, StringComparer.OrdinalIgnoreCase).ThenBy(id);

    public static IOrderedEnumerable<Player> InNameOrder(this IReadOnlyCollection<Player> players) =>
        players.InNameOrder(p => p.DisplayName, p => p.Id);
}
