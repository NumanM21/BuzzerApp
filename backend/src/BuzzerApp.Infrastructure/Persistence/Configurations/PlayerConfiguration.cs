using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class PlayerConfiguration : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> builder)
    {
        builder.Property(p => p.RealName).IsRequired().HasMaxLength(100);
        builder.Property(p => p.NormalizedRealName).IsRequired().HasMaxLength(100);
        builder.Property(p => p.DisplayName).IsRequired().HasMaxLength(100);
        builder.Property(p => p.NormalizedDisplayName).IsRequired().HasMaxLength(100);
        builder.Property(p => p.PinHash).IsRequired().HasMaxLength(256);

        builder.HasIndex(p => new { p.EventId, p.NormalizedRealName }).IsUnique();
        builder.HasIndex(p => new { p.EventId, p.NormalizedDisplayName }).IsUnique();

        builder.HasOne<Event>()
            .WithMany(e => e.Players)
            .HasForeignKey(p => p.EventId)
            .OnDelete(DeleteBehavior.Restrict);

        // Optional: admins have no team.
        builder.HasOne<Team>()
            .WithMany(t => t.Players)
            .HasForeignKey(p => p.TeamId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
