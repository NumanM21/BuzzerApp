using BuzzerApp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace BuzzerApp.Api.Tests.Infrastructure;

/// <summary>
/// Boots the real Api against a throwaway PostgreSQL container. A real Postgres (not InMemory/SQLite) is the point:
/// the behaviours worth testing here, such as the unique-index race (SQLSTATE 23505), the filtered unique index and
/// the migrations themselves, only exist there. Needs Docker, which CI (ubuntu-latest) and the dev machine both have.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JoinCode = "TEST-2026";
    public const string AdminRealName = "Test Admin";
    public const string AdminPin = "9876";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();

    // Every test request comes from the same (null) IP, so the per-IP registration limit is lifted by default.
    // The one test that exercises that limit uses a factory that lowers it.
    protected virtual int JoinCodePerMinute => 10_000;

    public async ValueTask InitializeAsync() => await _postgres.StartAsync();

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development: migrations are applied and the seeder runs at startup, exactly as on the dev machine.
        builder.UseEnvironment("Development");

        // UseSetting rather than ConfigureAppConfiguration: Program.cs reads the connection string
        // before the host is built, and only UseSetting values are visible that early.
        builder.UseSetting("ConnectionStrings:BuzzerDb", _postgres.GetConnectionString());
        builder.UseSetting("Event:JoinCode", JoinCode);
        builder.UseSetting("Admins:0:RealName", AdminRealName);
        builder.UseSetting("Admins:0:DisplayName", "Test Boss");
        builder.UseSetting("Admins:0:Pin", AdminPin);
        builder.UseSetting("RateLimiting:JoinCodePerMinute", JoinCodePerMinute.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    /// <summary>A client with its own cookie jar, so each test acts as its own browser. Redirects are off so a stray 302 fails a test instead of hiding.</summary>
    public HttpClient CreateBrowser() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task WithDbAsync(Func<AppDbContext, Task> action) =>
        WithDbAsync<object?>(async db =>
        {
            await action(db);
            return null;
        });
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    // One container for every integration test class; tests isolate themselves with unique names.
    public const string Name = "Api";
}
