namespace BuzzerApp.Core.Domain;

/// <summary>Persisted twin of <c>Rounds.RoundTeamOutcome</c>; B6 maps one to the other so Core's engine stays free of persistence concerns.</summary>
public enum TeamOutcome
{
    Current,
    Passed,
    Unreached,
}
