using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BuzzerApp.Infrastructure.Seeding;

public static class DatabaseInitializer
{
    /// <summary>
    /// Run after <c>builder.Build()</c> and before <c>app.Run()</c>. Migrating automatically is only
    /// requested in Development; production schema changes are applied deliberately.
    /// </summary>
    public static async Task InitializeDatabaseAsync(IServiceProvider services, bool applyMigrations, CancellationToken ct = default)
    {
        // A scope because AppDbContext and EventSeeder are scoped and the root provider must not resolve them.
        await using var scope = services.CreateAsyncScope();

        if (applyMigrations)
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync(ct);
        }

        var seeder = scope.ServiceProvider.GetRequiredService<EventSeeder>();
        await seeder.SeedAsync(ct);
    }
}
