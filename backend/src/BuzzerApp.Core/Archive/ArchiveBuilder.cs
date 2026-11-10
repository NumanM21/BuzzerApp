using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Core.Archive;

public static class ArchiveBuilder
{
    /// <summary>
    /// Builds the version 1 document. Pure: the same input gives the same document.
    /// <para>
    /// Sorts nothing itself. The input order is the output order, so the caller passes <paramref name="teams"/> sorted by
    /// <c>SortOrder, Id</c> and <paramref name="players"/> by display name (ignoring case) then <c>Id</c>. Ranking keeps
    /// input order for ties, which turns those two orders into "rank, then SortOrder, Id" for teams, "rank, then display
    /// name, Id" for players and "display name, Id" for a team's members. Sorting here would hide a caller that forgot.
    /// </para>
    /// </summary>
    public static ArchiveDocument Build(
        ArchiveEventInfo eventInfo,
        IEnumerable<ArchiveTeamInput> teams,
        IEnumerable<ArchivePlayerInput> players,
        ArchiveStats stats,
        DateTimeOffset generatedAt)
    {
        ArgumentNullException.ThrowIfNull(eventInfo);
        ArgumentNullException.ThrowIfNull(teams);
        ArgumentNullException.ThrowIfNull(players);
        ArgumentNullException.ThrowIfNull(stats);

        var teamList = teams.ToList();

        // An admin keeps no seat on the leaderboard even if they scored as a player before being promoted (same rule as GET /api/scores/players).
        var playerList = players.Where(p => !p.IsAdmin).ToList();

        // A lookup keeps each team's members in input order; it is only ever queried by team id, never enumerated.
        var membersByTeam = playerList
            .Where(p => p.TeamId is not null)
            .ToLookup(p => p.TeamId!.Value, p => new ArchiveMember(p.DisplayName, p.RealName, p.Total));
        var teamNameById = teamList.ToDictionary(t => t.Id, t => t.Name);

        var rankedTeams = Ranking.Rank(teamList, t => t.Total)
            .Select(r => new ArchiveTeam(
                r.Item.Name, r.Item.ColorKey, r.Item.IconKey, r.Item.Total, r.Rank, membersByTeam[r.Item.Id].ToList()))
            .ToList();

        var rankedPlayers = Ranking.Rank(playerList, p => p.Total)
            .Select(r => new ArchivePlayer(
                r.Item.DisplayName,
                r.Item.RealName,
                r.Item.TeamId is { } teamId ? teamNameById.GetValueOrDefault(teamId) : null,
                r.Item.Total,
                r.Rank))
            .ToList();

        return new ArchiveDocument(ArchiveDocument.CurrentSchemaVersion, generatedAt, eventInfo, rankedTeams, rankedPlayers, stats);
    }
}
