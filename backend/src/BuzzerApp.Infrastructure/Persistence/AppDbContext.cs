using BuzzerApp.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<ScoreAdjustment> ScoreAdjustments => Set<ScoreAdjustment>();
    public DbSet<Round> Rounds => Set<Round>();
    public DbSet<BuzzRecord> BuzzRecords => Set<BuzzRecord>();
    public DbSet<EventArchive> EventArchives => Set<EventArchive>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Strings, not ints, so rows stay readable in pgAdmin and reordering an enum can't silently change meaning.
        configurationBuilder.Properties<Enum>().HaveConversion<string>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
