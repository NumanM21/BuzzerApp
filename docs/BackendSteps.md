# Backend steps B0–B9 — implementation briefs

> **Audience:** AI workers implementing one step each (usually in a fresh session).
> Adds implementation detail to `docs/PlanMVP.md` §10 Milestone B. **PlanMVP wins on product decisions; this file wins on implementation detail.**
> Written 9 Nov 2026. **B0 and B1 are done and merged into `main`; B2 is done on branch `backend-b2`, B3 on `backend-b3-auth`, B4 on `backend-b4` and B5 on `backend-b5` (each DONE section records what was actually produced).** Start at B6.

| Step | Branch | Suggested model | Why |
|---|---|---|---|
| B0 | `backend-b0-cleanup` — **DONE, merged** | Sonnet | Mechanical cleanup + CI |
| B1 | `backend-b1-core` — **DONE, merged** | Opus | State machine + concurrency; its API shape fixes B6 |
| B2 | `backend-b2` — **DONE** | Sonnet | Standard EF Core; traps listed below |
| B3 | `backend-b3-auth` — **DONE** | Sonnet + review | Security-sensitive |
| B4 | `backend-b4` — **DONE** | Sonnet | CRUD |
| B5 | `backend-b5` — **DONE** | Sonnet | CRUD + `ScoreMath` |
| B6 | `backend-b6-realtime` | **Opus** (or Sonnet + Opus review) | Singleton + clock + SignalR + ordered persistence; bugs only show up under timing |
| B7 | `backend-b7-archive` | Sonnet | Pure builder + 2 endpoints |
| B8 | `backend-b8-hosting` | Sonnet | Static file hosting |
| B9 | `backend-b9-review` | **Opus or Fable** | Whole-backend re-review + end-to-end walkthrough against a throwaway "UAT" database |

---

## Shared rules for every worker

- Read `CLAUDE.md` and `docs/PlanMVP.md` first, then the brief for your step below.
- The developer's prompt saying "do B<n>" counts as "go". Don't stop to propose a file list unless something in the brief is unclear or looks wrong. If it does, say so and propose an alternative. Never silently deviate.
- Branching: B0 is merged, so `main` has CI and the `backend` + `frontend` checks are required by the `main` ruleset (PR, 1 approval, rebase merge only). Every step branches `backend-b<n>-<short-name>` off the latest `origin/main` (`git fetch`, then branch from `origin/main`). A step's PR can't merge until both checks are green. Make small commits, one logical change each. Don't push or open a PR unless asked.
- **Done** = `dotnet build BuzzerApp.slnx` + `dotnet test BuzzerApp.slnx` pass with **zero warnings** (warnings are errors from B0 on), plus the step's own **Check**. **Every step that adds endpoints also adds integration tests in `backend/tests/BuzzerApp.Api.Tests`** (see "Api tests" in the B3 section for the factory, helpers and conventions); `dotnet test` needs Docker running. Finish with a short summary of what was built and why (a few paragraphs).
- **Mark the step done in this file as your last commit** (no need to be asked). In the table, change the branch cell to `<branch> — **DONE**`. Add ` — DONE` to the step's section heading, add a short "Kept for reference; **do not redo.**" note listing what exists now, and record every deviation from the brief and anything later steps must know. If something you learned affects a later step, add it to that step's brief too. Update the "Start at B<n>" line at the top. Commit it as `Mark B<n> done in BackendSteps`.
- Package versions: don't guess. Look up the latest stable version (e.g. `curl -s https://api.nuget.org/v3-flatcontainer/<lowercase-id>/index.json`; the last stable entry is the newest), add a `<PackageVersion>` to the root `Directory.Packages.props`, and reference the package in the csproj **without** a `Version` attribute (central package management is on, so a `Version` there is an error). Confirm it restores and builds.
- **.NET 10 only.** `global.json` pins SDK `10.0.100` (`rollForward: latestFeature`) so the 8.0 SDK on the dev machine is never used. Don't add `net8.0` targets or .NET 8 workarounds.
- Build settings (`net10.0`, nullable, implicit usings, `TreatWarningsAsErrors`) live in the root `Directory.Build.props`. Don't repeat them in csproj files.
- Use UTC everywhere: `TimeProvider.GetUtcNow()` (inject `TimeProvider`, never `DateTime.Now`). Npgsql rejects a `DateTimeOffset` with a non-zero offset for `timestamptz` columns.
- Comments explain *why*, not *what*.
- **Don't start, stop or write to the developer's Docker dev database (`docker compose`, the `.http` file against `localhost:5283`) just to "run the Check".** The developer holds no data there that they want to keep, but they don't want every step to churn the container. The Api tests already run the same endpoints against a throwaway Testcontainers PostgreSQL, so a step's `.http` requests only need to be **written** (and kept accurate), not executed. Say "not run live, covered by the integration tests" in the DONE note. The live end-to-end walkthrough happens once, in B9, against a separate UAT database.
- **Tests must not hard-code the 2026 event.** The number and names of teams, and the number of players, change every year (2026 has six teams; a later year may have fewer or more, and a different crowd). A test must pass for "several" teams, never for "exactly six".
  - Never assert a team count of `6`, a team name such as `"Rage Quitters"`, a colour such as `"red"`, or "the second seeded team". Either **create what the test needs** (`admin.CreateTeamAsync()`, `factory.NewTeamIdAsync()`, `RegisterNewPlayerAsync()`), or **read the expected value from the database** (`factory.ActiveEventTeamsAsync()`, `factory.FirstTeamAsync()`, `factory.TeamNameAsync(id)`).
  - Logic that depends on how many teams or players there are (queueing, locking when every team has buzzed, ranking, ties, totals, the archive) is tested with a `[Theory]` over several shapes, for example 2, 6, 13 and 30 teams (see `Shapes` in `BuzzRoundConcurrencyTests`), plus the edge cases that matter (one team, equal totals, a team with no players).
  - Literal names are fine when the test supplies its own data (a Core roster built inside the test, a key-format example). They are not fine when they restate what the seed happens to contain.
  - **Quick check for any step that touches teams or players:** temporarily change `Event:Teams` in `appsettings.json` to 3 teams, then to 8, and run the Api tests. They must still pass. Restore the file afterwards.
