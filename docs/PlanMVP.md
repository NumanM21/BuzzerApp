# Buzzer App — MVP Plan (AI-executable)

> **Audience:** AI coding assistants (Claude Code) and the developer.
> **Purpose:** build a working, demo-able MVP fast, on foundations that can grow over several yearly events.
> `../OriginalFullPlan.md` (outside the repo) is the older, learning-focused plan. Keep it for reference; **this file wins where they disagree**.
> Last updated: 9 Nov 2026 (v2.3: Q4 resolved (dark); backend step briefs added in `docs/BackendSteps.md`; round snapshots get `Version`, `TakeEndedRecord()` added. v2.2: entities in Core/Domain confirmed; lock file and `.gitignore` fixed; individual team icons added; team colours confirmed from the icon files). Status: Phase 0 done — start at B0.

---

## 0. Rules for the AI (read first)

1. **Scope.** Work only on the step the developer names (e.g. "B1"). Don't start optional features (§11) unless asked.
2. **Plan, then build.** For each step: list the files you'll create or change and any decisions you're making, wait for "go", then implement.
3. **Explain briefly.** After each step, a short summary: what was built, why it's structured that way, anything non-obvious (gotchas, trade-offs). The developer wants to *understand* the code. A few paragraphs, not an essay.
4. **Comments explain why, not what.** No comments on obvious lines.
5. **Respect §3 Decisions.** If you think one is wrong, say so and propose an alternative. Never silently deviate.
6. **Open questions (§4).** If a step depends on an unresolved one, ask the developer **one question at a time** before writing code.
7. **Verify before saying done.** Backend: `dotnet build BuzzerApp.slnx` and `dotnet test BuzzerApp.slnx` pass. Frontend (`frontend/`): `npm run lint`, `npm run build` and (once tests exist) `npx vitest run` pass.
8. **Git.** Feature branch per step (`feature/<step-id>-<short-name>`). Small commits, one logical change each. Never commit to `main`. Never commit secrets or real people's data (archive exports contain real names).
9. **Don't over-engineer.** ~40 users, one active event at a time, single server. But keep the boundaries in §5 so features can be added later without rewrites.
10. **Theme rule.** No hard-coded colours, fonts, radii or shadows outside `frontend/src/theme/packs/`. Components use Fluent `tokens` or the app's `--app-*` CSS variables (§9).
11. **Package versions.** Don't guess. Use the latest stable version compatible with .NET 10 / React 19 and confirm it restores/installs.
12. **Dev environment.** Windows. Visual Studio (backend), VS Code (frontend). Claude Code runs in a terminal (PowerShell or Git Bash) or the VS Code extension. Keep anything committed cross-platform: use `dotnet` / `npm` scripts, not bash-only or PowerShell-only scripts. CI runs on Linux, so mind path case sensitivity.

---

## 1. Product summary

A **browser-based live buzzer and scoreboard** for a yearly family games night. Players use their phones (no app store). Hosts (admins) run the game from a phone or laptop. Each year has its own **theme** (2026: retro arcade) and the results are **archived** per year.

**MVP features**
1. **Buzz.** Host presses **Begin**. Players tap the buzzer. The server records arrival order and **locks** shortly after the first buzz. Players see the **team** order. The host sees team order **and** every individual buzz. Wrong answer → host presses **Next team**; the turn passes cleanly. **Reset** clears the round.
2. **Scoreboard.** Everyone sees the team leaderboard. Admins also see individual scores, sortable by team or score, and add/remove points for teams and players. **Team and player scores are separate** (player points do not count towards the team).
3. **Teams screen** (shared by players and admins): six team cards with the team colour as the border, the team icon top-left, the team name and its members. Players can edit their own names; admins can rename teams and move/edit players.
4. **Event archive (minimal):** admin can **finalize** the event into a frozen snapshot and **export** it as JSON, so this year's results survive after event-day hosting is deleted. A browsable "past years" screen is optional (§11, O6).

### Roles
| Role | Can |
|---|---|
| **Player** | Register/sign in, buzz, view teams, edit **own** display and real name, view team leaderboard |
| **Admin** | Everything except buzzing. Run rounds, rename/create/delete teams, move players, edit any player's names, promote admins, adjust scores, see real names and individual scores, finalize/export the event |

A read-only **Display** (projector) screen is optional (§11, O0). Until then the shared Teams screen and leaderboard can be put on the projector.

---

## 2. Current repository state (8 Nov 2026)

```
BuzzerApp/                              ← repo root (GitHub, public)
├─ BuzzerApp.slnx                       ← solution at the ROOT
├─ docker-compose.yaml                  ← local PostgreSQL 16 (needs fixes, step B2)
├─ images/team-logos/                   ← 2026 design source files
│  ├─ <team>-face.png ×6                ← 1512×1200 pixel-art faces on a solid team-colour background (no transparency)
│  ├─ all-team-faces.png                ← all six faces together
│  └─ group-participating-teams.png     ← design reference: six team cards with names
├─ docs/BackendSteps.md                 ← implementation briefs for B0–B8
├─ backend/
│  ├─ src/BuzzerApp.Api/                ← Minimal API template; still has weather sample; refs Core + Infrastructure
│  ├─ src/BuzzerApp.Core/               ← class library; only Class1.cs; no package refs (keep it that way)
│  ├─ src/BuzzerApp.Infrastructure/     ← refs Core; Npgsql.EntityFrameworkCore.PostgreSQL + EF Core Tools; only Class1.cs
│  └─ tests/BuzzerApp.Core.Tests/       ← xUnit v2 template; only UnitTest1.cs
└─ frontend/                            ← Vite 8 + React 19 + TS 6 template
```

