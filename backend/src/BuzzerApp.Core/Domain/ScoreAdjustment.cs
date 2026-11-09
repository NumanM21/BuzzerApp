namespace BuzzerApp.Core.Domain;

/// <summary>
/// One row of the score ledger (D25). Exactly one of <see cref="TeamId"/> / <see cref="PlayerId"/> is set
/// (enforced by a check constraint). Rows are never edited or deleted; an undo is a new reversing row.
/// </summary>
public class ScoreAdjustment
{
    public long Id { get; set; }
    public int EventId { get; set; }
    public int? TeamId { get; set; }
    public int? PlayerId { get; set; }

    /// <summary>Signed: negative for removals.</summary>
    public int Amount { get; set; }
    public string? Reason { get; set; }
    public long? ReversesAdjustmentId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public int CreatedByPlayerId { get; set; }
}
