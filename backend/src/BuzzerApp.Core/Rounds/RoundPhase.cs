namespace BuzzerApp.Core.Rounds;

public enum RoundPhase
{
    /// <summary>No question running.</summary>
    Idle,

    /// <summary>Accepting buzzes. The grace window starts at the first buzz.</summary>
    Open,

    /// <summary>Queue frozen; exactly one team is <see cref="TeamTurnStatus.Current"/>.</summary>
    Locked,

    /// <summary>Every queued team has passed. Only Reset is allowed.</summary>
    Exhausted,
}
