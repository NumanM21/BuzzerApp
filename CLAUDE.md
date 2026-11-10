# CLAUDE.md — BuzzerApp

Live buzzer + scoreboard web app for a yearly family games night. .NET 10 backend, React 19 + TS + Vite + Fluent UI v9 + MobX frontend (MVVM). Reused every year with different teams, players and theme.

**The plan is `docs/PlanMVP.md`** (decisions §3, open questions §4, domain model §7, API contract §8, theming §9, steps §10). The backend (steps B0–B9) is done. **Milestone F (frontend, steps F0–F9) is in progress.**

**What to read for a task**
- **A frontend step (F0–F9):** `docs/FrontendSteps.md`: its "Shared rules", the step's brief and Appendix A (the API as TypeScript types). From `docs/PlanMVP.md` only §0, §1, §9 and what the brief names. **Don't read `docs/BackendSteps.md`**: it is long and the frontend doesn't need it.
- **Backend work:** `docs/PlanMVP.md`, and `docs/BackendSteps.md`, which records what was built and every deviation, wins on backend implementation detail, and whose **B9 section describes the current design**.
- `docs/DecisionLog.md` is the dated history of plan changes for the developer. Append to it when a decision changes; don't read it for a normal step.
- 2026 team design: `images/team-logos/` (six `<team>-face.png` icons + `group-participating-teams.png` reference).

## Working rules
- Only work on the step the developer names (e.g. "F3"). "Do F<n>" counts as "go"; stop and ask only when the brief is unclear, looks wrong, or needs a decision that isn't yours.
- Ask about unresolved open questions one at a time before coding the step that needs them.
- After each step, summarise briefly what was built and why (the developer wants to understand it), and mark the step done in its steps file.
- Comments explain *why*, not *what*.
- Feature branch per step (`frontend-f<n>`; the developer creates it), small commits, **no push and no PR unless asked**, never commit to `main`, never commit secrets or archive exports.
- No Claude attribution in commits or PRs: no `Co-Authored-By` trailer, no "Generated with Claude Code" line (also turned off in `.claude/settings.json`).

## Layout
- `BuzzerApp.slnx` (repo root)
- `backend/src/BuzzerApp.Core` — `Domain/` (POCO entities, no EF attributes, `DefaultOrder`), `Rounds/`, `Scoring/`, `Archive/`, `Security/`. **No** framework / EF Core / ASP.NET / SignalR references.
- `backend/src/BuzzerApp.Infrastructure` — EF Core: `Persistence/` (DbContext, Configurations, Migrations, `DbErrors`), `Seeding/`, `Security/`. References Core only.
- `backend/src/BuzzerApp.Api` — `Features/<Feature>/` with three kinds of file: `*Contracts.cs` (request/response records), `*Service.cs` (data and decisions, returns `Result<T>`, no HTTP), `*Endpoints.cs` (routes, authorization, result to response, **no logic**); listed in `Features/FeatureSetup.cs`. SignalR and the live round in `Realtime/`. Auth, `Result`/`Error`, hosting in `Common/`.
- `backend/tests/BuzzerApp.Core.Tests` — xUnit (pure logic, no I/O).
- `backend/tests/BuzzerApp.Api.Tests` — unit tests for Api pieces (no host), plus integration tests with `WebApplicationFactory` against a real PostgreSQL started by Testcontainers (**needs Docker running**).
- **Where a test goes:** a rule that needs no database is a pure function with a unit test. An integration test is for what only PostgreSQL or the HTTP pipeline can show (unique-index races, authorization, the cookie, the wire format), with one or two shapes, not a theory over every size.
- `frontend/src/` — MVVM, dependencies one way: views → view models → stores → services. `app/` (composition root, routes, guards), `api/` + `realtime/` (services: plain classes behind interfaces), `mvvm/` (`Loadable`, `Command`), `stores/` (MobX, app lifetime), `domain/` (pure rules and types), `features/<feature>/` (`XxxPage.tsx` view + `XxxViewModel.ts` MobX class + test), `components/` (presentational), `theme/` (pack contract, `packs/<key>/`), `test/` (factories, fakes). The layer table is in `docs/FrontendSteps.md` and ESLint enforces it.
- **Where a frontend test goes:** logic is in a domain function, view model or store and gets a unit test with fakes (no React, no network). A few integration tests per feature (React Testing Library + MSW) cover the wire format and one or two page flows.

