# CLAUDE.md — BuzzerApp

Live buzzer + scoreboard web app for a yearly family games night. .NET 10 backend, React 19 + TS + Vite + Fluent UI v9 frontend.

**The plan is `docs/PlanMVP.md`. Read it before any task.** Backend steps B0–B8: also read their brief in `docs/BackendSteps.md` (it wins on implementation detail). Decisions §3, open questions §4, domain model §7, API contract §8, theming §9, steps §10. 2026 team design: `images/team-logos/` (six `<team>-face.png` icons + `group-participating-teams.png` reference).

## Working rules
- Only work on the step the developer names (e.g. "B1"). Propose the file list and any decisions first; wait for "go".
- Ask about unresolved open questions one at a time before coding the step that needs them.
- After each step, summarise briefly what was built and why (the developer wants to understand it).
- Comments explain *why*, not *what*.
- Feature branch per step, small commits, never commit to `main`, never commit secrets or archive exports.
- No Claude attribution in commits or PRs: no `Co-Authored-By` trailer, no "Generated with Claude Code" line (also turned off in `.claude/settings.json`).

## Layout
- `BuzzerApp.slnx` (repo root)
- `backend/src/BuzzerApp.Core` — `Domain/` (POCO entities, no EF attributes), `Rounds/`, `Scoring/`, `Archive/`. **No** framework / EF Core / ASP.NET / SignalR references.
- `backend/src/BuzzerApp.Infrastructure` — EF Core: `Persistence/` (DbContext, Configurations, Migrations), `Seeding/`. References Core only.
- `backend/src/BuzzerApp.Api` — Minimal APIs (`Features/<Feature>/`), SignalR (`Realtime/`), auth etc. (`Common/`).
- `backend/tests/BuzzerApp.Core.Tests` — xUnit.
- `frontend/src/` — `api/`, `realtime/`, `theme/` (packs), `features/<feature>/`, `components/`.

## Environment
- Developer: Windows; Visual Studio (backend), VS Code (frontend). You run in a terminal (PowerShell or Git Bash) or the VS Code extension. CI runs on Linux.
- Keep committed scripts cross-platform (`dotnet` / `npm` scripts only). Mind path case sensitivity.
- Never commit `.env`, User Secrets or archive exports.

## Commands
- Backend (repo root): `dotnet build BuzzerApp.slnx`, `dotnet test BuzzerApp.slnx`
- Local DB: `docker compose up -d`
- Migrations: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project backend/src/BuzzerApp.Infrastructure --startup-project backend/src/BuzzerApp.Api --output-dir Persistence/Migrations`
- Frontend (`frontend/`): `npm run dev`, `npm run lint`, `npm run build`, `npx vitest run`

A step is done only when these pass.

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
