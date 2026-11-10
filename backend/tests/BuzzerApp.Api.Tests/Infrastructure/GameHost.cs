using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using BuzzerApp.Api.Common;
using BuzzerApp.Api.Realtime;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BuzzerApp.Api.Tests.Infrastructure;

/// <summary>
/// A host of its own (same database) with a fake clock. Its own host because the live round is a singleton: a fresh
/// <see cref="RoundService"/> per test means no test inherits another's half-finished round. The fake clock drives both
/// the grace window and <see cref="RoundClock"/>'s timer, so "locks after 2 s with no input" is tested by advancing
/// time, not by waiting.
/// </summary>
public sealed class GameHost : IAsyncDisposable
{
    private GameHost(WebApplicationFactory<Program> app, FakeTimeProvider time)
    {
        App = app;
        Time = time;
    }

    public WebApplicationFactory<Program> App { get; }
    public FakeTimeProvider Time { get; }
    public RoundService Rounds => App.Services.GetRequiredService<RoundService>();
    public TimeSpan GraceWindow => App.Services.GetRequiredService<IOptions<RoundSettings>>().Value.GraceWindow;

    public static GameHost Start(ApiFactory factory)
    {
        // Whole seconds: Postgres stores microseconds, so a tick-precise start would not round-trip for exact comparisons.
        var time = new FakeTimeProvider(DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds()));
        var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(time)));
        _ = app.Server;   // starts the host, so the clock's timer exists before a test advances time
        return new GameHost(app, time);
    }

    /// <summary>
    /// A genuine auth cookie for any player, protected by this host's own cookie handler. Round tests use players of an
    /// event they create (so the roster holds exactly their teams), and sign-in only accepts the active event's join code.
    /// </summary>
    public string CookieFor(Player player)
    {
        var options = App.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = CurrentUser.CreatePrincipal(player, CookieAuthenticationDefaults.AuthenticationScheme);
        var ticket = new AuthenticationTicket(principal, new AuthenticationProperties(), CookieAuthenticationDefaults.AuthenticationScheme);
        return $"{AuthSetup.CookieName}={options.TicketDataFormat.Protect(ticket)}";
    }

    public Task<GameClient> ConnectAsync(Player player) => App.ConnectGameAsync(CookieFor(player));

    public async ValueTask DisposeAsync() => await App.DisposeAsync();
}

public static class GameHubConnections
{
    /// <summary>Connects over WebSockets through the test server, as a browser would, carrying the given auth cookie (or none).</summary>
    public static async Task<GameClient> ConnectGameAsync(this WebApplicationFactory<Program> app, string? cookie)
    {
        var server = app.Server;
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, GameHub.Path), o =>
            {
                o.Transports = HttpTransportType.WebSockets;
                o.HttpMessageHandlerFactory = _ => server.CreateHandler();
                if (cookie is not null)
                {
                    o.Headers["Cookie"] = cookie;
                }

                o.WebSocketFactory = async (context, ct) =>
                {
                    var ws = server.CreateWebSocketClient();
                    if (cookie is not null)
                    {
                        ws.ConfigureRequest = r => r.Headers.Cookie = cookie;
                    }

                    return await ws.ConnectAsync(context.Uri, ct);
                };
            })
            .Build();

        var client = new GameClient(connection);
        await connection.StartAsync();
        return client;
    }

    /// <summary>The auth cookie a real sign-in or registration set, ready to send as a Cookie header.</summary>
    public static string AuthCookie(this HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var header = response.SetCookieHeaders().Single(h => h.StartsWith(AuthSetup.CookieName + "=", StringComparison.Ordinal));
        return header.Split(';')[0];
    }
}

/// <summary>One SignalR connection and everything it has received, as JSON so tests pin the wire format.</summary>
public sealed class GameClient : IAsyncDisposable
{
    public GameClient(HubConnection connection)
    {
        Connection = connection;
        connection.On<JsonElement>(nameof(IGameClient.RoundUpdated), Public.Add);
        connection.On<JsonElement>(nameof(IGameClient.AdminRoundUpdated), Admin.Add);
        connection.On(nameof(IGameClient.TeamsChanged), () => TeamsChanged.Add(true));
        connection.On(nameof(IGameClient.ScoresChanged), () => ScoresChanged.Add(true));
    }

    public HubConnection Connection { get; }
    public Inbox<JsonElement> Public { get; } = new("RoundUpdated");
    public Inbox<JsonElement> Admin { get; } = new("AdminRoundUpdated");
    public Inbox<bool> TeamsChanged { get; } = new("TeamsChanged");
    public Inbox<bool> ScoresChanged { get; } = new("ScoresChanged");

    public Task<JsonElement> InvokeAsync(string method) => Connection.InvokeAsync<JsonElement>(method);

