namespace BuzzerApp.Core.Domain;

/// <summary>One games night (one per year). All other data is scoped to an event so years never mix (D15).</summary>
public class Event
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Year { get; set; }
    public string JoinCode { get; set; } = "";
    public string ThemeKey { get; set; } = "";
    public bool IsActive { get; set; }
    public DateTimeOffset? FinalizedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<Team> Teams { get; } = new List<Team>();
    public ICollection<Player> Players { get; } = new List<Player>();
}
