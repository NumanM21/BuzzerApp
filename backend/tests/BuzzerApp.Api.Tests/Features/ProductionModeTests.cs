using System.Net;
using BuzzerApp.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// Every other test runs the app as Development (ApiFactory), where the cookie is not Secure, OpenAPI is served and the
/// database migrates itself. Azure runs it as Production, so the branches that differ are pinned here. Requests still
/// travel in memory: nothing in the app depends on the scheme beyond these switches.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ProductionModeTests(ApiFactory factory) : IDisposable
{
    private readonly List<IDisposable> _hosts = [];

    public void Dispose() => _hosts.ForEach(h => h.Dispose());

    private WebApplicationFactory<Program> Production(Action<IWebHostBuilder>? configure = null)
    {
        // The shared host starts lazily and is what migrates the shared database (it runs as Development). Start it
        // first, or this test would depend on some other test having run before it.
        _ = factory.Services;

        var host = factory.WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            configure?.Invoke(b);
        });
        _hosts.Add(host);
        return host;
    }

    private static HttpClient Browser(WebApplicationFactory<Program> host) =>
        host.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    [Fact]
    public async Task The_auth_cookie_is_secure_http_only_and_same_site_lax()
    {
        var client = Browser(Production());
        var admin = await factory.CreateAdminAsync();   // a fresh admin in the shared database, signed in below on the production host

        var response = await client.SignInAsync(admin.RealName);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(response.SetCookieHeaders(), h => h.StartsWith("buzzer.auth=", StringComparison.Ordinal));
        var attributes = cookie.Split(';').Select(a => a.Trim().ToLowerInvariant()).ToList();
        Assert.Contains("secure", attributes);
        Assert.Contains("httponly", attributes);
        Assert.Contains("samesite=lax", attributes);
    }

    [Fact]
    public async Task The_api_description_is_not_served()
    {
        var response = await Browser(Production()).GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_empty_database_is_migrated_and_seeded_when_the_deployment_asks_for_it()
    {
        var host = Production(b =>
        {
            b.UseSetting("ConnectionStrings:BuzzerDb", factory.ConnectionStringFor(ApiFactory.NewDatabaseName()));
            b.UseSetting("Database:MigrateOnStartup", "true");
        });
        var client = Browser(host);

        Assert.Equal("Healthy", await client.GetStringAsync("/healthz"));
        var teams = await (await client.GetAsync($"/api/event/teams?code={ApiFactory.JoinCode}")).ReadJsonAsync();
        Assert.NotEqual(0, teams.GetArrayLength());
    }

    [Fact]
    public void Without_that_setting_the_app_refuses_to_start_on_an_unmigrated_database()
    {
        // Deliberate (a production schema change is never a side effect of a restart), but it means a first deployment
        // must either set Database:MigrateOnStartup or migrate beforehand. The failure is at startup, not on a request.
        var host = Production(b => b.UseSetting("ConnectionStrings:BuzzerDb", factory.ConnectionStringFor(ApiFactory.NewDatabaseName())));

        Assert.ThrowsAny<Exception>(() => host.CreateClient());
    }
}
