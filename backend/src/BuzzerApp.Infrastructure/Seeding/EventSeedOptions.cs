namespace BuzzerApp.Infrastructure.Seeding;

public sealed class EventSeedOptions
{
    public const string SectionName = "Event";

    public string Name { get; set; } = "";
    public int Year { get; set; }
    public string JoinCode { get; set; } = "";
    public string ThemeKey { get; set; } = "";
    public List<TeamSeedOptions> Teams { get; set; } = [];
}

public sealed class TeamSeedOptions
{
    public string Name { get; set; } = "";
    public string ColorKey { get; set; } = "";
    public string IconKey { get; set; } = "";
}
