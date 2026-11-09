namespace BuzzerApp.Core.Domain;

public class EventArchive
{
    public int Id { get; set; }
    public int EventId { get; set; }
    public int SchemaVersion { get; set; }

    /// <summary>The serialized ArchiveDocument. Kept as text here so Core needs no JSON-column support.</summary>
    public string Data { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public int CreatedByPlayerId { get; set; }
}