**Known issues to fix (in the step listed)**
| Issue | Fix | Step |
|---|---|---|
| `Class1.cs` ×2, `UnitTest1.cs`, weather sample | Delete | B0 |
| No CI | Add GitHub Actions workflow (§10) | B0 |
| `docker-compose.yaml`: obsolete `version:` key; password committed to a public repo; port bound on all network interfaces | See B2 | B2 |
| `dotnet ef` needs `Microsoft.EntityFrameworkCore.Design` in the **startup** project (Api). The Tools package in Infrastructure is `PrivateAssets=all`, so it doesn't flow to Api | Add `Microsoft.EntityFrameworkCore.Design` to Api (`PrivateAssets=all`) | B2 |

GitHub rules (set by developer): PRs required into `main`, 1 approval, rebase merge only.

---

## 3. Decisions

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | Platform | Web app in the phone browser (PWA later). No app stores for MVP | Free, one codebase, iOS + Android |
| D2 | Backend projects | **Core** (domain + game rules, no framework refs) ← **Infrastructure** (EF Core, DbContext, migrations, seeding) ← **Api** (endpoints, SignalR, auth, hosting). Api references both; Infrastructure references Core; Core references nothing | Clean separation; persistence can change without touching rules or endpoints |
| D3 | Entity location | **POCO entities in `Core/Domain`** (no EF attributes). EF mapping (Fluent API `IEntityTypeConfiguration<T>`) in Infrastructure | Future domain rules (shop stock, MVP weighting) need the entities without Core depending on Infrastructure |
| D4 | API style | **REST** for data; **SignalR** for the live round and "something changed" notifications | §6 |
| D5 | Live state | Server holds the round in memory and **broadcasts a full snapshot** after every change. Reconnecting clients just get the latest | Self-healing |
| D6 | Two audiences | **Public snapshot** to everyone; **admin snapshot** to the `admins` group only | Individual buzz order is admin-only; future question **answers** must never reach players |
| D7 | REST freshness | After a REST write, server sends `TeamsChanged` / `ScoresChanged` via SignalR; clients **refetch** | REST stays the source of truth |
| D8 | Who was first | **Server arrival order** only. Never trust client IDs or timestamps for buzzing | Clocks differ; IDs can be faked |
| D9 | Queue | **One queue entry per team**, credited to the first teammate who buzzed. Later teammate buzzes are still **recorded** (admin view, stats) | Teammates help the answerer |
| D10 | Locking | First buzz starts a **grace window** (default **2s**, config `Round:GraceWindow`). Locks when the window ends **or** every eligible team has buzzed | Order fixed before anyone speaks |
| D11 | Host controls | **Begin**, **Next team**, **Reset**. Correct answer = award points, then Reset | Minimal set covering every flow |
| D12 | Timer | Host screen shows **elapsed time** since the current team's turn began. No enforced limits, no player timer | Useful, nearly free |
| D13 | Roster timing | The roster (who can buzz, on which team) is captured at **Begin**. Late joiners and moved players take part from the **next** round | Keeps a running round consistent |
| D14 | Concurrency | Single server instance; round state guarded by one `lock`; persistent data in the DB | Simplest correct design |
| D15 | Events | Data is scoped to an **`Event`** (one per year). One **active** event. MVP seeds it from config | Yearly reuse without mixing data |
| D16 | Teams 2026 | **Six fixed teams**, seeded from config: Rage Quitters (red), Pay To Win (yellow), Cheat Codes (green), Smurfs (blue), AFK Allstars (purple), RNG Lovers (pink). Each has `ColorKey` + `IconKey` | Set by the event design (`images/team-logos/`) |
| D17 | Team editing | Admins: rename, create, delete (delete blocked with `409` if the team has players **or** score rows). Team colour/icon are **not editable in the MVP** (seeded) | Design is fixed for 2026; accidental deletes prevented |
| D18 | Sign-in | **Register:** join code + real name + display name + 4-digit PIN + team. **Sign in:** join code + **real name** + PIN. Real and display names unique per event, case-insensitive | Real names are stable and memorable; display names can change freely |
| D19 | Name visibility | **Display name** shown everywhere. **Real name** visible to admins only (and to the player themselves) | So hosts know who is who |
| D20 | Name editing | Players edit their own display/real name; admins edit anyone's. Changes apply to the round from the next Begin | §8 |
| D21 | Team membership | Player picks a team at registration, **cannot leave or switch**. Admins move players (⋮ → Move to… → dialog listing the **other** teams). Late joining is allowed any time | As specified |
| D22 | Auth | **Cookie auth**, same origin (Vite proxy in dev; API serves the built React app in production). Returns `401`/`403`, never redirects. Persistent cookie, 30-day sliding expiry | Works for REST + SignalR; phones stay signed in |
| D23 | Claims | Cookie holds `PlayerId`, `EventId`, `Role`. **Not** `TeamId` or names | Moves/renames would make them stale |
| D24 | Rate limiting | Sign-in limited **per real name** (e.g. 5 attempts / 5 min). Registration limited per IP but generously (e.g. 30/min) | Everyone at the venue shares **one public IP**; a strict per-IP limit would lock the whole family out |
| D25 | Scores | **Ledger**: every change is a `ScoreAdjustment` row with **exactly one** of `TeamId` / `PlayerId`. Team total = sum of team rows; player total = sum of player rows. **No roll-up** | Q answered: kept separate for now. Future "phases with fixed points" can add a nullable category column |
| D26 | Score entry | Amount (> 0) × multiplier (default 1), then **Add** or **Remove**. **Undo** adds a reversing row; ledger rows are never deleted | Audit trail |
| D27 | Database | **PostgreSQL** via EF Core (Npgsql). Local: Docker Compose. Connection string in **User Secrets** | Work DB; pgAdmin available |
| D28 | Stats-ready | When a round locks, persist `Round` + `BuzzRecord`s | MVP-player tracker (O1) needs data from every event; can't be reconstructed later |
| D29 | Archive | **Finalize** builds a frozen, versioned **JSON snapshot** (teams, members, colours/icons keys, theme key, team + player scores, ranks) stored in `EventArchive` (`jsonb`). **Export** downloads it. Live rows are also kept | Tiny (~tens of KB/year), portable, renders with the normal UI components, immune to future schema changes. See §8.6 |
| D30 | Frontend stack | React 19 + TS + Vite, **Fluent UI v9** (`@fluentui/react-components`, `@fluentui/react-icons`), `react-router`, **TanStack Query**, `@microsoft/signalr`, Vitest | Developer's work stack; Query handles loading/caching/refetch |
| D31 | Theming | **Theme packs**: all visual identity (Fluent theme, app tokens, fonts, team colours, team icons, effects) lives in `frontend/src/theme/packs/<key>/`. The active pack is chosen by the event's `ThemeKey`. Packs are never deleted (archives reference them) | Redesign each year by adding a pack, not editing components |
| D32 | Tests | Core: thorough xUnit (state machine, concurrency, time). Frontend: Vitest for pure logic (buzzer state, sorting). Api integration tests only if time allows. No end-to-end tests | Test where bugs would hurt most |
| D33 | CI | **GitHub Actions** on every PR: backend build + tests; frontend lint + build (+ Vitest). Required status check in the `main` ruleset | Approval alone doesn't prove it builds |

