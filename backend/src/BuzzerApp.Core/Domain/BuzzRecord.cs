namespace BuzzerApp.Core.Domain;

public class BuzzRecord
{
    public long Id { get; set; }
    public Guid RoundId { get; set; }
    public int PlayerId { get; set; }
    public int TeamId { get; set; }
    public int Sequence { get; set; }

    /// <summary>Milliseconds after the round's first buzz.</summary>
    public int OffsetMs { get; set; }

    /// <summary>False for later teammate buzzes, which are recorded but don't queue the team (D9).</summary>
    public bool CountedForTeam { get; set; }
    public int? TeamQueuePosition { get; set; }

    /// <summary>Filled in when the round ends; null until then and for uncounted buzzes.</summary>
    public TeamOutcome? Outcome { get; set; }
}
