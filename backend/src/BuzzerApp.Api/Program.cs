using System.Text.Json;
using System.Text.Json.Serialization;
using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Event;
using BuzzerApp.Api.Features.Players;
using BuzzerApp.Api.Features.Scores;
using BuzzerApp.Api.Features.Session;
using BuzzerApp.Api.Features.Teams;
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
builder.Services.AddSingleton<SignInThrottle>();
builder.Services.AddSingleton<PinDecoy>();
// B6 replaces this with the SignalR notifier.
builder.Services.AddSingleton<IGameNotifier, NullGameNotifier>();
builder.Services.AddProblemDetails();

// By default Development makes a bad request (missing or malformed body) throw, which UseExceptionHandler then
// reports as a 500, while Production answers 400. Turning it off keeps both environments identical.
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = false);

// Enums go out as "admin" / "add" rather than numbers; B6 configures the same converter for SignalR.
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

// dotnet ef stops the host at Build(), so the seeding below never runs while generating migrations.
var app = builder.Build();

await DatabaseInitializer.InitializeDatabaseAsync(app.Services, applyMigrations: app.Environment.IsDevelopment());

app.UseExceptionHandler();
app.UseStatusCodePages();

// Development is plain http so phones on the LAN can reach it (the auth cookie is not Secure there).
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    // The fallback policy makes everything private unless it opts out.
    app.MapOpenApi().AllowAnonymous();
}

app.MapEventEndpoints();
app.MapSessionEndpoints();
app.MapTeamEndpoints();
app.MapPlayerEndpoints();
app.MapScoreEndpoints();

app.Run();

// Lets the test project use WebApplicationFactory<Program>; top-level statements make Program internal otherwise.
public partial class Program;