---

## 4. Open questions

| # | Question | Default if unanswered | Needed by |
|---|---|---|---|
| — | None open | | |

**Resolved 9 Nov 2026:** Q4 theme mode → **dark** for the MVP; support both light and dark later. Q1 entity location → Core/Domain (D3). Q2 icons → individual PNGs in `images/team-logos/` (§9.3). Q3 colours → read from the icon files' backgrounds (§9.3).
**Resolved 8 Nov 2026:** team/player score roll-up → separate (D25); real name purpose → admin identification + sign-in (D18, D19); UI library → Fluent UI v9 (D30); avatars → six fixed team icons (D16); late join → allowed (D21); delete team with players → blocked (D17).

---

## 5. Architecture

```
 Phones / laptop (React + TS + Vite + Fluent UI v9, theme pack per event)
   /join  /signin  /play  /teams  /scores          /admin  /admin/scores  /admin/event
        │ REST (JSON, cookie auth)                │ SignalR WebSocket (/hubs/game)
        │ session, event, teams, players,         │ client→server: Buzz, BeginRound, NextTeam, ResetRound
        │ scores, archive                         │ server→all:    RoundUpdated(public), TeamsChanged, ScoresChanged
        │                                         │ server→admins: AdminRoundUpdated(admin)
 ┌──────▼─────────────────────────────────────────▼──────────────────────┐
 │ BuzzerApp.Api                                                         │
 │  Features/{Session,Event,Teams,Players,Scores,Archive}/  endpoints    │
 │  Realtime/  GameHub · RoundService (singleton) · RoundClock (100ms)   │
 │  Common/    auth setup, ICurrentUser, ProblemDetails, rate limiting   │
 ├───────────────────────────────────────────────────────────────────────┤
 │ BuzzerApp.Infrastructure                                              │
 │  Persistence/  AppDbContext · Configurations/ · Migrations/           │
 │  Seeding/      EventSeeder (idempotent)                               │
 │  DependencyInjection.cs  → services.AddInfrastructure(connString)     │
 ├───────────────────────────────────────────────────────────────────────┤
 │ BuzzerApp.Core  (no framework references)                             │
 │  Domain/   Event, Team, Player, ScoreAdjustment, Round, BuzzRecord,   │
 │            EventArchive, enums                                        │
 │  Rounds/   BuzzRound, RoundPhase, snapshots, RoundResult              │
 │  Scoring/  ScoreMath                                                  │
 │  Archive/  ArchiveDocument records (schema v1)                        │
 └───────────────────────────────────────────────────────────────────────┘
                                │ EF Core (Npgsql)
                          PostgreSQL (Docker locally)
```

**Dependencies:** Api → Infrastructure → Core; Api → Core. Core → nothing outside the BCL.

**Endpoint convention:** vertical slices. `Features/Teams/TeamEndpoints.cs` holds the route group (`MapGroup("/api/teams")`), request/response DTO records and handlers. A new feature (Shop, Schedule, Questions) = a new folder.

**What lives where**
| Data | Where | Survives restart? |
|---|---|---|
| Events, teams, players, PIN hashes, score ledger, finished rounds + buzzes, archives | PostgreSQL | Yes |
| Current round (phase, queue, buzzes, grace window, current team) | Memory (`RoundService`) | No. Host presses Reset/Begin again. Acceptable |

**Why a clock?** Something must lock the round when the grace window ends even if nobody presses anything. Core exposes `Tick()`; `RoundClock` (`BackgroundService` + `PeriodicTimer`) calls it every ~100ms and broadcasts if changed. Core **also** checks the window inside `Buzz()`, so a late buzz is rejected even before the next tick.

---

## 6. Glossary (short)

