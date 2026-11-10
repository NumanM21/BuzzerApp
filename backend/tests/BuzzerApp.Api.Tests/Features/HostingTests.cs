using System.Net;
using System.Text.Json;
using BuzzerApp.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace BuzzerApp.Api.Tests.Features;

/// <summary>
/// One process serves the API, the hub and the built React app. The host here has a web root of its own holding a fake
/// build (not the real wwwroot, which only exists after a frontend build), so the results never depend on what a
/// developer has copied into the Api project.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class HostingTests : IDisposable
{
    private const string IndexMarker = "<!-- test-index -->";
    private const string ScriptBody = "console.log('test-asset');";

    private readonly string _webRoot = Directory.CreateTempSubdirectory("buzzer-wwwroot-").FullName;
    private readonly WebApplicationFactory<Program> _host;
    private readonly ApiFactory _factory;

    public HostingTests(ApiFactory factory)
    {
        _factory = factory;
        Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), $"<!doctype html><html><body>{IndexMarker}</body></html>");
        File.WriteAllText(Path.Combine(_webRoot, "assets", "app-abc123.js"), ScriptBody);

        _host = factory.WithWebHostBuilder(b => b.UseWebRoot(_webRoot));
    }

    public void Dispose()
    {
        _host.Dispose();
        Directory.Delete(_webRoot, recursive: true);
    }

    private HttpClient Anonymous() =>
        _host.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });

    private static async Task AssertNotFoundProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.ReadJsonAsync();
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task The_root_serves_the_app_to_an_anonymous_visitor()
    {
        var response = await Anonymous().GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(IndexMarker, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/join")]
    [InlineData("/some/client/route")]
    [InlineData("/admin/scores")]
    [InlineData("/play/")]
    public async Task A_client_side_route_serves_the_app_so_a_refresh_or_shared_link_works(string path)
    {
        var response = await Anonymous().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(IndexMarker, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_built_asset_is_served_as_itself_not_as_the_app()
    {
        var response = await Anonymous().GetAsync("/assets/app-abc123.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ScriptBody, await response.Content.ReadAsStringAsync());
        Assert.Contains("javascript", response.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("/assets/missing.js")]
    [InlineData("/favicon.ico")]
    public async Task A_missing_file_is_a_404_not_the_app(string path)
    {
        // Answering 200 + HTML for a missing script would make the browser fail with a confusing syntax error.
        var response = await Anonymous().GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain(IndexMarker, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("GET", "/api/nope")]
    [InlineData("POST", "/api/nope")]
    [InlineData("DELETE", "/api/teams/1/nope")]
    [InlineData("GET", "/api/")]
    [InlineData("GET", "/api")]
    [InlineData("GET", "/hubs/nope")]
    [InlineData("POST", "/hubs/game/nope")]
    [InlineData("GET", "/hubs")]
    public async Task An_unknown_api_or_hub_path_is_a_404_problem_for_everyone_including_anonymous_callers(string method, string path)
    {
        var response = await Anonymous().SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        await AssertNotFoundProblemAsync(response);
    }

    [Fact]
    public async Task The_catch_alls_do_not_shadow_real_api_routes()
    {
        var response = await Anonymous().GetAsync("/api/event");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(JsonValueKind.Object, (await response.ReadJsonAsync()).ValueKind);
    }

    [Fact]
    public async Task Private_api_routes_still_demand_a_sign_in()
    {
        var response = await Anonymous().GetAsync("/api/teams");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_hub_is_still_reachable_next_to_the_hub_catch_all()
    {
        // Negotiate with no cookie must reach the hub's own authorization (401), not the catch-all (404). A real
        // connection that succeeds is covered by GameHubTests, which runs against this same Program.
        var response = await Anonymous().PostAsync("/hubs/game/negotiate?negotiateVersion=1", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Healthz_reports_healthy_to_an_anonymous_caller()
    {
        var response = await Anonymous().GetAsync("/healthz");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Healthz_checks_the_database()
    {
        // The endpoint's status alone would stay "Healthy" if the check were dropped (no checks = healthy).
        var report = await _factory.Services.GetRequiredService<HealthCheckService>().CheckHealthAsync();

        var entry = Assert.Single(report.Entries);
        Assert.Equal("AppDbContext", entry.Key);
        Assert.Equal(HealthStatus.Healthy, entry.Value.Status);
    }
}
