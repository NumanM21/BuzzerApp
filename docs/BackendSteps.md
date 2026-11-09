# Backend steps B0–B8 — implementation briefs

> **Audience:** AI workers implementing one step each (usually in a fresh session).
> Adds implementation detail to `docs/PlanMVP.md` §10 Milestone B. **PlanMVP wins on product decisions; this file wins on implementation detail.**
> Written 9 Nov 2026.

| Step | Branch | Suggested model | Why |
|---|---|---|---|
| B0 | `backend-phase-1` (existing) | Sonnet | Mechanical cleanup + CI |
| B1 | `feature/b1-core-round` | **Opus** (or Sonnet + Opus review) | State machine + concurrency; its API shape fixes B6 |
| B2 | `feature/b2-persistence` | Sonnet | Standard EF Core; traps listed below |
| B3 | `feature/b3-auth` | Sonnet + review | Security-sensitive |
| B4 | `feature/b4-teams-players` | Sonnet | CRUD |
| B5 | `feature/b5-scores` | Sonnet | CRUD + `ScoreMath` |
| B6 | `feature/b6-realtime` | **Opus** (or Sonnet + Opus review) | Singleton + clock + SignalR + ordered persistence; bugs only show up under timing |
| B7 | `feature/b7-archive` | Sonnet | Pure builder + 2 endpoints |
| B8 | `feature/b8-hosting` | Sonnet | Static file hosting |

---

## Shared rules for every worker

- Read `CLAUDE.md` and `docs/PlanMVP.md` first, then the brief for your step below.
- The developer's prompt saying "do B<n>" counts as "go". Don't stop to propose a file list unless something in the brief is unclear or looks wrong. If it does, say so and propose an alternative. Never silently deviate.
- Branching: B0 is done on `backend-phase-1` and merged into `main` first, so CI exists there. Every later step branches `feature/b<n>-<short-name>` off the latest `origin/main`. Make small commits, one logical change each. Don't push or open a PR unless asked.
- **Done** = `dotnet build BuzzerApp.slnx` + `dotnet test BuzzerApp.slnx` pass with **zero warnings** (warnings are errors from B0 on), plus the step's own **Check**. Finish with a short summary of what was built and why (a few paragraphs).
- Package versions: don't guess. Use the latest stable version (`dotnet package search <id> --exact-match`, or `dotnet add package <id>` without a version), and add it to `Directory.Packages.props` (central package management, from B0 on).
- Use UTC everywhere: `TimeProvider.GetUtcNow()` (inject `TimeProvider`, never `DateTime.Now`). Npgsql rejects a `DateTimeOffset` with a non-zero offset for `timestamptz` columns.
- Comments explain *why*, not *what*.

---

## B0 — Hygiene + CI

- Delete `backend/src/BuzzerApp.Core/Class1.cs`, `backend/src/BuzzerApp.Infrastructure/Class1.cs` and `backend/tests/BuzzerApp.Core.Tests/UnitTest1.cs`.
- `Api/Program.cs`: remove the weather sample and the `WeatherForecast` record. Keep `AddOpenApi` / `MapOpenApi`. Point `BuzzerApp.Api.http` at `GET {{host}}/openapi/v1.json` as a placeholder.
- Add a **`global.json`** at the root: `"sdk": { "version": "10.0.100", "rollForward": "latestFeature" }`. The dev machine also has the 8.0 SDK, and local should match CI.
- Add a **`Directory.Build.props`** at the root with `TargetFramework net10.0`, `Nullable enable`, `ImplicitUsings enable` and `TreatWarningsAsErrors true`. Remove those properties from the 4 csproj files.
- Add a **`Directory.Packages.props`** at the root (`ManagePackageVersionsCentrally`) and move every package version into it. Why: EF Core, Npgsql, EF Design and EF Tools must stay on matching versions across 3 projects.
- Move the test project to **xUnit v3**: `xunit.v3`, `xunit.runner.visualstudio` (3.x) and `Microsoft.NET.Test.Sdk`. Keep `coverlet.collector`, and add `<OutputType>Exe</OutputType>` if the package doesn't set it. Stay on the VSTest runner (no Microsoft.Testing.Platform config in `global.json`). Add one trivial placeholder test so `dotnet test` finds something; B1 deletes it.
- Add `.github/workflows/ci.yml` from PlanMVP §10. First look up the current major version of each action (`gh api repos/actions/checkout/releases/latest --jq .tag_name`, and the same for `actions/setup-dotnet` and `actions/setup-node`). In setup-dotnet, use `global-json-file: global.json` instead of `dotnet-version`.
- Add `buzzer-archive-*.json` to `.gitignore`, because archive exports contain real names.
- Commit the doc changes already in the working tree (`docs/BackendSteps.md`, `docs/PlanMVP.md`, `CLAUDE.md`) as their own commit.
- **Check:** build and test pass. `cd frontend && npm ci && npm run lint && npm run build` pass. Then stop and tell the developer to push `backend-phase-1`, open the PR, and mark the `backend` and `frontend` jobs as required status checks in the `main` ruleset once CI has run once.

