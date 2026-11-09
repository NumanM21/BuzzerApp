using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class RoundConfiguration : IEntityTypeConfiguration<Round>
{
    public void Configure(EntityTypeBuilder<Round> builder)
    {
        // Core's engine generates the id, so the persistence worker can insert and later update by the same key.
        builder.Property(r => r.Id).ValueGeneratedNever();

        builder.HasIndex(r => r.EventId);
        builder.HasOne<Event>().WithMany().HasForeignKey(r => r.EventId).OnDelete(DeleteBehavior.Restrict);
    }
}
