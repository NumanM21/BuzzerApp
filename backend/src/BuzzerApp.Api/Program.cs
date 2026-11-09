using BuzzerApp.Api.Common;
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

// dotnet ef stops the host at Build(), so the seeding below never runs while generating migrations.
var app = builder.Build();

await DatabaseInitializer.InitializeDatabaseAsync(app.Services, applyMigrations: app.Environment.IsDevelopment());

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.Run();
