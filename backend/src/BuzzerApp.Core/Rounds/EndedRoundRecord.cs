namespace BuzzerApp.Core.Rounds;

/// <summary>
/// Produced when Reset ends a round that had locked. Outcomes are only final at that point,
/// because NextTeam can still move the turn along until then.
/// </summary>
public sealed record EndedRoundRecord(
    Guid RoundId,
    DateTimeOffset EndedAt,
    IReadOnlyList<TeamOutcomeEntry> TeamOutcomes);

public sealed record TeamOutcomeEntry(int TeamId, RoundTeamOutcome Outcome);

public enum RoundTeamOutcome
{
    /// <summary>Had the turn when the round ended (typically answered correctly).</summary>
    Current,

    /// <summary>Had a turn and passed it on.</summary>
    Passed,

    /// <summary>Queued but the turn never reached them.</summary>
    Unreached,
}