## Environment
- Developer: Windows; Visual Studio (backend), VS Code (frontend). You run in a terminal (PowerShell or Git Bash) or the VS Code extension. CI runs on Linux.
- Keep committed scripts cross-platform (`dotnet` / `npm` scripts only). Mind path case sensitivity.
- Never commit `.env`, User Secrets or archive exports.

## Commands
- Backend (repo root): `dotnet build BuzzerApp.slnx`, then the **whole** suite: `dotnet test BuzzerApp.slnx --logger "console;verbosity=normal" --blame-hang-timeout 2m --blame-hang-dump-type none`. It takes about 30 seconds. If it seems to take minutes, a test has hung: the hang guard names it. Fix that; never skip or filter the run to get to "done".
- Local DB: `docker compose up -d`
- Migrations: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project backend/src/BuzzerApp.Infrastructure --startup-project backend/src/BuzzerApp.Api --output-dir Persistence/Migrations`
- Frontend (`frontend/`): `npm run dev`, then all three of `npm run lint`, `npm run build`, `npm test` (the test script is added in F0). The frontend tests need neither Docker nor the backend.

A step is done only when these pass, including tests for any endpoints or logic it adds. Never disable a lint rule or skip a test to get there.

## Must never happen
- Trusting client-sent player/team IDs or timestamps for buzzing (use cookie claims + server arrival order).
- Injecting `DbContext` into a singleton (use `IServiceScopeFactory`).
- `Thread.Sleep` in tests (use `FakeTimeProvider`).
- Hard-coded colours, fonts, radii or shadows outside `frontend/src/theme/packs/` (components use Fluent `tokens` or `appTokens`). A theme pack that contains components or logic: packs are data.
- Colour as the only signal of state (always add text).
- Real names in non-admin responses (except the caller's own).
- Seeding that overwrites admin edits on restart.
- A service worker (the app is a plain web site, PlanMVP D1). If one is ever added (O9), it never caches `/api` or `/hubs`.
- Logic, `fetch` or rules in a view (`.tsx`); React, the DOM, Fluent or the theme in a view model or store; a view calling an API class or a store's methods directly instead of its view model.
- `enum`, constructor parameter properties (`constructor(private x: X)`) or a base view-model class in the frontend: the TypeScript config and MobX reject them.
- Frontend code or tests that hard-code the 2026 event (a team count, team names, colour or icon keys) outside `packs/arcade-2026/`. Use the factories in `frontend/src/test/` and several team counts.
- A frontend test that waits on a real timer (use fake timers or an injected clock).
- Keeping the round's snapshot `version` across a dropped connection: the server's counter restarts with the server, and the client would ignore every later snapshot.
- Admin-only data (individual buzzes, future question answers) in the public snapshot.
- Tests that hard-code the 2026 event (six teams, team names or colours, "the second seeded team"). Teams and players change every year: create the data a test needs or read it from the database, and use a `[Theory]` over several team/player counts where the count matters. Details: "Shared rules" in `docs/BackendSteps.md`.
- Logic in an `*Endpoints.cs` file, or a service that builds an HTTP response. Endpoints map; services decide and return `Result`.
- A catch-all or fallback **route** (`Map("/api/{**path}")`, `MapFallback…`). It takes part in route selection and steals real routes' 400 / 405 / 415. Unmatched requests are handled by the middleware in `HostingSetup`.
- Work that takes locks running inline in a timer callback (the B6 deadlock: a fake clock fires timers from inside `GetUtcNow()`, which `BuzzRound` calls while holding its lock). `RoundClock` hands each tick to `Task.Run` for this reason; keep it that way.
- A hand-written sort for teams or people (use `DefaultOrder`), or a second copy of a rule that already has a home (PIN format, name uniqueness, team-name lookup).
- A list with no deterministic order. Every list an endpoint, snapshot or archive returns has an explicit sort that ends in a unique tiebreaker (usually `Id`), unless the order is the data itself (the buzz queue, ledger order). Never rely on database row order or on enumerating a `Dictionary` / `HashSet`. Details: "Shared rules" in `docs/BackendSteps.md`.
