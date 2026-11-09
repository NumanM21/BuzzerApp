namespace BuzzerApp.Core.Rounds;

/// <summary>Everything needed to insert the <c>Round</c> and its <c>BuzzRecord</c> rows once the order is fixed (D28).</summary>
public sealed record LockedRoundRecord(
    Guid RoundId,
    DateTimeOffset StartedAt,
    DateTimeOffset LockedAt,
    IReadOnlyList<LockedBuzz> Buzzes);

/// <summary><c>TeamQueuePosition</c> is set only on the buzz that queued its team (<c>CountedForTeam</c>).</summary>
public sealed record LockedBuzz(
    int PlayerId,
    int TeamId,
    int Sequence,
    int OffsetMs,
    bool CountedForTeam,
    int? TeamQueuePosition);