| Term | Plain English |
|---|---|
| **REST API** | The app asks, the server answers. URLs are resources (`/api/teams`); the verb says what to do (`GET` read, `POST` create, `PATCH` change part, `DELETE` remove); status codes say how it went (`200`, `201`, `400` bad input, `401` not signed in, `403` not allowed, `404`, `409` conflict) |
| **SignalR** | A connection that stays open so the server can push to phones instantly. The server class is a **Hub**. Handles reconnection and **groups** (e.g. `admins`) |
| Snapshot | The complete state at one moment. Sending the whole thing means a phone that missed a message is fixed by the next |
| Ledger | Store every change as a row and compute totals, rather than overwriting a total |
| Theme pack | A folder holding one year's look: colours, fonts, icons, Fluent theme. Components never contain colours themselves |
| Fluent tokens | Named design values (`tokens.colorNeutralBackground1`) that Fluent components read from the active theme |
| Migration | A generated C# file describing a schema change; EF Core applies it to the DB |
| User Secrets | A per-machine file outside the repo for passwords/connection strings in development |

---

## 7. Domain model

### 7.1 Entities

```
Event                         Team                          Player
-----                         ----                          ------
Id (int)                      Id (int)                      Id (int)
Name                          EventId (FK)                  EventId (FK)
Year (int)                    Name                          RealName
JoinCode (unique)             NormalizedName                NormalizedRealName   ← sign-in identifier
ThemeKey ("arcade-2026")      ColorKey ("red")              DisplayName
IsActive                      IconKey ("rage-quitters")     NormalizedDisplayName
FinalizedAt?                  SortOrder                     PinHash
CreatedAt                     CreatedAt                     Role (Player | Admin)
                                                            TeamId? (FK; null for admins)
                                                            CreatedAt

ScoreAdjustment (ledger)        Round                 BuzzRecord                    EventArchive
------------------------        -----                 ----------                    ------------
Id (long)                       Id (Guid)             Id (long)                     Id (int)
EventId (FK)                    EventId (FK)          RoundId (FK)                  EventId (FK, unique)
TeamId?   ┐ exactly one         StartedAt             PlayerId (FK)                 SchemaVersion (int)
PlayerId? ┘ (check constraint)  LockedAt?             TeamId (FK)                   Data (jsonb)
Amount (int, signed)            EndedAt?              Sequence (1, 2, 3…)           CreatedAt
Reason?                                               OffsetMs (from first buzz)    CreatedByPlayerId
ReversesAdjustmentId? (FK)                            CountedForTeam (bool)
CreatedAt                                             TeamQueuePosition?
CreatedByPlayerId (admin)                             Outcome? (Current/Passed/Unreached)
```

**Constraints / indexes**
- Unique `(EventId, NormalizedName)` on Team; unique `(EventId, ColorKey)` on Team.
- Unique `(EventId, NormalizedRealName)` and `(EventId, NormalizedDisplayName)` on Player.
- Unique `JoinCode` on Event. Only one active event (enforce in code; a filtered unique index on `IsActive` where true is a bonus).
- ScoreAdjustment check constraint: `num_nonnulls("TeamId", "PlayerId") = 1`. Unique `ReversesAdjustmentId` (an adjustment can be undone once).
- `Normalized…` = `value.Trim().ToUpperInvariant()`, set in one place.
- Enums stored as strings (readable in pgAdmin).

**Totals:** team = `SUM(Amount) WHERE TeamId = x`; player = `SUM(Amount) WHERE PlayerId = x`.

### 7.2 Seeding (idempotent, at startup)
From config (`Event` section; secrets in User Secrets):
```json
"Event": {
  "Name": "Sully's 5th Annual Games Night",
  "Year": 2026,
  "JoinCode": "<user secret>",
  "ThemeKey": "arcade-2026",
  "Teams": [
    { "Name": "Rage Quitters", "ColorKey": "red",    "IconKey": "rage-quitters" },
    { "Name": "Pay To Win",    "ColorKey": "yellow", "IconKey": "pay-to-win" },
    { "Name": "Cheat Codes",   "ColorKey": "green",  "IconKey": "cheat-codes" },
    { "Name": "Smurfs",        "ColorKey": "blue",   "IconKey": "smurfs" },
    { "Name": "AFK Allstars",  "ColorKey": "purple", "IconKey": "afk-allstars" },
    { "Name": "RNG Lovers",    "ColorKey": "pink",   "IconKey": "rng-lovers" }
  ]
},
"Admins": [ { "RealName": "<secret>", "DisplayName": "<secret>", "Pin": "<secret>" } ]
```
**Rules:** create the event if its `JoinCode` doesn't exist and make it the only active one. Create teams **only if the event has none** (never overwrite admin renames on restart). Create each admin **only if missing** (never reset a PIN). Apply pending migrations at startup in Development only.

### 7.3 Core: the round state machine

```
RoundPhase: Idle → Open → Locked → Exhausted
            any phase --Reset--> Idle
```

| Phase | Meaning | Allowed |
|---|---|---|
| `Idle` | No question running | `Begin(roster)` → `Open` |
| `Open` | Accepting buzzes; grace window starts at the first buzz | `Buzz(playerId)`. Auto-lock → `Locked` when the window passes or all eligible teams are queued (via `Buzz` or `Tick`) |
| `Locked` | Queue frozen; exactly one team `Current` | `NextTeam()`: current → `Passed`, next → `Current`, or → `Exhausted` |
| `Exhausted` | Every queued team passed | Only `Reset` |