- **Every list has a deterministic order.** Anything a step returns as a list (endpoint, snapshot, archive, ranking) must come back in the same order for the same data, however many times and in whatever order the rows were inserted. The only exception is when the order *is* the data: the buzz queue and recorded buzzes (arrival order, `Sequence`).
  - Give every list an explicit sort that **ends in a unique tiebreaker**, normally `Id`. `SortOrder`, totals, ranks, timestamps and display names are not unique on their own (two admins can create teams at once; two players can have equal scores; two rows can share a `CreatedAt`). Postgres returns rows in no guaranteed order, and an `OrderBy` without a tiebreaker returns ties in an arbitrary one.
  - The default orders: teams by `SortOrder`, `Id`; players and team members by display name (ignoring case), `Id`; the adjustment history newest first by `CreatedAt` descending, `Id` descending; a scoreboard by total descending, then the entity's default order above (give `Ranking.Rank` input that is **already** in that default order, because it keeps input order for ties); a roster or any other internal list by `Id`.
  - Name sorts use an explicit comparer in memory (`StringComparer.OrdinalIgnoreCase`), not the database collation, so a laptop's Docker Postgres and Azure agree.
  - Never put the enumeration of a `Dictionary`, `HashSet` or a `GroupBy`/`ToDictionary` result into a response or snapshot without sorting it first. Lookups are fine; iteration order is not part of their contract.
  - Why: this removes a whole class of flaky behaviour (a list that reorders between refreshes, a snapshot that differs for identical data, a test that passes on one run and fails on the next) and it lets tests assert an exact order instead of "contains".
  - Tests assert the order the contract defines (computed from the same rule, or compared against the database read with that rule), not just "the right items". When an order is deliberately not part of a contract, compare as a set.
  - **Review for it** whenever you add or touch a query or a list: search the step's code for `ToListAsync`, `Select(`, `GroupBy`, `Dictionary` and `HashSet` and check that each one that reaches a response has a full sort.

---

## B0 — Hygiene + CI — DONE (merged into `main`)

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- Template files (`Class1.cs` ×2, `UnitTest1.cs`) and the weather sample are gone. `Program.cs` keeps only `AddOpenApi` / `MapOpenApi` / `UseHttpsRedirection`. `BuzzerApp.Api.http` has a placeholder `GET {{host}}/openapi/v1.json` (variable `@host = http://localhost:5283`).
- Root `global.json`, `Directory.Build.props`, `Directory.Packages.props` exist as described in the shared rules. The four csproj files contain no `TargetFramework`, `Nullable`, `ImplicitUsings` or package versions.
- **Tests use xunit v3 on the VSTest runner:** `xunit.v3` **3.2.2** + `xunit.runner.visualstudio` **3.1.5** + `Microsoft.NET.Test.Sdk` + `coverlet.collector`, with `<OutputType>Exe</OutputType>` in the test csproj. **Deviation from "latest":** `xunit.v3` 4.x and runner 4.x make the .NET 10 SDK demand the Microsoft.Testing.Platform runner (`dotnet test` fails with "Testing with VSTest target is no longer supported"). Staying on 3.x avoids touching `global.json`. Don't bump these without also opting into MTP deliberately.
- `backend/tests/BuzzerApp.Core.Tests/PlaceholderTests.cs` holds one trivial test. **B1 deletes it.**
- `.github/workflows/ci.yml`: two parallel jobs on ubuntu-latest, run on PRs into `main` and pushes to `main`. `backend`: `actions/checkout@v7`, `actions/setup-dotnet@v6` with `global-json-file: global.json`, then `dotnet test BuzzerApp.slnx --configuration Release`. `frontend`: `actions/checkout@v7`, `actions/setup-node@v7` (Node 24, npm cache), `npm ci`, `npm run lint`, `npm run build`. The `npx vitest run` step is commented out until F3.
- `.gitignore` excludes `buzzer-archive-*.json`.
- The `main` ruleset (PR required, 1 approval, rebase-only, required checks `backend` and `frontend`, branch up to date) is set up on GitHub. **Job names `backend` / `frontend` in `ci.yml` must not be renamed** without updating the ruleset, or PRs hang waiting for a check that never reports.
- Not covered yet (later steps): `docker-compose.yaml` fixes and tool manifest (B2), User Secrets (B2).

---

