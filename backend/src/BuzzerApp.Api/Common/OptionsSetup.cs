using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Seeding;

namespace BuzzerApp.Api.Common;

public static class OptionsSetup
{
    /// <summary>
    /// Binds the config sections and validates them on startup, so a missing secret fails the app
    /// immediately with a readable message rather than on the first request that needs it.
    /// </summary>
    public static IServiceCollection AddAppOptions(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<EventSeedOptions>()
            .Bind(config.GetSection(EventSeedOptions.SectionName))
            .Validate(o => !string.IsNullOrWhiteSpace(o.JoinCode),
                "Event:JoinCode is not set. Add it to User Secrets: dotnet user-secrets set \"Event:JoinCode\" \"<code>\" --project backend/src/BuzzerApp.Api")
            .Validate(o => !string.IsNullOrWhiteSpace(o.Name) && !string.IsNullOrWhiteSpace(o.ThemeKey) && o.Year > 0,
                "Event:Name, Event:Year and Event:ThemeKey must be set.")
            .Validate(o => o.Teams.Count > 0 && o.Teams.All(t =>
                    !string.IsNullOrWhiteSpace(t.Name) && !string.IsNullOrWhiteSpace(t.ColorKey) && !string.IsNullOrWhiteSpace(t.IconKey)),
                "Event:Teams must list at least one team, each with Name, ColorKey and IconKey.")
            // Mirrors the DB unique indexes so a config typo reports here instead of as a constraint error at seed time.
            .Validate(o => o.Teams.Select(t => NameNormalizer.Normalize(t.Name)).Distinct().Count() == o.Teams.Count
                    && o.Teams.Select(t => t.ColorKey.Trim()).Distinct().Count() == o.Teams.Count,
                "Event:Teams must have unique names and unique colour keys.")
            .ValidateOnStart();

        // A root-level array, so it is bound as a list rather than an options class.
        services.AddOptions<List<AdminSeedOptions>>()
            .Bind(config.GetSection(AdminSeedOptions.SectionName))
            .Validate(admins => admins.All(a =>
                    !string.IsNullOrWhiteSpace(a.RealName) && !string.IsNullOrWhiteSpace(a.DisplayName)),
                "Every entry in Admins needs a RealName and DisplayName.")
            // The same rule sign-in applies, so a configured PIN can always be typed in.
            .Validate(admins => admins.All(a => PinFormat.IsValid(a.Pin)),
                "Every entry in Admins needs a 4-digit Pin.")
            .ValidateOnStart();

        services.AddOptions<RoundSettings>()
            .Bind(config.GetSection("Round"))
            .Validate(r => r.GraceWindow >= TimeSpan.Zero, "Round:GraceWindow must not be negative.")
            .Validate(r => r.MaxRecordedBuzzes >= 0, "Round:MaxRecordedBuzzes must not be negative.")
            .ValidateOnStart();

        return services;
    }
}
