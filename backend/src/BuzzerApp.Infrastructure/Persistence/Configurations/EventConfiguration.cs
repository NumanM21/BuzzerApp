using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.Property(e => e.Name).IsRequired().HasMaxLength(100);
        builder.Property(e => e.JoinCode).IsRequired().HasMaxLength(50);
        builder.Property(e => e.ThemeKey).IsRequired().HasMaxLength(50);

        builder.HasIndex(e => e.JoinCode).IsUnique();

        // Postgres lets many rows be false but only one be true, so this enforces "one active event" in the database.
        builder.HasIndex(e => e.IsActive).IsUnique().HasFilter("\"IsActive\" = true");
    }
}