## B1 — Core round engine — DONE (merged into `main`)

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- Everything in the file list below exists. `PlaceholderTests.cs` is deleted. `Microsoft.Extensions.TimeProvider.Testing` **10.11.0** is in the test project only; `BuzzerApp.Core.csproj` still has no package references.
- **`RosterEntry(int PlayerId, string DisplayName, int TeamId, string TeamName)`**: the field is `DisplayName`, not `PlayerName`. Snapshots built from it go to every player, so a real name must never be put in it (B6).
- **Extra file `Scoring/ScoreErrors.cs`**: stable codes `score.amountNotPositive`, `score.multiplierOutOfRange`, `score.invalidDirection`, `score.overflow`. An undefined `ScoreDirection` value is rejected (enums from JSON aren't guaranteed to be defined).
- `RoundResult` has `Ok(changed = true)` / `Fail(error, changed = false)` helpers. A buzz at/after `WindowEndsAt` returns **`Success = false, Error = round.windowClosed, Changed = true`**: the buzz failed but the round locked, so B6 must still persist and broadcast. Treat `Changed`, not `Success`, as the trigger.
- `Reset()` while Idle returns `Success = true, Changed = false` (no Version bump). `NextTeam()` in Exhausted returns `round.notLocked`.
- `LockedBuzz.TeamQueuePosition` is set only on the buzz that queued its team (`CountedForTeam = true`); later teammate buzzes have null.
- `TakeLockedRecord()` / `TakeEndedRecord()` are backed by **queues**, not single slots: if a caller is late, a later round can't overwrite an untaken record. Each record is still returned exactly once, oldest first.
- `AdminRoundSnapshot` **repeats** the public fields instead of inheriting from `PublicRoundSnapshot`. SignalR serializes the runtime type, so inheritance could leak buzzes to players. Keep it that way.
- `RoundSettings` is validated in the `BuzzRound` constructor (`GraceWindow >= 0`, `MaxRecordedBuzzes >= 0`; `ArgumentOutOfRangeException` otherwise).
- `RoundTeamOutcome` (Core/Rounds) mirrors B2's `Domain.TeamOutcome` (Current/Passed/Unreached); B6 maps one to the other.
- 90 tests. The concurrency tests were checked by removing the lock: 5 of 6 then fail. (Updated in B4: they now run over several team/player counts via `Shapes` instead of one fixed 6 x 10 roster; see the shared rule on not hard-coding the 2026 event.)

Original brief:


Files (namespace `BuzzerApp.Core.Rounds`, folder `Core/Rounds/`): `RoundPhase`, `TeamTurnStatus`, `RosterEntry`, `RoundSettings`, `RoundResult`, `RoundErrors`, `PublicRoundSnapshot` + `TeamQueueEntry`, `AdminRoundSnapshot` + `BuzzEntry`, `LockedRoundRecord` (+ `LockedBuzz`), `EndedRoundRecord` (+ `TeamOutcomeEntry`, `RoundTeamOutcome { Current, Passed, Unreached }`), `BuzzRound`.
Scoring (`Core/Scoring/`): `ScoreDirection { Add, Remove }`, `ScoreAmountResult`, `ScoreMath`, `Ranking`.
Tests: `Core.Tests/Rounds/BuzzRoundTests.cs`, `BuzzRoundConcurrencyTests.cs`, `Core.Tests/Scoring/ScoreMathTests.cs`, `RankingTests.cs`. Delete `PlaceholderTests.cs` (B0's stand-in). Add `Microsoft.Extensions.TimeProvider.Testing` to the **test project only**: a `<PackageVersion>` in `Directory.Packages.props` and a version-less `<PackageReference>` in `BuzzerApp.Core.Tests.csproj`. Core itself needs no packages (`TimeProvider` is in the BCL), so `BuzzerApp.Core.csproj` stays an empty `<Project Sdk="Microsoft.NET.Sdk">` apart from what you add under the rules. Warnings are errors, so XML-doc-less public types are fine but unused variables, nullable issues etc. will fail the build.

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

## B2 — Domain + persistence — DONE

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- **Core:** `Domain/` (`Event`, `Team`, `Player`, `ScoreAdjustment`, `Round`, `BuzzRecord`, `EventArchive`, `PlayerRole`, `TeamOutcome`, `NameNormalizer`) and `Security/IPinHasher` (+ `PinVerifyResult`). Core still has zero package references. `Team` and `Player` have a public constructor (which calls the name setters) plus a private parameterless one for EF; `Rename` / `SetRealName` / `SetDisplayName` throw `ArgumentException` on blank input (length rules 2–20 / 2–24 are still B3's API validation). `Player.PinHash`, `Role` and `TeamId` are plain public setters: B3 sets the hash after construction (`IPinHasher.Hash` needs the `Player`), B4 sets `Role` / `TeamId` for promote and move. 7 new tests in `Core.Tests/Domain/NameTests.cs` (97 total).
- **Infrastructure:** `Persistence/AppDbContext` + 7 configurations (internal classes, found by `ApplyConfigurationsFromAssembly`), `Security/PinHasher`, `Seeding/{EventSeedOptions, AdminSeedOptions, EventSeeder, DatabaseInitializer}`, `DependencyInjection.AddInfrastructure(connectionString)` (also registers `TimeProvider.System` with `TryAdd`). Extra indexes beyond the brief: `ScoreAdjustment (EventId, TeamId)` and `(EventId, PlayerId)` for the SUM queries, `Round.EventId`, unique `BuzzRecord (RoundId, Sequence)`. String max lengths: names/display names 100 (the 2–20 / 2–24 limits are enforced by the API, with room for case-mapping changes), keys 50, `PinHash` 256, `Reason` 200.
- **Seeder:** `IOptions<EventSeedOptions>` + `IOptions<List<AdminSeedOptions>>`. When creating the event it deactivates any other active event with an `ExecuteUpdate` **inside the same transaction** before the insert (the filtered unique index is checked per statement). Join-code lookup is an exact match on the trimmed code. Admins are seeded into the event whose join code is configured.
- **Api:** `Common/OptionsSetup.AddAppOptions` binds and validates `Event`, `Admins` and `Round` (`RoundSettings` from Core, ready for B6) with `ValidateOnStart`. Missing `ConnectionStrings:BuzzerDb` throws at startup with the `user-secrets` command in the message; a missing `Event:JoinCode` fails the same way. `Program.cs` calls `DatabaseInitializer.InitializeDatabaseAsync(app.Services, applyMigrations: app.Environment.IsDevelopment())` right after `Build()`. `Microsoft.EntityFrameworkCore.Design` 10.0.14 is in Api; `appsettings.json` holds the non-secret `Event` values and `Round:GraceWindow`.
- **Tooling:** the tool manifest is **`dotnet-tools.json` at the repo root** (this SDK puts it there, not in `.config/`); `dotnet tool restore` finds it. `dotnet-ef` 10.0.14. Migration `InitialCreate` is in `Infrastructure/Persistence/Migrations`.
- **Package versions:** `Microsoft.EntityFrameworkCore.Design` and `Microsoft.Extensions.Identity.Core` **10.0.14**, same as the other EF packages.
- **Deviation, branch name:** worked on `backend-b2` (already created by the developer) instead of `feature/b2-persistence`.
- **Deviation, docker-compose host port is `5434`, not 5432/5433.** The dev machine has PostgreSQL on 5432 (a Windows service and another container) and another process on 5433, so compose binds `127.0.0.1:5434:5432`. The container port is still 5432. Connection strings use `Port=5434`. Other machines can change the left-hand port freely.
- **Local setup the developer does once** (nothing below is committed): copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`; then `dotnet user-secrets set` for `ConnectionStrings:BuzzerDb` (`Host=localhost;Port=5434;Database=buzzer_db;Username=buzzer_user;Password=<same>`), `Event:JoinCode`, and `Admins:0:RealName` / `DisplayName` / `Pin`. The B2 session set **placeholder dev values**: join code `DEV-2026`, admin real name `Dev Admin`, display name `Admin`, PIN `1234`. Change them by deleting the admin row (or `docker compose down -v`) and updating the secrets, since the seeder never resets an existing admin's PIN.
- **Checked:** `docker compose up -d` + `dotnet ef database update` create all 7 tables; `dotnet run` seeded 1 event, 6 teams and 1 admin; a second run changed nothing; a team renamed in the DB survived a restart; the check constraint, the one-active-event index and the team-name unique index all reject bad rows; a blank `Event:JoinCode` fails at startup with a clear message.
- **For B3:** `Player.NormalizedRealName` / `NormalizedDisplayName` are the lookup columns; use `NameNormalizer.Normalize` on input. `IPinHasher` is registered as a singleton. The registration 23505 catch should expect the index names `IX_Players_EventId_NormalizedRealName` and `IX_Players_EventId_NormalizedDisplayName` if you want to say which name clashed.

Original brief:


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

## B3 — Auth + session — DONE

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- **`Api/Common/`:** `AuthSetup` (cookie scheme, `Admin` policy, fallback policy, `AuthPolicies` / `AppClaims` constants), `CurrentUser` (`ICurrentUser`, scoped; also `CreatePrincipal`), `Validation` (class `ValidationErrors`, a chainable collector: `PersonName`, `TeamName`, `Pin`, `Required`, `Positive`, `ToResult()` → `Results.ValidationProblem`), `RateLimitSetup`, `DbErrors.IsUniqueViolation(out constraintName)` (the 23505 catch), `ActiveEvent.FindIdByJoinCodeAsync` (trim + case-insensitive match against the active event; null if wrong). B4/B5 reuse these.
- **`Api/Features/Event/EventEndpoints`** and **`Features/Session/{SessionEndpoints, SignInThrottle, PinDecoy}`**. `Program.cs` now has exception handler → status-code pages → (https redirect outside Development) → authentication → authorization → rate limiter → endpoints, plus the camelCase enum converter. Cookie name `buzzer.auth`.
- **Dev checks done with curl against the real DB** (the `.http` file lists every case): register 201 + cookie, duplicate real name / display name 409, bad code 404, bad team 400, invalid fields 400 (all fields listed), sign-in case-insensitive, wrong PIN and unknown name give the identical 401, the 6th sign-in for one name gives 429 + `Retry-After`, other names unaffected, `me` 401 after sign-out, anonymous routes 401 (no redirect). The 403 path could not be exercised yet because no admin route exists; B4 should check it.
- **Api tests (added after the first B3 commits; PlanMVP D32 now requires them).** New project `backend/tests/BuzzerApp.Api.Tests` (xunit v3 like Core.Tests; `Microsoft.AspNetCore.Mvc.Testing` 10.0.14, `Testcontainers.PostgreSql` 4.16.0). 118 tests: `Features/{EventEndpointsTests, RegisterTests, SignInTests, SessionLifecycleTests, AuthorizationTests, JoinCodeRateLimitTests}` (integration) and `Common/{ValidationErrorsTests, SignInThrottleTests, CurrentUserTests}` (unit). Conventions for later steps:
  - `Infrastructure/ApiFactory` (a `WebApplicationFactory<Program>`) starts a `postgres:16-alpine` container, passes config with `UseSetting` (not `ConfigureAppConfiguration`: `Program.cs` reads the connection string before the host is built) and runs in Development, so migrations and the seeder run exactly as locally. Seeded admin: `Test Admin` / PIN `9876`; join code `TEST-2026`. One container is shared by all classes via `[Collection(ApiCollection.Name)]`, so **tests isolate themselves with unique names** (`ApiHelpers.UniqueName`), never by resetting the database.
  - `factory.CreateBrowser()` = a client with its own cookie jar and redirects off. `RegisterNewPlayerAsync()` returns a signed-in player. `factory.WithDbAsync(...)` reads or changes the DB directly (use it to arrange state such as a deleted player or a moved team). Responses are checked as `JsonElement` so tests pin the wire format (camelCase, string enums), not the C# DTOs.
  - Sign in as the admin with `SignInAsync(ApiFactory.AdminRealName, ApiFactory.AdminPin)` to test admin routes (B4+ must add the 403-for-players cases that B3 couldn't).
  - The per-IP register limit is lifted to 10 000 for the shared factory (config `RateLimiting:JoinCodePerMinute`, default 30) because every test request shares one IP; `JoinCodeRateLimitTests` uses its own factory with a limit of 3.
  - `xUnit1051` (pass `TestContext.Current.CancellationToken`) is suppressed in this project only.
  - `Directory.Packages.props` now has `CentralPackageTransitivePinningEnabled` and explicit `Microsoft.EntityFrameworkCore` / `.Relational` 10.0.14 versions: without them the test project resolved EF Core 10.0.4 (the Npgsql provider's minimum) and failed with MSB3277.
  - The tests found two real issues, both fixed: **(1)** in Development a missing or malformed body threw and `UseExceptionHandler` turned it into a 500 while Production gave 400; `RouteHandlerOptions.ThrowOnBadRequest = false` now makes both 400. **(2)** an unknown route returns **401 to anonymous callers** (the fallback policy also applies when no endpoint matches) and 404 once signed in. B8's `/api/**` catch-all 404 must be `AllowAnonymous()` if it should be a 404 for everyone.
  - Mutation-checked: disabling the 23505 catch makes both concurrent-registration tests fail.
- **Deviation, branch name:** `backend-b3-auth` (already created by the developer), not `backend/b3-auth`.
- **Deviation, PIN regex:** `^[0-9]{4}\z` instead of `^\d{4}$`. `\d` matches non-ASCII digits and `$` accepts a trailing newline.
- **Deviation, extra rate limit:** `GET /api/event/teams?code=` uses the same 30/min-per-IP policy (`RateLimitPolicies.JoinCode`) as register, because it is a join-code oracle.
- **Join code errors differ by endpoint on purpose:** register and `event/teams` return 404 for a wrong code; sign-in returns the generic 401 (and spends the decoy hash) so it can't reveal anything.
- **Sign-in throttle:** 5 attempts / 5 min per normalized real name, in memory (resets on restart), counted for unknown names too and for successful attempts. Side effect to accept: anyone can lock out a specific real name for 5 minutes by spamming it.
- **`PinDecoy`** (singleton) verifies against a random hash when the name is unknown so timing doesn't reveal which names exist.
- **Fallback authorization policy requires a signed-in user**, so every endpoint is private unless it calls `AllowAnonymous()`. `MapOpenApi()` already does.
- **Known limit (as briefed):** a player promoted to admin keeps the `Player` role claim until they sign in again.
- **Namespace gotcha for B4+:** the folder `Features/Event` makes `BuzzerApp.Api.Features.Event` a namespace, so inside any `BuzzerApp.Api.Features.*` namespace the simple name `Event` means that namespace, not the entity. Use `var`, or alias `using EventEntity = BuzzerApp.Core.Domain.Event;`.

Original brief:


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

## B4 — Teams + players — DONE

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- **Api:** `Features/Teams/TeamEndpoints.cs` and `Features/Players/PlayerEndpoints.cs` (route group, records and handlers per file, as briefed), `Realtime/IGameNotifier.cs` (the interface plus `NullGameNotifier`), registered in `Program.cs` as a singleton. **B6 replaces that registration line** with `HubGameNotifier`. Admin routes sit in a nested `MapGroup("").RequireAuthorization(AuthPolicies.Admin)` inside the feature's group, so a route that forgets it falls back to "signed in" rather than "public"; B5 can use the same shape.
- **Common additions:** `ValidationErrors.OptionalPersonName` (null = leave unchanged), `Key` (colour/icon keys) and `Error` (custom message); `DbErrors.IsForeignKeyViolation`.
- **Notifications:** every successful write in B4 sends **both** `TeamsChangedAsync` and `ScoresChangedAsync` (a new or deleted team is a leaderboard row; a rename, move or promote changes team and player names, teams and who appears on the player leaderboard). Rejected writes and no-ops (a move to the team the player is already on, promoting an existing admin) send nothing. B5 only needs `ScoresChangedAsync`.
- **Deviations / decisions not in the brief:**
  - **Colour and icon keys must match `^[a-z0-9-]{1,50}$`** (trimmed, not lower-cased for the caller: `"Red"` is a 400). The unique index on `(EventId, ColorKey)` is case-sensitive, so without this `"Red"` could sit next to `"red"`.
  - `POST /api/teams` and `PATCH /api/teams/{id}` return `TeamSummaryResponse` (no members). New teams get `SortOrder = max + 1`. A rename may change only the capitalisation of the team's own name.
  - **Idempotent no-ops return 200:** `promote` on an existing admin, and a move to the player's current team.
  - Move: unknown or other-event **team** → 400 on `teamId` (same as register); unknown or other-event **player** → 404; an admin target → 400. An empty `PATCH` body (`{}`) on the name routes → 400.
  - `PATCH /api/players/me` returns the same `PlayerResponse` as the admin routes (includes the real name, which is the caller's own). Own-name and admin edits share one code path; a clash with another player is a 409 and nothing is applied (no half-saved request).
  - Delete races: a team deletion that loses to a registering player is caught as an FK violation (23503) and returned as 409; a move into a team deleted in between returns 400.
  - Branch name: `backend-b4` (already created by the developer), not `backend/b4-teams-players`.
- **Api tests:** 81 new (199 Api tests total, 97 Core). `TeamEndpointsTests`, `PlayerEndpointsTests`, `WriteNotificationTests` (a spy `IGameNotifier` swapped in with `factory.WithWebHostBuilder(...)`; same container). This is where the **403-for-players cases B3 couldn't test** now live, and the `401` cases for the same routes. Mutation-checked: removing the 23505 catch makes both the team-create and the player-rename race tests fail with a 500.
- **Test conventions for B5+:**
  - `factory.CreateAdminAsync()` inserts a **fresh admin** (unique name, known PIN) and signs a browser in. Use it instead of signing in as the seeded admin: sign-in is throttled to 5 attempts per real name, so a few tests signing in as `Test Admin` would hit 429. Returns `AdminSession(Client, PlayerId, RealName)`.
  - `factory.NewTeamIdAsync()` (a new team in the active event, inserted directly) and `admin.CreateTeamAsync()` (through the API) when a test needs "another team"; `factory.FirstTeamAsync()`, `factory.ActiveEventTeamsAsync()` and `factory.TeamNameAsync(id)` to read expected values from the database; `factory.CreateOtherEventAsync()` (an inactive second event with a team and a player, for "another event's data is a 404" tests). No helper picks "the n-th seeded team" any more: see the shared rule on not hard-coding the 2026 event.
  - **The shared database holds more than the seed:** the create-team tests add teams, and other tests add players, and a second event exists. Never assume a team or player count, or that a list contains only the rows you made: assert on the rows you created, or compare with the database. Never rename or delete a seeded team in a test. B5's `GET /api/scores/teams` returns those extra teams too.
  - A signed-in browser stays signed in as whoever registered/signed in last on it: registering a player on an admin's `HttpClient` replaces the admin cookie.
- **For B5:** promoting a player doesn't touch the ledger, so an admin can still have `PlayerId` score rows from when they were a player. `GET /api/scores/players` already excludes admins (brief), and the adjustment target check already requires role `Player`; B7's player list must exclude them too.
- **Not run live:** the new `.http` requests (B4 section at the end of the file) were not run against the dev database (B9 walks them through on a UAT database); the same cases are covered by the integration tests against a throwaway PostgreSQL.
- **Follow-up, tests made independent of the seed:** the Api tests no longer name the 2026 teams or assume six of them (they create teams or read them from the database), and `BuzzRoundConcurrencyTests` runs over 2, 6, 13 and 30 teams (`Shapes`). Both were checked by running the Api suite with 3 and then 8 teams in `Event:Teams`. This surfaced one product fix: team lists (`GET /api/teams`, `GET /api/event/teams`) now order by `SortOrder` **then `Id`**, because `SortOrder` isn't unique (two admins creating teams at once can tie) and Postgres returned ties in an arbitrary order.
- **Follow-up, deterministic-order review (after B4):** every list in B1–B4 was checked against the shared "Every list has a deterministic order" rule. Core is clean: `BuzzRound` only *looks up* its `Dictionary` / `HashSet` and never enumerates them into output, the queue and buzz lists are in arrival order, and `Ranking.Rank` keeps input order for ties (so its callers must pre-sort, which B5 and B7 do). Api: `GET /api/teams`, `GET /api/event/teams` (`SortOrder`, `Id`), team members and `GET /api/players` (display name ignoring case, `Id`) now all end in an `Id` tiebreaker; the only one that actually misbehaved was the team lists (`SortOrder` ties). Tests: the team lists, member order and player list order are asserted exactly, and the player list is also checked to be byte-identical on two requests.

Original brief:

- `Features/Teams/TeamEndpoints.cs` (§8.3) and `Features/Players/PlayerEndpoints.cs` (§8.4): route group, request/response records and handlers in one file per feature.
- Everything is scoped to the caller's `EventId` claim. A resource from another event → 404.
- **From B3:** use `ICurrentUser`, `ValidationErrors`, `DbErrors.IsUniqueViolation` and `ActiveEvent`; the admin policy is `AuthPolicies.Admin` (`.RequireAuthorization(AuthPolicies.Admin)` on the admin groups). Check that a signed-in non-admin gets 403 (B3 couldn't test it). See B3's namespace gotcha about `Event`.
- `GET /api/teams`: teams by `SortOrder`, members by display name. `realName` is included only for admins and on the caller's own row (JSON `null` otherwise).
- `POST /api/teams`: duplicate name or colour → 409. `PATCH`: rename via `Team.Rename`, duplicate → 409.
- `DELETE /api/teams/{id}` → 409 if the team has players, score rows **or buzz records** (FK `Restrict` would throw otherwise).
- `PATCH /api/players/{id}/team`: the target team must be in the same event, and the player must have role `Player` (else 400). `POST /api/players/{id}/promote`: `Role = Admin`, `TeamId = null`.
- Name edits go through the entity methods. Uniqueness → 409, including the 23505 catch.
- Add `Realtime/IGameNotifier` (`Task TeamsChangedAsync()`, `Task ScoresChangedAsync()`) with a `NullGameNotifier` registered for now. Call it after every successful write in this step and the next. B6 swaps in the SignalR implementation.
- **Check:** `.http` requests show that non-admins never see other players' real names, that delete guards return 409, and that non-admins get 403 on admin routes.

---

## B5 — Scores — DONE

Kept for reference; **do not redo.** What exists now, including where it differs from the original brief:

- **Api:** `Features/Scores/ScoreEndpoints.cs` (route group, records, handlers; same nested admin-group shape as B4) and one line in `Program.cs`. All five routes of §8.5 exist: `GET /api/scores/teams` (any signed-in user), `GET /api/scores/players`, `GET`/`POST /api/scores/adjustments` and `POST /api/scores/adjustments/{id}/reverse` (admin). Every successful write calls `ScoresChangedAsync()` only (never `TeamsChanged`); rejected writes notify nobody.
- **Wire format:** the request is `{ target: "team"|"player", targetId, amount, multiplier = 1, direction: "add"|"remove", reason? }` and every field is nullable in the C# record, so a missing `direction` is a 400 and not a silent "add" (a non-nullable enum would default to its first member). All invalid fields are reported in one response. An adjustment row is `{ id, target, targetId, targetName, amount, reason, reversesAdjustmentId, isReversed, createdAt, createdByDisplayName }`; players are named by **display name** there (no real names in the history). `POST` adjustments and `POST` reverse both return **201** with that row (`isReversed` is false on the new row).
- **Decisions not in the brief:**
  - **Totals must stay inside `int`.** Totals are summed as `long` in SQL, but `Ranking.Rank` and the responses use `int`, and a ledger row can't be edited, so one overflowing total would break every leaderboard for good. A create that would take the target's total outside the `int` range is a **400** on `amount`; a reverse that would do so (possible when other rows on the target cancel the original) is a **409**. B7 must also sum as `long` (`Sum(a => (long)a.Amount)`; the plain `Sum` on `int` overflows).
  - A reason is trimmed, a blank one is stored as null, and more than 200 characters is a 400 (the column is `varchar(200)`).
  - Reversing a row that is itself a reversal is a 400 (as briefed); the reversal row has no reason of its own, `reversesAdjustmentId` says what it is.
  - A promoted player's old rows can still be reversed (the reverse doesn't check the role), but they no longer appear in `GET /api/scores/players`, and new adjustments can't target them.
  - `take` that isn't a number is a 400 (the binder rejects it); numbers outside 1–100 are clamped.
- **Order (verified by tests):** teams by total descending then `SortOrder`, `Id`; players by total descending, display name (ignoring case), `Id`; history `CreatedAt` descending, `Id` descending. The team and player totals are looked up from a dictionary and never enumerated into a response.
- **Api tests:** 58 new (257 Api tests total). `ScoreEndpointsTests` is a partial class split by endpoint (`.cs` reads and create, `.Create.cs`, `.History.cs`, `.Reverse.cs`), plus two notification tests in `WriteNotificationTests`. Ranking and ordering run over 2, 6, 13 and 30 teams or players (`Counts`), with ties, negatives and teams with no rows, and look only at the ids each test created. Ranks are global (the shared database holds other tests' teams), so they are checked against the rule applied to the whole response, and the explicit tie test uses totals around 1.5 billion so no other test's team lands between them. Mutation-checked: disabling the 23505 catch in reverse makes `Concurrent_reverses_of_one_adjustment_produce_exactly_one_reversal` fail. Also run with `Event:Teams` set to 3 and then 8 teams: all green.
- **Not run live:** the new `.http` requests (B5 section at the end of the file) were not run against the dev database (B9 walks them through on a UAT database); the integration tests cover the same cases against a throwaway PostgreSQL. Nothing in `Core` changed.
- **Deviation, branch name:** `backend-b5` (already created by the developer), not `backend-b5-scores`.

Original brief:

- `Features/Scores/ScoreEndpoints.cs` (§8.5). Use `ScoreMath.SignedAmount` for the amount and `Ranking.Rank` for team ranks.
- Adjustment target: a team in the event, or a player in the event with role `Player` (else 400). Set `CreatedByPlayerId` = the current admin. Return 201.
- `GET /api/scores/teams`: every team, including zero totals (left join / group in memory; a handful of rows). `GET /api/scores/players`: every `Player`-role player, including zeros, excluding admins.
- `GET /api/scores/adjustments?take=`: clamp to 1–100, default 20. Include the target name, the created-by display name, `reversesAdjustmentId`, and an `isReversed` flag.
- Reverse: 404 if missing; 400 if the row is itself a reversal; 409 if already reversed (pre-check + 23505 catch). The new row has `Amount = -original` and the same target.
- Every write → `ScoresChangedAsync()`.
- **Order (shared rule):** `GET /api/scores/teams`: total descending, then `SortOrder`, `Id` (feed `Ranking.Rank` teams already sorted by `SortOrder`, `Id`). `GET /api/scores/players`: total descending, then display name (ignoring case), `Id`. `GET /api/scores/adjustments`: newest first by `CreatedAt` **descending, then `Id` descending**: two rows can share a timestamp (an add and its undo in quick succession), and `Id` is what keeps `take` stable.
- **Tests:** follow the shared rule on not hard-coding the 2026 event. Create the teams and players each test needs, vary how many there are (ranking with 2, several and many teams; ties; a team with no score rows) and filter results by the ids you created, since the shared database holds other tests' teams.
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
  - **Take and enqueue under one guard** (from B1): `BuzzRound` hands each record out exactly once, but "take" and "write to the channel" are two steps. If thread A takes a locked record and thread B then runs Reset, takes the ended record and writes it first, the ended record reaches the worker before the round exists. Do "`TakeLockedRecord()` → `TakeEndedRecord()` → write both to the channel" inside one lock/semaphore (e.g. the broadcast semaphore), locked before ended, and loop each `Take…` until null.
  - Trigger on `RoundResult.Changed`, not `Success` (a late buzz fails but locks the round).
  - Log DB errors and continue; never throw them into the game.
- **`Realtime/RoundClock`** (`BackgroundService`): `PeriodicTimer(100 ms)` → `RoundService.TickAsync()`. That calls `Tick()`; if it returns true, enqueue the locked record and broadcast. Wrap each iteration in try/catch + log so the clock never dies.
- **`Realtime/HubGameNotifier : IGameNotifier`** sends `TeamsChanged` / `ScoresChanged` to All and replaces `NullGameNotifier`.
- `AddSignalR().AddJsonProtocol(o => ...)` gets the same camelCase enum converter as HTTP.
- **Tests:** follow the shared rule on not hard-coding the 2026 event. Round and roster tests build their own teams and players, and vary the team count (2, several, many) wherever "all teams have buzzed" or the queue size matters.
- **Determinism sweep (Opus: please do this as part of the step).** B6 is where the concurrency picture is complete, so after the hub, service, clock and persistence exist, review **all** code from B1 to B6 against the shared rule "Every list has a deterministic order". A review after B4 found Core clean and the Api lists fixed (see B4), so the sweep is for what is new and for what the new concurrency could expose. Check at least:
  - The roster query in `BeginAsync`: `OrderBy(TeamId).ThenBy(PlayerId)` (`BuzzRound` only looks the roster up, but a stable roster keeps rounds reproducible and tests exact).
  - `RoundPersistenceWorker`: insert the `BuzzRecord`s in `Sequence` order so their ids rise with the sequence, and read them back with `Sequence` as the sort. Outcomes are matched to teams by lookup, never by position in a collection.
  - Any collection copied into a snapshot or a persistence record: it must come from an ordered source (`_queue`, the buzz list), never from a `Dictionary` / `HashSet` / `GroupBy`.
  - Places where two requests can race and change a list's order: concurrent team creation (`SortOrder` ties, already handled with `Id`), ledger rows with equal `CreatedAt` (B5), snapshots sent from several threads (`Version` is the backstop).
  - Anything else in B1–B5 that has been added since this was written. Fix what you find with a tiebreaker and an exact-order test, and record the result here in the B6 DONE note.
- **Check (per the shared rule on the dev database, run it against the Api test factory and its Testcontainers PostgreSQL, e.g. as integration tests with the SignalR client over the test server; the live console walkthrough against a UAT database is B9):** write a throwaway console client in the session scratchpad, **not committed**. It uses `Microsoft.AspNetCore.SignalR.Client` + `HttpClient` with a `CookieContainer` for sign-in, and passes the cookies to the hub connection. Run 2 players on different teams + 1 admin through: Begin → one buzz → auto-lock after ~2 s with no further input → NextTeam → Reset. Then confirm that the admin receives individual buzzes and players don't, and that `Round` / `BuzzRecord` rows show LockedAt, EndedAt and outcomes.

---

## B7 — Archive

- `Core/Archive/`: the `ArchiveDocument` v1 records (PlanMVP §8.6) + a pure `ArchiveBuilder.Build(...)` that takes plain inputs (event info, teams with members and totals, players with totals, stats, `generatedAt`) and uses `Ranking`. Admins are excluded from players and members. Add Core tests for ranks, ties and the admin exclusion.
- `Features/Archive/ArchiveEndpoints.cs`:
  - `POST /api/archive/finalize` (admin): `roundsPlayed` = rounds with `LockedAt != null`; `totalBuzzes` = BuzzRecord count. Serialize with `JsonSerializerDefaults.Web`, upsert `EventArchive` (unique per event), set `Event.FinalizedAt`. Can be re-run.
  - `GET /api/archive/{eventId}/export` (admin): `Results.File(bytes, "application/json", $"buzzer-archive-{year}.json")`; 404 if not finalized.
- **From B5:** sum the ledger as `long` (`Sum(a => (long)a.Amount)`) and read it as `int`: the score endpoints keep every total inside the `int` range, but the plain `Sum` on `int` would still overflow. The player list excludes admins, as in `GET /api/scores/players`. `Ranking.Rank` needs input already in the default order (B5's `GetTeamScoresAsync` is a working example).
- **Tests:** follow the shared rule on not hard-coding the 2026 event: `ArchiveBuilder` tests use several team counts (including one team and a team with no members) and tied totals; the endpoint tests build their own teams and compare with the database.
- **Order (shared rule):** the document must be the same for the same data, so the endpoint passes `ArchiveBuilder` **pre-sorted** input and the builder sorts nothing implicitly. Teams: rank, then `SortOrder`, `Id`. Members: display name (ignoring case), `Id`. Players: rank, then display name (ignoring case), `Id`. Test that building twice from the same input, and from the same input shuffled, gives identical JSON apart from `generatedAt`.
- **Check:** finalize → export → the file has `schemaVersion: 1`, correct totals and ranks. **Don't commit the file** (`.gitignore` already covers `buzzer-archive-*.json`).

---

## B8 — Hosting prep

- `UseDefaultFiles()` + `UseStaticFiles()` before the endpoints. `MapFallbackToFile("index.html")` goes **after** the API and hub routes.
- Unknown `/api/**` and `/hubs/**` paths must return a **404 ProblemDetails**, not `index.html`. Map an explicit catch-all for those prefixes ahead of the SPA fallback.
- `/healthz`: `AddHealthChecks().AddDbContextCheck<AppDbContext>()` (package `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`), anonymous.
- Add `backend/src/BuzzerApp.Api/wwwroot/` to `.gitignore` (built frontend output).
- **From B3:** the fallback authorization policy applies to every endpoint, so `/healthz` and any SPA fallback (`MapFallbackToFile`) must be marked `AllowAnonymous()` or they return 401. Static files (`UseStaticFiles`) are not affected.
- Note for R2 (no change now): on Azure App Service, the auth cookie is encrypted with Data Protection keys: if the keys aren't persisted (shared storage) or the app scales out, every restart/instance signs everyone out. Persist them for the event weekend. Also set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so the per-IP registration limit sees real client IPs, not the proxy.
- **Check:** `cd frontend && npm run build`, copy `dist/*` into `Api/wwwroot`, then `dotnet run`. `/` serves the app, `/some/client/route` serves the app, `/api/nope` returns a 404 ProblemDetails, and `/healthz` reports Healthy.

---

## B9 — Whole-backend review + UAT walkthrough

Run this **after B8**, in a fresh session on **Opus or Fable**, before the frontend depends on the API. Branch `backend-b9-review` off the latest `origin/main`. Nothing here is built yet. Its two jobs are to find what the per-step sessions missed and to prove the whole thing works once, live, end to end.

### 1. Review all of B1–B8 with fresh eyes

Each step was written and checked in isolation, mostly by Sonnet. Read the **whole** backend (`Core`, `Infrastructure`, `Api`, both test projects) against `docs/PlanMVP.md` (§3 decisions, §7 domain, §8 contract) and CLAUDE.md "Must never happen". Report findings first, grouped by severity, then fix what is clearly a bug in small commits, each with a test that failed before the fix. Ask before changing a PlanMVP decision. Check at least:

- **Security:** every endpoint's authorization (anonymous / signed in / admin), cookie settings, no client-sent player/team ids or timestamps trusted for buzzing, no real names in non-admin responses (REST and both SignalR snapshots), no admin-only data in the public snapshot, rate limits, ProblemDetails that leak nothing.
- **Concurrency and timing (B6):** `RoundService` locking, the persistence queue's take-and-enqueue guard, the broadcast semaphore and `Version`, the clock never dying, no `DbContext` in a singleton, `FakeTimeProvider` instead of `Thread.Sleep` in tests.
- **Data integrity:** unique indexes and their 23505 catches, FK `Restrict` behaviour and the delete guards, the score ledger invariants (exactly one target, a row reversed at most once, totals inside `int`), the seeder never overwriting admin edits, the archive document's schema and rank rules.
- **Deterministic order:** the shared rule, once more over every list (B6's sweep covered B1–B6; this covers B7–B8 and the final code).
- **Tests:** anything that hard-codes the 2026 event, a test that can pass for the wrong reason, missing 401/403 cases, missing mutation checks on the race tests. Re-run the Api suite with `Event:Teams` at 3 and then 8 teams.
- **Build hygiene:** zero warnings, package versions, `Directory.Packages.props`, CI still matches the repo (job names `backend` / `frontend`).

### 2. UAT database and end-to-end walkthrough

The developer has **no dev data worth keeping**, so this step may create and destroy databases freely, but it must still not touch the developer's normal `docker compose` database or User Secrets.

- Start a **separate** PostgreSQL container for UAT (own container name, own volume, a free host port such as 5435; remove both when finished). Run the Api against it with environment variables or a git-ignored `appsettings.Uat.json`, never by editing committed config or User Secrets. Nothing from UAT is committed (no secrets, no exports).
- **Seed realistic data** with a throwaway script kept in the session scratchpad (or a committed `dotnet`-only tool if the developer wants it): an event, several teams (not only 2026's six), 30–40 players spread across them, two admins, and a few ledger rows. Registration goes through the API so PIN hashing and the cookie flow are real.
- **Walk the whole event through the real HTTP and SignalR surface** (a scratchpad console client with `HttpClient` + `CookieContainer` + `Microsoft.AspNetCore.SignalR.Client`, plus the `.http` files): register / sign in / sign out and the throttle, the Teams screen data with real names hidden from players, edit own names, admin moves / renames / promotes, score adjustments and undo (and the double-undo 409), then several rounds: Begin → near-simultaneous buzzes from many players → auto-lock after the grace window → Next team through to Exhausted → Reset, and a round that locks with every team buzzed. Confirm that admins receive individual buzzes and players don't, that a second admin sees the same state, that `ScoresChanged` / `TeamsChanged` reach clients after REST writes, and that `Round` / `BuzzRecord` rows hold the right `LockedAt`, `EndedAt`, sequence and outcomes.
- Restart the API mid-round and between rounds (in-memory round lost, everything else intact). Finalize → export the archive and check `schemaVersion: 1`, totals and ranks against the database. Run the walkthrough a second time with a different team count.
- Record every `.http` request that was **not** executed in B4/B5/B7 as now executed, and fix any that are wrong.

### 3. Deliverable

A short written report (in the PR description or the DONE note here): what was reviewed, every finding with its severity and what was done about it, what the walkthrough covered, and anything deliberately left. Mark the step done as in the shared rules (`Mark B9 done in BackendSteps`).
