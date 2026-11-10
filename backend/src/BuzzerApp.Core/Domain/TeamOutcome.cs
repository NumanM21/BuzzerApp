namespace BuzzerApp.Core.Domain;

/// <summary>
/// How a queued team's turn ended, fixed when the round is reset. One enum for the round engine and the saved
/// <see cref="BuzzRecord"/>: they were two identical enums with a mapping between them until B9.
/// </summary>
public enum TeamOutcome
{
    /// <summary>Had the turn when the round ended (typically answered correctly).</summary>
    Current,

    /// <summary>Had a turn and passed it on.</summary>
    Passed,

    /// <summary>Queued but the turn never reached them.</summary>
    Unreached,
}