---

## B1 — Core round engine

Files (namespace `BuzzerApp.Core.Rounds`, folder `Core/Rounds/`): `RoundPhase`, `TeamTurnStatus`, `RosterEntry`, `RoundSettings`, `RoundResult`, `RoundErrors`, `PublicRoundSnapshot` + `TeamQueueEntry`, `AdminRoundSnapshot` + `BuzzEntry`, `LockedRoundRecord` (+ `LockedBuzz`), `EndedRoundRecord` (+ `TeamOutcomeEntry`, `RoundTeamOutcome { Current, Passed, Unreached }`), `BuzzRound`.
Scoring (`Core/Scoring/`): `ScoreDirection { Add, Remove }`, `ScoreAmountResult`, `ScoreMath`, `Ranking`.
Tests: `Core.Tests/Rounds/BuzzRoundTests.cs`, `BuzzRoundConcurrencyTests.cs`, `Core.Tests/Scoring/ScoreMathTests.cs`, `RankingTests.cs`. Add `Microsoft.Extensions.TimeProvider.Testing` to the **test project only**. Core itself needs no packages (`TimeProvider` is in the BCL).

Rules, on top of PlanMVP §7.3:
- **`BuzzRound` owns one private `System.Threading.Lock`.** Every public member takes it, including the snapshot getters and `Take…Record`, so the class is thread-safe by itself. The Core concurrency test depends on this, and B6 relies on it.
- `RoundResult.Error` holds a **stable code** from `RoundErrors` (`const string`s such as `"round.notIdle"`, `"round.notOpen"`, `"round.windowClosed"`, `"round.unknownPlayer"`, `"round.notLocked"`, `"round.emptyRoster"`, `"round.duplicatePlayer"`). The frontend maps codes to text, and tests assert codes.
- `Begin(roster)`: Idle only. Reject an empty roster or duplicate PlayerIds. Set `RoundId = Guid.CreateVersion7(now)` and `StartedAt = now`.
- The window is closed when `now >= WindowEndsAt`. The same comparison applies in `Buzz` (lock, then reject) and in `Tick`. An Open round with no buzzes stays Open until Reset (no timeout).
- `MaxRecordedBuzzes` caps only the recorded-buzz list. Queueing a team still works beyond the cap.
- **`Version` (long)** goes up by 1 on every state change (anything that returns `Changed = true`, and a `Tick` that locks). It appears in both snapshots. B6 sends snapshots from several threads, and clients drop any snapshot older than the one they hold.
- Snapshots (immutable records with copied collections): add `Version` and `RoundStartedAt?` to the PlanMVP field list. When Idle: `RoundId = null`, empty queue.
- **`TakeLockedRecord()`** returns non-null exactly once after a round locks (from `Buzz` or `Tick`), then null. It carries RoundId, StartedAt, LockedAt, and every recorded buzz (PlayerId, TeamId, Sequence, OffsetMs, CountedForTeam, TeamQueuePosition?).
- **`TakeEndedRecord()`** returns non-null exactly once after `Reset` ends a round that had **locked**: `EndedRoundRecord(RoundId, EndedAt, TeamOutcomes)`, mapping Current → Current, Passed → Passed, Waiting → Unreached. A `Reset` while Open (never locked) or Idle produces nothing. `NextTeam` needs no persistence, because outcomes are only final at Reset.
- **Exhausted:** `CurrentTeamId = null`, and every queue entry is `Passed`.
- `ScoreMath.SignedAmount(int amount, int multiplier, ScoreDirection direction)` returns `ScoreAmountResult(bool Success, int Value, string? Error)`. Validate `amount > 0` and `1 ≤ multiplier ≤ 100`, and use `checked` arithmetic so an overflow comes back as an error, not an exception. `Remove` gives a negative value.
- `Ranking.Rank<T>(IEnumerable<T> items, Func<T,int> total)` returns `(T Item, int Rank)` ordered by total descending with **competition ranking** (100, 100, 90 → 1, 1, 3). Keep the input order for ties (stable sort). B5 and B7 reuse it.
- Tests: everything in PlanMVP §7.3 "Core tests must cover", plus Version increments only on change, `TakeLockedRecord` / `TakeEndedRecord` return once, Reset-while-Open produces no ended record, and the Ranking tie cases. Use `FakeTimeProvider`. **No `Thread.Sleep`.**
- **Check:** all tests green, and Core still has zero package references.