**Suggested API (the AI may refine names)**
```csharp
public sealed record RosterEntry(int PlayerId, string PlayerName, int TeamId, string TeamName);
public sealed record RoundSettings { public TimeSpan GraceWindow { get; init; } = TimeSpan.FromSeconds(2); public int MaxRecordedBuzzes { get; init; } = 100; }
public enum RoundPhase { Idle, Open, Locked, Exhausted }
public enum TeamTurnStatus { Waiting, Current, Passed }
public sealed record RoundResult(bool Success, string? Error, bool Changed);   // Result pattern; no exceptions for game rules

public sealed class BuzzRound
{
    public BuzzRound(TimeProvider time, RoundSettings settings);
    public RoundResult Begin(IReadOnlyCollection<RosterEntry> roster);  // Idle only
    public RoundResult Buzz(int playerId);                              // team from the roster, never from the client
    public RoundResult NextTeam();
    public RoundResult Reset();
    public bool Tick();                                                 // true if state changed
    public PublicRoundSnapshot GetPublicSnapshot();
    public AdminRoundSnapshot GetAdminSnapshot();
    public LockedRoundRecord? TakeLockedRecord();                       // once after locking, for persistence (D28)
    public EndedRoundRecord? TakeEndedRecord();                         // once after Reset ends a locked round: EndedAt + team outcomes
}
```

**`Buzz(playerId)` rules:** inside the lock; read `now` from `TimeProvider`. (1) If `Open` and the window has passed → lock now, then reject. (2) Reject if not `Open`. (3) Reject if the player isn't in the roster. (4) Ignore a repeat buzz from the same player (success, `Changed = false`). (5) Record the buzz (sequence, offset from first buzz) up to `MaxRecordedBuzzes`. (6) If the team isn't queued, queue it, credited to this player; the first queued buzz sets `WindowEndsAt = now + GraceWindow`. (7) If every roster team is queued → lock. (8) On lock: first entry → `Current`, set `CurrentSince = now`.

**Snapshots** (immutable records, built inside the lock, collections copied)
- `PublicRoundSnapshot`: `Version` (increments on every change; clients ignore older snapshots), `RoundId`, `Phase`, `TeamQueue[] { Position, TeamId, TeamName, BuzzedByDisplayName, Status }`, `CurrentTeamId?`, `WindowEndsAt?`, `ServerNow`.
- `AdminRoundSnapshot`: public + `Buzzes[] { Sequence, PlayerId, DisplayName, TeamId, TeamName, OffsetMs, CountedForTeam }` + `CurrentSince?`.

**`ScoreMath`** (pure): `SignedAmount(amount, multiplier, direction)`; validates `amount > 0`, `1 ≤ multiplier ≤ 100`, checked arithmetic.

**Core tests must cover:** every valid transition and at least one invalid one per action; per-team queue (teammate recorded, not queued); repeat buzz ignored; unknown player rejected; buzz at/after the window rejected **without** `Tick()` (`FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing`); `Tick()` locks; all-teams auto-lock; `NextTeam` through to `Exhausted`; `Reset` from every phase; admin snapshot has individual buzzes, public doesn't; **concurrency**: `Parallel.For` with ~200 buzzes across 6 teams → exactly 6 queue entries, positions 1–6, no duplicates; `ScoreMath` edge cases. No `Thread.Sleep`.

---

## 8. API contract

All routes under `/api`. JSON camelCase. Errors as **ProblemDetails**. Validation: names 2–20 chars after trim (team names 2–24); PIN exactly 4 digits.

### 8.1 Event (public)
| Method | Route | Auth | Result |
|---|---|---|---|
| GET | `/api/event` | anonymous | `{ name, year, themeKey }` of the active event (the frontend needs the theme before sign-in) |
| GET | `/api/event/teams?code=XXXX` | anonymous | `[{ id, name, colorKey, iconKey, memberCount }]` for registration. `404` if code wrong |

### 8.2 Session
| Method | Route | Auth | Body → Result |
|---|---|---|---|
| POST | `/api/session/register` | anonymous; rate-limited per IP (generous) | `{ joinCode, realName, displayName, pin, teamId }` → `201` + signed in. Real or display name taken → `409` (message tells them to sign in instead) |
| POST | `/api/session/signin` | anonymous; rate-limited **per normalized real name** | `{ joinCode, realName, pin }` → `200` + signed in; wrong → `401` (same message for unknown name and wrong PIN) |
| POST | `/api/session/signout` | signed in | `204` |
| GET | `/api/session/me` | signed in | `{ playerId, realName, displayName, role, teamId?, teamName? }` (read from DB, not the cookie) |

Admins sign in through `/signin` (no team).

### 8.3 Teams
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/api/teams` | signed in | `[{ id, name, colorKey, iconKey, sortOrder, members: [{ playerId, displayName, realName? }] }]`. `realName` only for admins (and the caller's own row) |
| POST | `/api/teams` | admin | `{ name, colorKey, iconKey }` → `201`. Duplicate name/colour → `409` |
| PATCH | `/api/teams/{id}` | admin | `{ name }` |
| DELETE | `/api/teams/{id}` | admin | `409` if the team has players or score rows |

### 8.4 Players
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/api/players` | admin | `[{ id, realName, displayName, role, teamId?, teamName? }]` |
| PATCH | `/api/players/me` | signed in | `{ displayName?, realName? }`. Uniqueness → `409` |
| PATCH | `/api/players/{id}` | admin | `{ displayName?, realName? }` |
| PATCH | `/api/players/{id}/team` | admin | `{ teamId }` (players only) |
| POST | `/api/players/{id}/promote` | admin | Make admin; removes from their team |

### 8.5 Scores
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/scores/adjustments` | admin | `{ target: "team" \| "player", targetId, amount, multiplier = 1, direction: "add" \| "remove", reason? }` |
| GET | `/api/scores/teams` | signed in | `[{ teamId, name, colorKey, iconKey, total, rank }]` sorted desc; ties share a rank |
| GET | `/api/scores/players` | admin | `[{ playerId, displayName, realName, teamId?, teamName?, total }]` (frontend sorts by team or score) |
| GET | `/api/scores/adjustments?take=20` | admin | Recent ledger rows with target names |
| POST | `/api/scores/adjustments/{id}/reverse` | admin | Adds an equal-and-opposite row; `409` if already reversed |

Every successful write in 8.3–8.5 sends `TeamsChanged` and/or `ScoresChanged`.

### 8.6 Archive (MVP-minimal)
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/archive/finalize` | admin | Builds the `ArchiveDocument` for the active event, upserts `EventArchive`, sets `FinalizedAt`. Can be re-run (replaces) |
| GET | `/api/archive/{eventId}/export` | admin | Downloads `buzzer-archive-<year>.json` |

