namespace BuzzerApp.Core.Archive;

/// <summary>
/// The frozen, portable record of one event (PlanMVP §8.6, D29). Names, colours and totals only, with no database ids,
/// so the file still makes sense once the database it came from is gone. <see cref="SchemaVersion"/> lets later code
/// read old exports.
/// </summary>
public sealed record ArchiveDocument(
    int SchemaVersion,
    DateTimeOffset GeneratedAt,
    ArchiveEventInfo Event,
    IReadOnlyList<ArchiveTeam> Teams,
    IReadOnlyList<ArchivePlayer> Players,
    ArchiveStats Stats)
{
    public const int CurrentSchemaVersion = 1;
}

public sealed record ArchiveEventInfo(string Name, int Year, string ThemeKey);

public sealed record ArchiveTeam(
    string Name, string ColorKey, string IconKey, int Total, int Rank, IReadOnlyList<ArchiveMember> Members);

public sealed record ArchiveMember(string DisplayName, string RealName, int Total);

/// <summary><see cref="TeamName"/> is null only for a player with no team, which registration doesn't produce but a deleted-team repair could.</summary>
public sealed record ArchivePlayer(string DisplayName, string RealName, string? TeamName, int Total, int Rank);

public sealed record ArchiveStats(int RoundsPlayed, int TotalBuzzes);