---

## B2 — Domain + persistence

**Core (`Core/Domain/`)**
- Entities from PlanMVP §7.1 as POCOs (no EF attributes), with navigations: `Event.Teams`, `Event.Players`, `Team.Players`, `Round.Buzzes`. Enums: `PlayerRole { Player, Admin }` and `TeamOutcome { Current, Passed, Unreached }` (`BuzzRecord.Outcome`).
- `NameNormalizer.Normalize(string s) => s.Trim().ToUpperInvariant()`. Name properties use `private set` and change only through entity methods (`Player.SetRealName`, `Player.SetDisplayName`, `Team.Rename`). Each method stores the trimmed value and its `Normalized…` copy together, which is the "one place" §7.1 asks for.
- `Core/Security/IPinHasher`: `string Hash(Player p, string pin)` and `PinVerifyResult Verify(Player p, string hash, string pin)` (`Failed | Success | SuccessRehashNeeded`).

**Infrastructure**
- `Persistence/AppDbContext` + one `IEntityTypeConfiguration<T>` per entity in `Persistence/Configurations/`, picked up with `modelBuilder.ApplyConfigurationsFromAssembly(...)`.
- Store all enums as strings, set once in `ConfigureConventions`: `configurationBuilder.Properties<Enum>().HaveConversion<string>()`.
- Keep EF's default **PascalCase** table and column names. The check-constraint SQL and pgAdmin queries depend on them.
- `DeleteBehavior.Restrict` on every FK except BuzzRecord → Round (Cascade). The ledger and history must never disappear through a cascade.
- `Round.Id`: `ValueGeneratedNever()` (Core generates it). `EventArchive.Data`: `string` + `HasColumnType("jsonb")`.
- Indexes and constraints from §7.1, including:
  - `HasIndex(e => e.IsActive).IsUnique().HasFilter("\"IsActive\" = true")`
  - `ToTable(t => t.HasCheckConstraint("CK_ScoreAdjustment_ExactlyOneTarget", "num_nonnulls(\"TeamId\", \"PlayerId\") = 1"))`
  - a unique index on `ScoreAdjustment.ReversesAdjustmentId` (Postgres allows many NULLs in it).
- `Security/PinHasher : IPinHasher` wraps `PasswordHasher<Player>` (package `Microsoft.Extensions.Identity.Core`, in Infrastructure, not Core).
- `DependencyInjection.cs`: `services.AddInfrastructure(string connectionString)` registers `AppDbContext` (Npgsql), `IPinHasher` and `EventSeeder`.
- `Seeding/EventSeedOptions` (Name, Year, JoinCode, ThemeKey, Teams[]), `AdminSeedOptions` (RealName, DisplayName, Pin) and `EventSeeder`, following the §7.2 rules **exactly**:
  - Create the event if its JoinCode doesn't exist, and make it the only active one.
  - Create teams only if the event has none. `SortOrder` = index in config.
  - Create each admin only if no player in the event has that normalized real name. Never reset a PIN.
- `DatabaseInitializer.InitializeDatabaseAsync(IServiceProvider, bool applyMigrations)`: create a scope, migrate if asked, then seed.