**`ArchiveDocument` v1** (records in `Core/Archive`):
```
{ schemaVersion: 1, generatedAt,
  event:   { name, year, themeKey },
  teams:   [{ name, colorKey, iconKey, total, rank,
              members: [{ displayName, realName, total }] }],
  players: [{ displayName, realName, teamName, total, rank }],
  stats:   { roundsPlayed, totalBuzzes } }
```
`schemaVersion` lets future code read old files. The archive UI (O6) renders it with the **same** Teams/Leaderboard components in read-only mode, using the archived `themeKey`'s pack.

### 8.7 SignalR hub `/hubs/game` (`[Authorize]`)
| Direction | Name | Who | Payload |
|---|---|---|---|
| client → server | `Buzz()` | players | none; PlayerId from the cookie only |
| client → server | `BeginRound()` / `NextTeam()` / `ResetRound()` | admins (`[Authorize(Roles = "Admin")]`) | none; returns `RoundResult` |
| server → caller | on connect | everyone | current `RoundUpdated` (+ `AdminRoundUpdated` for admins) |
| server → all | `RoundUpdated` | everyone | `PublicRoundSnapshot` |
| server → admins | `AdminRoundUpdated` | group `admins` | `AdminRoundSnapshot` |
| server → all | `TeamsChanged`, `ScoresChanged` | everyone | none (clients refetch) |

`BeginRound` loads the roster (players with a team in the active event) via a scoped `DbContext` (create a scope with `IServiceScopeFactory`; never inject `DbContext` into a singleton). When a round locks (from `Buzz` or `Tick`), persist `Round` + `BuzzRecord`s via `TakeLockedRecord()`. On `Reset`, set `EndedAt` + outcomes via `TakeEndedRecord()`. Persistence runs through one ordered background queue (see `docs/BackendSteps.md` B6).

---

## 9. Theming architecture (frontend)

**Principle:** *components are structure; packs are style.* Next year's redesign = add a pack and change `Event:ThemeKey`.

### 9.1 Layout
```
frontend/src/theme/
  types.ts            ThemePack contract (below)
  ThemeRoot.tsx       loads the pack for the active event → <FluentProvider> + --app-* CSS variables + effects
  useTeamVisual.ts    (colorKey, iconKey) → { color, iconUrl } with fallbacks for unknown keys
  registry.ts         themeKey → lazy import of the pack (unknown key → "default")
  packs/
    default/          neutral fallback pack (always present)
    arcade-2026/      index.ts, icons/*.svg, fonts imported via @fontsource
  ThemePreviewPage.tsx  dev-only route /dev/theme: every token, team card, buzzer state and Fluent control on one page
```

### 9.2 Contract
```ts
export interface ThemePack {
  key: string;                              // "arcade-2026"
  fluent: { brand: BrandVariants; mode: 'light' | 'dark'; overrides?: Partial<Theme> }; // → createDarkTheme/createLightTheme + overrides
  app: {
    buzzer: Record<BuzzerVisualState, { fill: string; text: string; animation?: 'pulse' | 'blink' | 'none' }>;
    surface: { page: string; panel: string; panelBorder: string };
    border: { width: string; style: string };  // e.g. chunky 4px for arcade
    shadow: string;                            // e.g. hard offset "4px 4px 0 #000" (no blur)
  };
  fonts: { heading: string; body: string; numeric: string };  // CSS font stacks
  teamColors: Record<string, string>;        // colorKey → hex
  teamIcons: Record<string, string>;         // iconKey → imported asset URL
  effects?: { scanlines?: boolean };
  copy?: Partial<Record<'buzz' | 'yourTurn' | 'locked' | 'out', string>>;  // flavour text, e.g. "PRESS START"
}
```
`BuzzerVisualState` = `ready | yourTeamUp | queued | out | waiting`, computed by the pure `getBuzzerState(snapshot, me)`; the pack decides how each looks.

### 9.3 Pack `arcade-2026` (retro, not cyberpunk)
- **Mood:** 80s/8-bit arcade cabinet. Flat solid colours, square corners, chunky pixel borders, **hard** drop shadows (no blur), optional faint scanlines. **No** neon glow, gradients, chrome or glitch effects.
- **Mode:** dark (Q4, resolved). Near-black page, dark panels. Light mode is a later addition (the `mode` field in the contract already allows it).
- **Neutrals from the artwork:** ink `#111111`, off-white `#F2F2F2`. Use these for the page/text extremes so UI and icons match.
- **Fonts:** `Press Start 2P` for headings, buttons and scores (zero-padded, e.g. `00120`); `VT323` or the system font for body text (Press Start 2P is hard to read in sentences). Self-host via `@fontsource/*` so nothing depends on Google's CDN on event day.
- **Fluent overrides:** all `borderRadius*` tokens → `0`; `fontFamilyBase` → body font; shadows → hard offset.
- **Team palette** (exact background colours of the icon files):

  | colorKey | Team | Hex |
  |---|---|---|
  | red | Rage Quitters | `#D7263D` |
  | yellow | Pay To Win | `#F5B700` |
  | green | Cheat Codes | `#7FB800` |
  | blue | Smurfs | `#2E8BC0` |
  | purple | AFK Allstars | `#9B5DE5` |
  | pink | RNG Lovers | `#E84A8A` |

