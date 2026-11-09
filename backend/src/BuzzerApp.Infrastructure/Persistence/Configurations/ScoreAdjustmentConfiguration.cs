using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BuzzerApp.Infrastructure.Persistence.Configurations;

internal sealed class ScoreAdjustmentConfiguration : IEntityTypeConfiguration<ScoreAdjustment>
{
    public void Configure(EntityTypeBuilder<ScoreAdjustment> builder)
    {
        builder.Property(a => a.Reason).HasMaxLength(200);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_ScoreAdjustment_ExactlyOneTarget",
            "num_nonnulls(\"TeamId\", \"PlayerId\") = 1"));

        // An adjustment can be undone once; Postgres allows many NULLs in a unique index.
        builder.HasIndex(a => a.ReversesAdjustmentId).IsUnique();

        // Totals are SUMs per target, so these keep the leaderboard queries cheap.
        builder.HasIndex(a => new { a.EventId, a.TeamId });
        builder.HasIndex(a => new { a.EventId, a.PlayerId });

        builder.HasOne<Event>().WithMany().HasForeignKey(a => a.EventId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Team>().WithMany().HasForeignKey(a => a.TeamId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Player>().WithMany().HasForeignKey(a => a.PlayerId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Player>().WithMany().HasForeignKey(a => a.CreatedByPlayerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ScoreAdjustment>().WithMany().HasForeignKey(a => a.ReversesAdjustmentId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
    }
}