**Api**
- `dotnet user-secrets init`. Secrets: `ConnectionStrings:BuzzerDb`, `Event:JoinCode`, `Admins`. `appsettings.json` holds the non-secret `Event` values (name, year, theme key, teams from §7.2) and `"Round": { "GraceWindow": "00:00:02" }`.
- Bind options with `AddOptions<T>().Bind(config.GetSection(...)).Validate(...).ValidateOnStart()`. A missing JoinCode or connection string fails at startup with a clear message.
- Call `InitializeDatabaseAsync` **after `builder.Build()` and before `app.Run()`**, with `applyMigrations: app.Environment.IsDevelopment()`. `dotnet ef` stops the host at `Build()`, so seeding doesn't run during `migrations add`.
- Add `Microsoft.EntityFrameworkCore.Design` to Api (`PrivateAssets all`), on the same version as EF Core.
- `dotnet new tool-manifest` + `dotnet tool install dotnet-ef` (same EF version), then `dotnet ef migrations add InitialCreate` with the command from CLAUDE.md. Commit the migration.

**docker-compose.yaml**
- Remove `version:`.
- `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`.
- Bind `"127.0.0.1:5432:5432"`. If a local PostgreSQL already uses 5432 (`netstat -ano | findstr :5432`), use `5433:5432` and say so.
- `restart: unless-stopped`.
- Commit a `.env.example` with a placeholder. `.env` is already ignored by `*.env`.

**Check:** `docker compose up -d`, then `dotnet ef database update` creates every table (visible in pgAdmin). `dotnet run` seeds 1 event, 6 teams and the configured admins. A second run changes nothing, and renaming a team in pgAdmin survives a restart.

---

## B3 — Auth + session

- **`Common/`**
  - `AuthSetup.cs`: cookie scheme, the `Admin` authorization policy (`RequireRole("Admin")`) and a fallback policy that requires an authenticated user. Mark public endpoints `AllowAnonymous`.
  - `ICurrentUser` / `CurrentUser`: PlayerId, EventId and IsAdmin, read from `HttpContext.User`.
  - `Validation.cs`: helpers that return `Results.ValidationProblem(...)`. Names are 2–20 characters after trim, team names 2–24, and the PIN matches `^\d{4}$`.
  - `AddProblemDetails()` + `UseExceptionHandler()` + `UseStatusCodePages()`.
  - JSON: `ConfigureHttpJsonOptions` adds `JsonStringEnumConverter(JsonNamingPolicy.CamelCase)`, so enums go out as `"admin"` and `"add"`. B6 configures the same converter for SignalR.
- **Cookie** (D22, B3 row in PlanMVP): `HttpOnly`, `SameSite=Lax`, `SecurePolicy = SameAsRequest` in Development and `Always` otherwise, 30-day `ExpireTimeSpan` with `SlidingExpiration`. Set the `OnRedirectToLogin` / `OnRedirectToAccessDenied` events to return 401/403 **explicitly**, even though .NET 10 already does this for API endpoints. Sign in with `IsPersistent = true`.
- **Claims:** `ClaimTypes.NameIdentifier` = PlayerId, `"event_id"` = EventId, `ClaimTypes.Role` = `Player` / `Admin`. Nothing else (D23).
- `UseHttpsRedirection()` only outside Development, so phones on the LAN can use http.
- **`Features/Event/EventEndpoints.cs`** (§8.1): `GET /api/event` and `GET /api/event/teams?code=` (anonymous). The join code is trimmed and compared case-insensitively against the **active** event.
- **`Features/Session/SessionEndpoints.cs`** (§8.2):
  - **Register:** validate, then check join code, team in the active event, and unique real and display names (409, with a message that tells them to sign in instead). Also catch `DbUpdateException` whose inner exception is `PostgresException { SqlState: "23505" }` and return 409, which covers two phones registering the same name at once. Return 201 + the `me` body, signed in.
  - **Sign in, limited by real name:** the rate-limiter middleware runs before the body is read, so it can't partition by name. Use a singleton `SignInThrottle` that wraps `PartitionedRateLimiter.Create<string, string>(name => RateLimitPartition.GetFixedWindowLimiter(name, _ => new() { PermitLimit = 5, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }))`. Call `AttemptAcquire(normalizedRealName)` inside the handler. Not acquired → 429 ProblemDetails + `Retry-After`.
  - **Register limit:** the standard `AddRateLimiter` with a per-`RemoteIpAddress` fixed window of 30/min, `RejectionStatusCode = 429`.
  - Unknown name and wrong PIN return the **same** 401 message. When the name is unknown, still verify against a static dummy hash so response times match. On `SuccessRehashNeeded`, re-hash and save.
  - Sign out → 204. `me` reads from the DB, not the cookie. If the player no longer exists → sign out + 401.
