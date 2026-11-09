namespace BuzzerApp.Infrastructure.Seeding;

public sealed class AdminSeedOptions
{
    public const string SectionName = "Admins";

    public string RealName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Pin { get; set; } = "";
}
