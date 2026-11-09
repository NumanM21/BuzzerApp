namespace BuzzerApp.Core.Domain;

public class Team
{
    // For EF Core, which materialises entities and then sets the private-set properties.
    private Team() { }

    public Team(int eventId, string name, string colorKey, string iconKey, int sortOrder, DateTimeOffset createdAt)
    {
        EventId = eventId;
        ColorKey = colorKey;
        IconKey = iconKey;
        SortOrder = sortOrder;
        CreatedAt = createdAt;
        Rename(name);
    }

    public int Id { get; set; }
    public int EventId { get; set; }
    public string Name { get; private set; } = "";
    public string NormalizedName { get; private set; } = "";
    public string ColorKey { get; set; } = "";
    public string IconKey { get; set; } = "";
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<Player> Players { get; } = new List<Player>();

    // Name and its normalized copy change together so they can never drift apart.
    public void Rename(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name.Trim();
        NormalizedName = NameNormalizer.Normalize(name);
    }
}