- **Known limit (document it in the summary, don't fix it):** a player promoted to admin keeps the `Player` role claim until they sign in again.
- **CSRF note:** `SameSite=Lax` keeps the cookie off cross-site POSTs, and JSON bodies need a CORS preflight. Don't enable CORS (same origin by design).
- Update `BuzzerApp.Api.http` with every case: register OK, duplicate, bad join code, sign-in OK, wrong PIN, the 6th attempt (429), `me`, sign-out.
- **Check:** every request in the `.http` file behaves as specified.

---

## B4 — Teams + players

- `Features/Teams/TeamEndpoints.cs` (§8.3) and `Features/Players/PlayerEndpoints.cs` (§8.4): route group, request/response records and handlers in one file per feature.
- Everything is scoped to the caller's `EventId` claim. A resource from another event → 404.
- `GET /api/teams`: teams by `SortOrder`, members by display name. `realName` is included only for admins and on the caller's own row (JSON `null` otherwise).
- `POST /api/teams`: duplicate name or colour → 409. `PATCH`: rename via `Team.Rename`, duplicate → 409.
- `DELETE /api/teams/{id}` → 409 if the team has players, score rows **or buzz records** (FK `Restrict` would throw otherwise).
- `PATCH /api/players/{id}/team`: the target team must be in the same event, and the player must have role `Player` (else 400). `POST /api/players/{id}/promote`: `Role = Admin`, `TeamId = null`.
- Name edits go through the entity methods. Uniqueness → 409, including the 23505 catch.
- Add `Realtime/IGameNotifier` (`Task TeamsChangedAsync()`, `Task ScoresChangedAsync()`) with a `NullGameNotifier` registered for now. Call it after every successful write in this step and the next. B6 swaps in the SignalR implementation.
- **Check:** `.http` requests show that non-admins never see other players' real names, that delete guards return 409, and that non-admins get 403 on admin routes.

---

## B5 — Scores

- `Features/Scores/ScoreEndpoints.cs` (§8.5). Use `ScoreMath.SignedAmount` for the amount and `Ranking.Rank` for team ranks.
- Adjustment target: a team in the event, or a player in the event with role `Player` (else 400). Set `CreatedByPlayerId` = the current admin. Return 201.
- `GET /api/scores/teams`: every team, including zero totals (left join / group in memory; ~6 rows). `GET /api/scores/players`: every `Player`-role player, including zeros, excluding admins.
- `GET /api/scores/adjustments?take=`: clamp to 1–100, default 20. Include the target name, the created-by display name, `reversesAdjustmentId`, and an `isReversed` flag.
- Reverse: 404 if missing; 400 if the row is itself a reversal; 409 if already reversed (pre-check + 23505 catch). The new row has `Amount = -original` and the same target.
- Every write → `ScoresChangedAsync()`.
- **Check:** totals add up in the `.http` walkthrough, a second reverse returns 409, and ties share a rank.

---

## B6 — Realtime

- **`Realtime/GameHub`** (`[Authorize]`, mapped at `/hubs/game`):
  - `OnConnectedAsync`: if admin, add to the `admins` group. Send the caller the current `RoundUpdated`, plus `AdminRoundUpdated` for admins.
  - `Buzz()`: `[Authorize(Roles = "Player")]`. PlayerId comes **only** from the cookie claim.
  - `BeginRound()`, `NextTeam()`, `ResetRound()`: `[Authorize(Roles = "Admin")]`. They return `RoundResult`.
- **`Realtime/RoundService`** (singleton) owns one `BuzzRound`, built from `TimeProvider` (register `TimeProvider.System`) and `RoundSettings` bound from the `Round` config section.
  - `BeginAsync(eventId)`: load the roster through `IServiceScopeFactory` (**never** inject `DbContext` into a singleton). The roster is the event's players with role `Player` and a `TeamId`, carrying display name and team name. Then `Begin(roster)`. Remember `eventId` for persistence. Two admins pressing Begin together is fine: `BuzzRound` rejects the second.
  - After every call that returned `Changed`: enqueue any `TakeLockedRecord()` / `TakeEndedRecord()` result (see Persistence), then broadcast.
  - **Broadcast:** a `SemaphoreSlim(1,1)` around "take both snapshots → `Clients.All.SendAsync("RoundUpdated", pub)` → `Clients.Group("admins").SendAsync("AdminRoundUpdated", admin)`". The snapshots are taken **inside** the semaphore, so every send carries the newest state in order. `Version` is the client-side backstop.
- **Persistence ordering:** `RoundPersistenceQueue` wraps an unbounded `Channel<RoundPersistenceWork>` (`Locked(eventId, LockedRoundRecord)` or `Ended(EndedRoundRecord)`). A single `RoundPersistenceWorker` (`BackgroundService`) reads it in order, opening a new scope per item.
  - On lock: insert `Round` + its `BuzzRecord`s.
  - On end: set `EndedAt` and each counted BuzzRecord's `Outcome` from the team outcomes.
  - Why a queue: a Reset straight after a lock must never update rows that aren't inserted yet, and buzz latency must never wait on the DB.
  - Log DB errors and continue; never throw them into the game.
- **`Realtime/RoundClock`** (`BackgroundService`): `PeriodicTimer(100 ms)` → `RoundService.TickAsync()`. That calls `Tick()`; if it returns true, enqueue the locked record and broadcast. Wrap each iteration in try/catch + log so the clock never dies.
- **`Realtime/HubGameNotifier : IGameNotifier`** sends `TeamsChanged` / `ScoresChanged` to All and replaces `NullGameNotifier`.
- `AddSignalR().AddJsonProtocol(o => ...)` gets the same camelCase enum converter as HTTP.
- **Check:** write a throwaway console client in the session scratchpad, **not committed**. It uses `Microsoft.AspNetCore.SignalR.Client` + `HttpClient` with a `CookieContainer` for sign-in, and passes the cookies to the hub connection. Run 2 players on different teams + 1 admin through: Begin → one buzz → auto-lock after ~2 s with no further input → NextTeam → Reset. Then confirm that the admin receives individual buzzes and players don't, and that `Round` / `BuzzRecord` rows show LockedAt, EndedAt and outcomes.

---

## B7 — Archive

- `Core/Archive/`: the `ArchiveDocument` v1 records (PlanMVP §8.6) + a pure `ArchiveBuilder.Build(...)` that takes plain inputs (event info, teams with members and totals, players with totals, stats, `generatedAt`) and uses `Ranking`. Admins are excluded from players and members. Add Core tests for ranks, ties and the admin exclusion.
- `Features/Archive/ArchiveEndpoints.cs`:
  - `POST /api/archive/finalize` (admin): `roundsPlayed` = rounds with `LockedAt != null`; `totalBuzzes` = BuzzRecord count. Serialize with `JsonSerializerDefaults.Web`, upsert `EventArchive` (unique per event), set `Event.FinalizedAt`. Can be re-run.
  - `GET /api/archive/{eventId}/export` (admin): `Results.File(bytes, "application/json", $"buzzer-archive-{year}.json")`; 404 if not finalized.
- **Check:** finalize → export → the file has `schemaVersion: 1`, correct totals and ranks. **Don't commit the file** (`.gitignore` already covers `buzzer-archive-*.json`).

---

## B8 — Hosting prep

- `UseDefaultFiles()` + `UseStaticFiles()` before the endpoints. `MapFallbackToFile("index.html")` goes **after** the API and hub routes.
- Unknown `/api/**` and `/hubs/**` paths must return a **404 ProblemDetails**, not `index.html`. Map an explicit catch-all for those prefixes ahead of the SPA fallback.
- `/healthz`: `AddHealthChecks().AddDbContextCheck<AppDbContext>()` (package `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`), anonymous.
- Add `backend/src/BuzzerApp.Api/wwwroot/` to `.gitignore` (built frontend output).
- Note for R2 (no change now): on Azure App Service, set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so the per-IP registration limit sees real client IPs, not the proxy.
- **Check:** `cd frontend && npm run build`, copy `dist/*` into `Api/wwwroot`, then `dotnet run`. `/` serves the app, `/some/client/route` serves the app, `/api/nope` returns a 404 ProblemDetails, and `/healthz` reports Healthy.
