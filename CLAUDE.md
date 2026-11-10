# CLAUDE.md — BuzzerApp

Live buzzer + scoreboard web app for a yearly family games night. .NET 10 backend, React 19 + TS + Vite + Fluent UI v9 frontend.

**The plan is `docs/PlanMVP.md`. Read it before any task.** The backend (steps B0–B9) is done: `docs/BackendSteps.md` records what was built and every deviation, it wins on implementation detail, and **its B9 section describes the current design**. Next is Milestone F (frontend). Decisions §3, open questions §4, domain model §7, API contract §8, theming §9, steps §10. 2026 team design: `images/team-logos/` (six `<team>-face.png` icons + `group-participating-teams.png` reference).

## Working rules
- Only work on the step the developer names (e.g. "B1"). Propose the file list and any decisions first; wait for "go".
- Ask about unresolved open questions one at a time before coding the step that needs them.
- After each step, summarise briefly what was built and why (the developer wants to understand it).
- Comments explain *why*, not *what*.
- Feature branch per step, small commits, never commit to `main`, never commit secrets or archive exports.
- No Claude attribution in commits or PRs: no `Co-Authored-By` trailer, no "Generated with Claude Code" line (also turned off in `.claude/settings.json`).

## Layout
- `BuzzerApp.slnx` (repo root)
- `backend/src/BuzzerApp.Core` — `Domain/` (POCO entities, no EF attributes, `DefaultOrder`), `Rounds/`, `Scoring/`, `Archive/`, `Security/`. **No** framework / EF Core / ASP.NET / SignalR references.
- `backend/src/BuzzerApp.Infrastructure` — EF Core: `Persistence/` (DbContext, Configurations, Migrations, `DbErrors`), `Seeding/`, `Security/`. References Core only.
- `backend/src/BuzzerApp.Api` — `Features/<Feature>/` with three kinds of file: `*Contracts.cs` (request/response records), `*Service.cs` (data and decisions, returns `Result<T>`, no HTTP), `*Endpoints.cs` (routes, authorization, result to response, **no logic**); listed in `Features/FeatureSetup.cs`. SignalR and the live round in `Realtime/`. Auth, `Result`/`Error`, hosting in `Common/`.
- `backend/tests/BuzzerApp.Core.Tests` — xUnit (pure logic, no I/O).
- `backend/tests/BuzzerApp.Api.Tests` — unit tests for Api pieces (no host), plus integration tests with `WebApplicationFactory` against a real PostgreSQL started by Testcontainers (**needs Docker running**).
- **Where a test goes:** a rule that needs no database is a pure function with a unit test. An integration test is for what only PostgreSQL or the HTTP pipeline can show (unique-index races, authorization, the cookie, the wire format), with one or two shapes, not a theory over every size.
- `frontend/src/` — `api/`, `realtime/`, `theme/` (packs), `features/<feature>/`, `components/`.

## Environment
- Developer: Windows; Visual Studio (backend), VS Code (frontend). You run in a terminal (PowerShell or Git Bash) or the VS Code extension. CI runs on Linux.
- Keep committed scripts cross-platform (`dotnet` / `npm` scripts only). Mind path case sensitivity.
- Never commit `.env`, User Secrets or archive exports.

## Commands
- Backend (repo root): `dotnet build BuzzerApp.slnx`, then the **whole** suite: `dotnet test BuzzerApp.slnx --logger "console;verbosity=normal" --blame-hang-timeout 2m --blame-hang-dump-type none`. It takes about 30 seconds. If it seems to take minutes, a test has hung: the hang guard names it. Fix that; never skip or filter the run to get to "done".
- Local DB: `docker compose up -d`
- Migrations: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project backend/src/BuzzerApp.Infrastructure --startup-project backend/src/BuzzerApp.Api --output-dir Persistence/Migrations`
- Frontend (`frontend/`): `npm run dev`, `npm run lint`, `npm run build`, `npx vitest run`

A step is done only when these pass, including tests for any endpoints it adds.

## Must never happen
- Trusting client-sent player/team IDs or timestamps for buzzing (use cookie claims + server arrival order).
- Injecting `DbContext` into a singleton (use `IServiceScopeFactory`).
- `Thread.Sleep` in tests (use `FakeTimeProvider`).
- Hard-coded colours, fonts, radii or shadows outside `frontend/src/theme/packs/`.
- Colour as the only signal of state (always add text).
- Real names in non-admin responses (except the caller's own).
- Seeding that overwrites admin edits on restart.
- Caching `/api` or `/hubs` in a service worker.
- Admin-only data (individual buzzes, future question answers) in the public snapshot.
- Tests that hard-code the 2026 event (six teams, team names or colours, "the second seeded team"). Teams and players change every year: create the data a test needs or read it from the database, and use a `[Theory]` over several team/player counts where the count matters. Details: "Shared rules" in `docs/BackendSteps.md`.
- Logic in an `*Endpoints.cs` file, or a service that builds an HTTP response. Endpoints map; services decide and return `Result`.
- A catch-all or fallback **route** (`Map("/api/{**path}")`, `MapFallback…`). It takes part in route selection and steals real routes' 400 / 405 / 415. Unmatched requests are handled by the middleware in `HostingSetup`.
- Work that takes locks running inline in a timer callback (the B6 deadlock: a fake clock fires timers from inside `GetUtcNow()`, which `BuzzRound` calls while holding its lock). `RoundClock` hands each tick to `Task.Run` for this reason; keep it that way.
- A hand-written sort for teams or people (use `DefaultOrder`), or a second copy of a rule that already has a home (PIN format, name uniqueness, team-name lookup).
- A list with no deterministic order. Every list an endpoint, snapshot or archive returns has an explicit sort that ends in a unique tiebreaker (usually `Id`), unless the order is the data itself (the buzz queue, ledger order). Never rely on database row order or on enumerating a `Dictionary` / `HashSet`. Details: "Shared rules" in `docs/BackendSteps.md`.
