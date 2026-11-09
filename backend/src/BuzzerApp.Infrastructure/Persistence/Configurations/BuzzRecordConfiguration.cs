using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class BuzzRecordConfiguration : IEntityTypeConfiguration<BuzzRecord>
{
    public void Configure(EntityTypeBuilder<BuzzRecord> builder)
    {
        builder.HasIndex(b => new { b.RoundId, b.Sequence }).IsUnique();

        // The only cascade in the model: buzzes have no meaning without their round.
        builder.HasOne<Round>()
            .WithMany(r => r.Buzzes)
            .HasForeignKey(b => b.RoundId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Player>().WithMany().HasForeignKey(b => b.PlayerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Team>().WithMany().HasForeignKey(b => b.TeamId).OnDelete(DeleteBehavior.Restrict);
    }
}
