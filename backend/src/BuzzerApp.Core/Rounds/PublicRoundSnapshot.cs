namespace BuzzerApp.Core.Rounds;

/// <summary>
/// What every connected client sees. Deliberately has no individual buzzes (admin-only, D6).
/// Clients drop any snapshot whose <c>Version</c> is lower than the one they already hold.
/// </summary>
public sealed record PublicRoundSnapshot(
    long Version,
    Guid? RoundId,
    RoundPhase Phase,
    DateTimeOffset? RoundStartedAt,
    IReadOnlyList<TeamQueueEntry> TeamQueue,
    int? CurrentTeamId,
    DateTimeOffset? WindowEndsAt,
    DateTimeOffset ServerNow);

public sealed record TeamQueueEntry(
    int Position,
    int TeamId,
    string TeamName,
    string BuzzedByDisplayName,
    TeamTurnStatus Status);
