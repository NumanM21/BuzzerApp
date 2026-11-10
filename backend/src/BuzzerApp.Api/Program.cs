using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Infrastructure;
using BuzzerApp.Infrastructure.Seeding;

var builder = WebApplication.CreateBuilder(args);

// Read here rather than via options: AddInfrastructure needs it at registration time.
var connectionString = builder.Configuration.GetConnectionString("BuzzerDb");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "ConnectionStrings:BuzzerDb is not set. Add it to User Secrets: " +
        "dotnet user-secrets set \"ConnectionStrings:BuzzerDb\" \"Host=localhost;Port=5434;Database=buzzer_db;Username=buzzer_user;Password=<POSTGRES_PASSWORD from .env>\" --project backend/src/BuzzerApp.Api");
}

builder.Services.AddOpenApi();
builder.Services.AddAppOptions(builder.Configuration);
builder.Services.AddInfrastructure(connectionString);
builder.Services.AddAppAuth(builder.Environment);
builder.Services.AddAppRateLimiting(builder.Configuration);
builder.Services.AddFeatures();
builder.Services.AddRealtime();
builder.Services.AddAppHosting();
builder.Services.AddProblemDetails();

// By default Development makes a bad request (missing or malformed body) throw, which UseExceptionHandler then
// reports as a 500, while Production answers 400. Turning it off keeps both environments identical.
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = false);

// AddRealtime applies the same conventions to SignalR.
builder.Services.ConfigureHttpJsonOptions(o => AppJson.Configure(o.SerializerOptions));

// dotnet ef stops the host at Build(), so the seeding below never runs while generating migrations.
var app = builder.Build();

// Development migrates by itself. Anywhere else it is opt-in (Database:MigrateOnStartup=true), so a deployment decides
// when its schema changes; left off, the app expects an already-migrated database and fails at the seeder if it isn't.
var migrateOnStartup = app.Configuration.GetValue("Database:MigrateOnStartup", app.Environment.IsDevelopment());
await DatabaseInitializer.InitializeDatabaseAsync(app.Services, applyMigrations: migrateOnStartup);

app.UseExceptionHandler();
app.UseStatusCodePages();

// Development is plain http so phones on the LAN can reach it (the auth cookie is not Secure there).
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseFrontendFiles();

// Explicit, so the order is visible: built files are served before routing, and a request that matches no route is
// answered (the React app or a 404) before authorization can turn it into a 401.
app.UseRouting();
app.UseFallbackForUnmatchedRequests();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    // The fallback policy makes everything private unless it opts out.
    app.MapOpenApi().AllowAnonymous();
}

app.MapFeatures();
app.MapRealtime();
app.MapHostingEndpoints();

app.Run();

// Lets the test project use WebApplicationFactory<Program>; top-level statements make Program internal otherwise.
public partial class Program;
