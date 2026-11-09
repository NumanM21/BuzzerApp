using BuzzerApp.Core.Security;
using BuzzerApp.Infrastructure.Persistence;
using BuzzerApp.Infrastructure.Security;
using BuzzerApp.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BuzzerApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));

        // Stateless and thread-safe, so a singleton is fine (unlike AppDbContext, which must never be one).
        services.AddSingleton<IPinHasher, PinHasher>();
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<EventSeeder>();
        return services;
    }
}
