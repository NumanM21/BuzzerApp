using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class EventArchiveConfiguration : IEntityTypeConfiguration<EventArchive>
{
    public void Configure(EntityTypeBuilder<EventArchive> builder)
    {
        builder.Property(a => a.Data).IsRequired().HasColumnType("jsonb");

        builder.HasIndex(a => a.EventId).IsUnique();

        builder.HasOne<Event>().WithMany().HasForeignKey(a => a.EventId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Player>().WithMany().HasForeignKey(a => a.CreatedByPlayerId).OnDelete(DeleteBehavior.Restrict);
    }
}
