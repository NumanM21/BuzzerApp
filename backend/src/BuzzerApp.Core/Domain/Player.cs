namespace BuzzerApp.Core.Domain;

public class Player
{
    private Player() { }

    public Player(int eventId, string realName, string displayName, PlayerRole role, int? teamId, DateTimeOffset createdAt)
    {
        EventId = eventId;
        Role = role;
        TeamId = teamId;
        CreatedAt = createdAt;
        SetRealName(realName);
        SetDisplayName(displayName);
    }

    public int Id { get; set; }
    public int EventId { get; set; }
    public string RealName { get; private set; } = "";
    public string NormalizedRealName { get; private set; } = "";
    public string DisplayName { get; private set; } = "";
    public string NormalizedDisplayName { get; private set; } = "";

    // Set after construction: IPinHasher.Hash takes the Player itself, which must exist first.
    public string PinHash { get; set; } = "";

    public PlayerRole Role { get; set; }

    // Null for admins: they never buzz and belong to no team.
    public int? TeamId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public void SetRealName(string realName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(realName);
        RealName = realName.Trim();
        NormalizedRealName = NameNormalizer.Normalize(realName);
    }

    public void SetDisplayName(string displayName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(displayName);
        DisplayName = displayName.Trim();
        NormalizedDisplayName = NameNormalizer.Normalize(displayName);
    }
}