    /// <summary>
    /// The server writes a connection's messages in order and the client dispatches them in order, so once a call has
    /// been answered, everything the server sent this connection before the answer has been received. A method that
    /// doesn't exist makes a round trip that can't change anything.
    /// </summary>
    public async Task BarrierAsync()
    {
        try
        {
            await Connection.InvokeAsync("NoSuchMethodBarrier");
        }
        catch (HubException)
        {
            // Expected: "Method does not exist".
        }
    }

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();
}

public sealed class Inbox<T>(string name)
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private readonly Channel<T> _pending = Channel.CreateUnbounded<T>();
    private readonly ConcurrentQueue<T> _all = new();

    /// <summary>Everything received so far, in arrival order.</summary>
    public IReadOnlyList<T> All => _all.ToArray();

    public void Add(T message)
    {
        _all.Enqueue(message);
        _pending.Writer.TryWrite(message);
    }

    /// <summary>Skips messages until one matches. A real-time timeout only bounds a failing test; passing tests never wait on it.</summary>
    public async Task<T> WaitForAsync(Func<T, bool> match, string what)
    {
        using var cts = new CancellationTokenSource(Timeout);
        try
        {
            while (true)
            {
                var message = await _pending.Reader.ReadAsync(cts.Token);
                if (match(message))
                {
                    return message;
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw new TimeoutException($"No {name} matching '{what}' within {Timeout}; received {_all.Count}.");
        }
    }

    public Task<T> NextAsync() => WaitForAsync(_ => true, "anything");
}

public static class RoundJson
{
    public static string Phase(this JsonElement snapshot) => snapshot.GetProperty("phase").GetString()!;

    public static long Version(this JsonElement snapshot) => snapshot.GetProperty("version").GetInt64();

    public static bool IsPhase(this JsonElement snapshot, string phase) => snapshot.Phase() == phase;
}

/// <summary>An inactive event of a test's own, so a round's roster holds exactly the teams and players the test made.</summary>
public sealed record RoundEvent(int EventId, IReadOnlyList<Team> Teams, IReadOnlyList<IReadOnlyList<Player>> PlayersByTeam, Player Admin)
{
    public IEnumerable<Player> Players => PlayersByTeam.SelectMany(p => p);
}

public static class RoundEventSetup
{
    public static async Task<RoundEvent> CreateRoundEventAsync(this ApiFactory factory, int teamCount, int playersPerTeam) =>
        await factory.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var ev = new BuzzerApp.Core.Domain.Event
            {
                Name = "Round test", Year = 2000, JoinCode = ApiHelpers.UniqueName("ROUND"), ThemeKey = "default", IsActive = false, CreatedAt = now,
            };
            db.Events.Add(ev);
            await db.SaveChangesAsync();

            var teams = Enumerable.Range(0, teamCount)
                .Select(i => new Team(ev.Id, ApiHelpers.UniqueName("RTeam"), ApiHelpers.UniqueName("c"), "icon", sortOrder: i, now))
                .ToList();
            db.Teams.AddRange(teams);
            await db.SaveChangesAsync();

            var players = teams
                .Select(t => (IReadOnlyList<Player>)Enumerable.Range(0, playersPerTeam)
                    .Select(_ => new Player(ev.Id, ApiHelpers.UniqueName("RReal"), ApiHelpers.UniqueName("RDisp"), PlayerRole.Player, t.Id, now) { PinHash = "x" })
                    .ToList())
                .ToList();
            var admin = new Player(ev.Id, ApiHelpers.UniqueName("RAdminR"), ApiHelpers.UniqueName("RAdminD"), PlayerRole.Admin, teamId: null, now) { PinHash = "x" };
            db.Players.AddRange(players.SelectMany(p => p));
            db.Players.Add(admin);
            await db.SaveChangesAsync();

            return new RoundEvent(ev.Id, teams, players, admin);
        });

    public static async Task<Player> AddPlayerAsync(this ApiFactory factory, RoundEvent ev, int teamIndex) =>
        await factory.WithDbAsync(async db =>
        {
            var player = new Player(ev.EventId, ApiHelpers.UniqueName("LReal"), ApiHelpers.UniqueName("LDisp"), PlayerRole.Player, ev.Teams[teamIndex].Id, DateTimeOffset.UtcNow) { PinHash = "x" };
            db.Players.Add(player);
            await db.SaveChangesAsync();
            return player;
        });

    /// <summary>Waits for the background worker to save something. Real-time polling bounds a failing test only.</summary>
    public static async Task EventuallyAsync(this ApiFactory factory, Func<BuzzerApp.Infrastructure.Persistence.AppDbContext, Task<bool>> condition, string what)
    {
        var deadline = DateTime.UtcNow + Inbox<bool>.Timeout;
        while (!await factory.WithDbAsync(condition))
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException($"Timed out waiting for {what}.");
            }

            await Task.Delay(25);
        }
    }
}