- **Icons:** copy `images/team-logos/<iconKey>-face.png` into `packs/arcade-2026/icons/<iconKey>.png` (iconKeys: `rage-quitters`, `pay-to-win`, `cheat-codes`, `smurfs`, `afk-allstars`, `rng-lovers`) and import them in the pack so Vite fingerprints them. The source files stay in `images/` as design masters. Each icon is a **tile**: the face on a solid team-colour background (not transparent), aspect ratio 1.26:1. Show it in a fixed box with `object-fit: cover` (the face is centred, so the edge crop only removes background). The sources are high-resolution, so normal (smooth) downscaling is fine. Transparent versions are not needed for the MVP.
- **Colour clash:** the six team colours cover almost the whole hue wheel, so red/amber/green **status** colours would be confused with teams. The buzzer therefore uses the **player's own team colour** when ready, and shows other states by **label, brightness and animation** (e.g. "YOUR TEAM'S UP!" blinking; "#2 IN LINE" dimmed; "OUT" greyed). Always text + visual, never colour alone.

### 9.4 Team card (shared component)
Border in the team colour (pack `border.width`), icon top-left, team name, member list (display names; real names in smaller text for admins). Admin: ⋮ on the card → Rename; ⋮ per member → Edit names, Move to…, Make admin. Own row for players: ✎ → edit own names. Same component reused by the leaderboard, the archive view and (later) the display screen.

---

## 10. Milestones and steps

Target: **MVP usable by 29 Nov**, rehearsal first week of December, then optional features. One step ≈ one branch ≈ one PR.

### Milestone B — Backend (8–15 Nov)

Implementation detail per step (files, gotchas, checks, suggested model): **`docs/BackendSteps.md`**. Branching: B0 on `backend-phase-1` → PR to `main` first (so CI exists); then `feature/b<n>-…` per step.

| Step | Do | Done when |
|---|---|---|
| **B0** Hygiene + CI | Delete `Class1.cs` ×2, `UnitTest1.cs`, weather sample. Add `.github/workflows/ci.yml` (below) | CI runs on the PR and passes. Developer marks both jobs as required status checks |
| **B1** Core round engine | §7.3: `BuzzRound`, types, snapshots, `ScoreMath`, full tests. Add `Microsoft.Extensions.TimeProvider.Testing` to the test project only | All §7.3 tests green |
| **B2** Domain + persistence | Entities §7.1 in `Core/Domain`. Infrastructure: `AppDbContext`, one `IEntityTypeConfiguration<T>` per entity, constraints/indexes, `AddInfrastructure(...)`. Add `Microsoft.EntityFrameworkCore.Design` to Api. Add a local tool manifest (`dotnet new tool-manifest` + `dotnet tool install dotnet-ef`). Options classes (`Event`, `Admins`, `Round`). Seeder §7.2. Initial migration in `Infrastructure/Persistence/Migrations`. **Compose fixes:** remove `version:`, bind `"127.0.0.1:5432:5432"`, read the password from a git-ignored `.env` (commit `.env.example`), `restart: unless-stopped`. If PostgreSQL is also installed locally on 5432, use 5433 | `docker compose up -d` + `dotnet ef database update` creates tables visible in pgAdmin; app start seeds event, 6 teams, admins |
| **B3** Auth + session | §8.1–8.2. Cookie auth (401/403, no redirects, `HttpOnly`, `SameSite=Lax`, `SecurePolicy=SameAsRequest` in Development so phones on the LAN over http work, 30-day sliding). `PasswordHasher<Player>`. Rate limiting per D24. `ICurrentUser` | Register, sign in, wrong PIN, rate limit, `me` all behave in the `.http` file / Postman |
| **B4** Teams + players | §8.3–8.4 with authorization rules | Real names hidden from non-admins; delete guards work |
| **B5** Scores | §8.5 using `ScoreMath` | Totals correct; reverse works once |
| **B6** Realtime | `GameHub`, `RoundService`, `RoundClock`, round persistence, change notifications from REST writes | Two clients see buzzes/locks instantly; lock after 2s with no input |
| **B7** Archive | §8.6 | Finalize + export produce a valid v1 document |
| **B8** Hosting prep | API serves the built frontend (`UseDefaultFiles`, `UseStaticFiles`, `MapFallbackToFile("index.html")` after API/hub routes). `/healthz` | Built frontend served by `dotnet run` |

**CI workflow** (`.github/workflows/ci.yml`; the AI should check the latest major versions of the `actions/*` steps):
```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
      - run: dotnet test BuzzerApp.slnx --configuration Release

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      # - run: npx vitest run   ← uncomment in F3
```

### Milestone F — Frontend (16–29 Nov)

