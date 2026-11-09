using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class TeamConfiguration : IEntityTypeConfiguration<Team>
{
    public void Configure(EntityTypeBuilder<Team> builder)
    {
        builder.Property(t => t.Name).IsRequired().HasMaxLength(100);
        builder.Property(t => t.NormalizedName).IsRequired().HasMaxLength(100);
        builder.Property(t => t.ColorKey).IsRequired().HasMaxLength(50);
        builder.Property(t => t.IconKey).IsRequired().HasMaxLength(50);

        builder.HasIndex(t => new { t.EventId, t.NormalizedName }).IsUnique();
        builder.HasIndex(t => new { t.EventId, t.ColorKey }).IsUnique();

        builder.HasOne<Event>()
            .WithMany(e => e.Teams)
            .HasForeignKey(t => t.EventId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
