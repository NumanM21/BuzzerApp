namespace BuzzerApp.Core.Rounds;

/// <summary>
/// The public fields plus admin-only detail. It repeats the public fields instead of inheriting
/// from <see cref="PublicRoundSnapshot"/>: serializers (SignalR included) write the runtime type,
/// so an admin snapshot passed where a public one was expected would leak every buzz to players.
/// </summary>
public sealed record AdminRoundSnapshot(
    long Version,
    Guid? RoundId,
    RoundPhase Phase,
    DateTimeOffset? RoundStartedAt,
    IReadOnlyList<TeamQueueEntry> TeamQueue,
    int? CurrentTeamId,
    DateTimeOffset? WindowEndsAt,
    DateTimeOffset ServerNow,
    IReadOnlyList<BuzzEntry> Buzzes,
    DateTimeOffset? CurrentSince);

public sealed record BuzzEntry(
    int Sequence,
    int PlayerId,
    string DisplayName,
    int TeamId,
    string TeamName,
    int OffsetMs,
    bool CountedForTeam);