| Step | Do | Done when |
|---|---|---|
| **F0** Foundations | Install Fluent UI v9 (`@fluentui/react-components`, `@fluentui/react-icons`), `react-router`, `@tanstack/react-query`, `@microsoft/signalr`, Vitest. Vite dev proxy: `/api` and `/hubs` → `http://localhost:5283` (`ws: true` for `/hubs`). Folder structure below. Remove template content. Theme system §9.1–9.2 with the `default` pack and `/dev/theme` preview | App shell renders with the default pack; lint/build pass |
| **F1** Arcade pack | Dark mode (Q4). `packs/arcade-2026` per §9.3: brand ramp, overrides, fonts, palette, icons (copied from `images/team-logos/`), effects | `/dev/theme` shows all six team cards and every buzzer state in the arcade style |
| **F2** API layer | `src/api/client.ts` (JSON, `credentials: 'include'`, ProblemDetails → typed error), `types.ts` from §8, one hook per endpoint | Used by the join screen |
| **F3** Realtime | `GameConnectionProvider` (one connection, `withAutomaticReconnect()`, reconnect on `visibilitychange`, StrictMode-safe), `TeamsChanged`/`ScoresChanged` → `invalidateQueries`. Pure `getBuzzerState` + Vitest tests. Enable Vitest in CI | Two tabs stay in sync; tests green in CI |
| **F4** Register / Sign in | `/join?code=XXXX` with two tabs: **New player** (real name, display name, PIN, team picker showing team cards) and **Sign in** (real name, PIN). Route guards. Players → `/play`, admins → `/admin` | All error cases handled |
| **F5** Play `/play` | Big round arcade buzzer (states per §9.3), team queue below, bottom nav: Buzz · Teams · Scores | Works at 360px wide |
| **F6** Teams `/teams` | §9.4 for players and admins; Move to… dialog lists the other teams | Permission rules match §8.3–8.4 |
| **F7** Scores | `/scores`: team leaderboard. `/admin/scores`: team table on top, players below with **Sort by: Team / Score**; amount, multiplier (default 1), Add, Remove; recent adjustments with Undo | Updates live everywhere |
| **F8** Host `/admin` + event panel | Begin / Next team / Reset (enabled per phase), team queue with current team + elapsed timer, full individual buzz list (`#1 Alice (Rage Quitters) +0.00s`; `#2 Bob (Rage Quitters) +0.21s · not counted`). `/admin/event`: **Finalize** and **Export** buttons | A full round runs from a phone; export downloads |

**Frontend structure**
```
frontend/src/
  api/          client.ts, types.ts, hooks/
  realtime/     GameConnectionProvider.tsx, useGame.ts, buzzerState.ts (+ .test.ts)
  theme/        §9.1
  features/
    join/       JoinPage.tsx
    play/       PlayPage.tsx, Buzzer.tsx
    teams/      TeamsPage.tsx, TeamCard.tsx, MoveToDialog.tsx, EditNamesDialog.tsx
    scores/     LeaderboardPage.tsx, AdminScoresPage.tsx
    host/       HostPage.tsx, ElapsedTimer.tsx
    event/      EventAdminPage.tsx
  components/   Layout, BottomNav, shared wrappers around Fluent controls
  App.tsx, main.tsx, routes.tsx
```

### Milestone R — Harden, deploy, rehearse (30 Nov – 6 Dec)

| Step | Do |
|---|---|
| R1 | PWA basics (`vite-plugin-pwa`: manifest, icons from the pack, **cache the app shell only, never `/api` or `/hubs`**, auto-update). Screen Wake Lock on `/play` and `/admin` |
| R2 | Hosting: Azure App Service **B1** for the event weekend (free F1 caps WebSockets at 5) + Azure Database for PostgreSQL Flexible Server (smallest burstable). Config/secrets via App Settings |
| R3 | Build: `npm run build` → copy `dist` into Api `wwwroot` → `dotnet publish`. Optional GitHub Actions deploy job |
| R4 | Rehearsal with 5+ real phones: Wi-Fi and 4G, lock/unlock mid-round, refresh, sign in on another browser, two admins, near-simultaneous buzzes, server restart mid-game |
| R5 | Event day + after: QR/join code ready, admin PINs tested, fallback plan (hands up). **Afterwards: Finalize → Export JSON → `pg_dump` the database → store both privately (not in the public repo) → only then delete cloud resources** |

---

## 11. Optional features (after MVP, recommended order)

| # | Feature | Notes |
|---|---|---|
| O0 | **Display (projector) screen** `/display` | Read-only; reuses `RoundUpdated`, TeamCard, leaderboard. QR code + join URL in the lobby |
| O6 | **Past years** (archive browser) | Admin "History": list archives by year → read-only Teams + scoreboards rendered from `ArchiveDocument` with its theme pack. `POST /api/archive/import` to load exported JSON into a new database |
| O3 | **Live schedule tracker** | `ScheduleItem { EventId, Order, Title, PlannedStart, PlannedDuration, ActualStart?, ActualEnd? }`; "+7 min behind" |
| O4 | **Questions on screen** | `Question { Type (Text/MultiChoice/Picture), Prompt, Options[], CorrectAnswer, ImageUrl? }`. Answers only in the admin snapshot (D6). Pictures → **Azure Blob Storage** |
| O2 | **Shop** | Needs a currency decision. `ShopItem { Stock? }` + `Purchase` ledger; buy inside a DB transaction so two teams can't buy the last item |
| O1 | **MVP-player tracker** | Define weighting first. Inputs already recorded: `BuzzRecord`s (D28) and player `ScoreAdjustment`s |
| O7 | **Admin appearance editor** | Change team colour/icon from keys available in the active pack |
| O8 | **Score phases** | Nullable `Category`/`PhaseId` on `ScoreAdjustment`; phases with fixed point budgets |
| O5 | **Store apps** | Wrap the React app with Capacitor. Apple $99/yr, Google $25 once |

**Deadline note:** MVP + O0 + one more by 18 Dec is realistic. Treat the rest as 2027 work.

---

## 12. Git & PR workflow (GitHub)

- Branch per step: `feature/b1-core-round`, `feature/f5-play-screen`.
- Before a PR: `git fetch` → `git rebase origin/main` → re-run build/tests → `git push --force-with-lease`.
- GitHub "Rebase and merge" re-creates your commits on `main` with new IDs. After merging, delete the branch and branch again from the updated `main`.
- Tidy commits before review (`git rebase -i origin/main`); every commit lands on `main`.
- Never rebase or force-push `main` or someone else's branch.
