# Buzzer App — Project Plan
 
> **Living document.** Read alongside `Learning & Preferences.txt`, which sets how I want to be taught.
> Update the checkboxes, the Decision Log and the Open Questions as the project moves.
> Last updated: 1 Nov 2026 (v2: team-based buzz queue, grace window, Azure DevOps workflow). Phase 0 not started.
 
---
 
## 0. How to use this plan
 
### For me (the developer)
- Work **one step at a time** (e.g. "Step 1.3"). One step ≈ one chat session ≈ one pull request.
- I write the code myself. The AI explains, reviews and corrects. It does not write whole features for me.
- Follow the Git workflow in **§8** for every step.
- When a step changes a decision, update **§2 Decision Log** or **§3 Open Questions**.
### Prompt to start a new chat
```
Read BuzzerApp-PLAN.md and "Learning & Preferences.txt" from the project.
I'm on Phase X, Step X.Y. [Paste anything relevant: error, code, question.]
Teach me this step following my learning preferences. Don't skip ahead.
```
 
### Rules for any AI assistant using this plan
1. Follow `Learning & Preferences.txt`: plain English first, then technical depth. Explain under the hood, use comparisons and tables, comment code so it teaches.
2. **Stay inside the current step.** Mention later steps only to explain *why* something is done now.
3. Let me write the code. Prefer: explain, then show a small example, then I write it, then you review. Give full working code only when I ask or am stuck.
4. Respect §2 Decision Log. If you think a decision is wrong, say so and explain why. Don't silently do something else.
5. If a step depends on an unresolved item in §3 Open Questions, ask me about it first, **one question at a time**.
6. I am weak at frontend (JS/TS/React), SQL and YAML. Assume no prior knowledge there. I can read C# reasonably well.
7. Avoid over-engineering. This app is used for **one day** by about 35 people.
### Progress
- [ ] Phase 0 — Environment, repo, collaboration & CI setup
- [ ] Phase 1 — Game engine (pure C#, unit tested)
- [ ] Phase 2 — REST API + database
- [ ] Phase 3 — SignalR real-time layer
- [ ] Phase 4 — React fundamentals with fake data
- [ ] Phase 5 — Connect frontend to backend
- [ ] Phase 6 — Admin features
- [ ] Phase 7 — PWA & polish
- [ ] Phase 8 — Deploy & rehearsal
---
 
## 1. What we're building
 
A **browser-based live buzzer** (installable as a PWA) for a one-day family trivia event.
 
- About 4 teams of 4–8 players, plus 2 admins (me and a co-host), plus 1 **projector display**.
- Players join by scanning a QR code or typing a URL that includes a **join code**.
- Each player signs in with a **display name + 4-digit PIN** and picks a team.
- During a question the admin enables buzzing. Players tap a big **globe** to buzz.
- **The queue is per team.** The first buzz from each team claims that team's place. Teammates can help the answerer, so later buzzes from the same team add nothing.
- After the first buzz, a short **grace window** (default 2s) lets other teams get in. Then the queue locks. The server decides the order.
- The admin runs a timer for the current team, can **drop** them (wrong or out of time), and the next team in the queue becomes current.
- The **timer is shown on the admin screen and the projector**. Player phones show status and queue position, not a timer.
- The admin adjusts scores manually in a grid. Players see a team leaderboard; admins also see individual scores.
### Three views (one React app)
| View | Who | Purpose |
|---|---|---|
| `/play` | Players | Globe (status colour + text), team's queue position, team leaderboard |
| `/admin` | Admins | Split globe (Start timer / Drop) with timer, buzzing toggle, Reset buzzers, teams, players, scores grid |
| `/display` | Projector | QR code + join URL, lobby (names per team), live queue, **timer**, leaderboard. Read-only |
 
---
 
## 2. Decision Log
 
### Decided
| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Platform | **Web app / PWA** in the phone browser. No app stores | Apple's fee is $99/yr and Google's $25, both over budget. Same React/TS/Vite stack as work |
| D2 | Backend | **.NET 10, ASP.NET Core** | Work stack, learning goal |
| D3 | API style | **REST** for setup/admin/scores, **SignalR** for the live game | Push is required. REST is familiar. GraphQL is a stretch goal (S2) |
| D4 | Real-time model | Server broadcasts the **full game snapshot** on every change. Clients that reconnect just receive the current snapshot | Self-healing; no event replay. Tiny payload at this scale |
| D5 | Who was first | **Server arrival order.** Never trust phone timestamps. Ask everyone to use the venue Wi-Fi | Phone clocks differ; timestamps can be faked |
| D6 | Timer | Server records the start instant. The **admin screen and projector** run a local display stopwatch from "timer started". **Player phones show no timer.** Admin decides when to drop; no auto-drop | Removes clock-sync worries from 35 phones. Everyone watches the projector anyway. Human stays in control |
| D7 | Game rules location | Pure C# class library `BuzzerApp.Core`. **No ASP.NET, EF Core or SignalR references** | Fully unit-testable; hardest logic isolated |
| D8 | Concurrency | **Single server instance.** Live round state in memory, guarded by a `lock`. Persistent data in the DB | Simplest correct design. Scale-out not needed |
| D9 | Rooms | **One game per server.** Join code is just a gate against strangers | Multi-room support is over-engineering here |
| D10 | Sign-in | Join code + display name + 4-digit PIN (**hashed**). No email, no recovery. Same name + PIN = rejoin on any device | Low friction; no personal data |
| D11 | Uniqueness | Display names and team names unique, **case-insensitive** ("Bob" = "bob") | Avoid confusing duplicates |
| D12 | Teams | Admin **pre-creates** teams. Player picks a team when joining. After that, only an admin can move them (⋮ → Move to) | Less admin work on the day; avoids drag-and-drop on mobile |
| D13 | Buzzing gate | Admin toggles **Enable buzzing / Disable buzzing** | Stops early buzzes; no fixed timers between questions |
| D14 | Queue model | **One queue entry per team**, credited to the first teammate who buzzed. Max queue length = number of teams. A dropped team is out for the rest of that question | Teammates may help the answerer, so a second slot for the same team is pointless. Stops one team flooding the queue |
| D15 | Queue closing | First buzz starts a **grace window** (`BuzzWindow`, default **2s**, in config). Buzzing closes when the window ends, **or** every team has buzzed, **or** the admin presses Disable | Order is locked before anyone speaks, so no team can buzz after hearing a wrong answer |
| D16 | Mistakes | **No player un-buzz.** Admin has **Reset buzzers** (clears the queue, stays open) | A 2s window leaves no time to un-buzz. Admin reset handles accidental buzzes and false starts |
| D17 | Who can buzz | Only players **with a team**. Admins and the projector never buzz | Avoids null-team edge cases |
| D18 | Scoring v1 | **Manual** by admin: amount × multiplier, then Add or Remove, per player or per team | Matches how the event is actually scored |
| D19 | Score storage | **Ledger**: every change is a `ScoreAdjustment` row; totals are computed | Audit trail, easy undo, no lost updates |
| D20 | Testing | Backend **xUnit**; frontend **Vitest**. No end-to-end/system tests | Learning goal without over-scoping |
| D21 | Tools | VS (backend), VS Code (frontend), Git Fork, pgAdmin, Postman | Mirrors work |
| D22 | Git workflow | Feature branch per step → PR → **1 approval from the other developer** → **CI must pass** → complete with **rebase and fast-forward only**. Nobody pushes to `main` directly | Clean linear history; every change reviewed and tested (see §8) |
 
### Recommended — confirm when the step is reached
| # | Decision | Recommendation | Alternative | Decide at |
|---|---|---|---|---|
| R1 | Database | **PostgreSQL** (work DB, pgAdmin installed) | SQLite: simpler hosting, a single file | Step 2.2 |
| R2 | Auth mechanism | **Cookie authentication**, same-origin (React served by the API in production; Vite proxy in development) | JWT bearer tokens: more moving parts | Step 2.4 |
| R3 | Endpoint style | **Minimal APIs** (modern default, less ceremony) | Controllers, if that's what the work codebase uses | Step 0.3 |
| R4 | Hosting | **Azure App Service B1 (Linux)** for the event weekend, then delete. Free F1 allows only 5 WebSocket connections | Laptop on home Wi-Fi + tunnel; an Azure VM (more ops work) | Phase 8 |
| R5 | Git hosting + CI | **Azure DevOps** (Repos + Pipelines): free for up to 5 users, branch policies on private repos, same YAML as work | **Public GitHub repo + GitHub Actions**: free branch rules and CI on public repos, better CV visibility. Private GitHub needs Pro for branch rules | Step 0.2 |
 
---
 
## 3. Open Questions
 
Resolve each one before the step listed.
 
| # | Question | Needed by |
|---|---|---|
| Q1 | Is a **team's score** the sum of its members' scores plus team-only adjustments, or completely separate? | Step 1.5 |
| Q2 | When **every** queued team has been dropped, does the round wait for End round, or can the admin **reopen buzzing for teams not yet dropped**? | Step 1.4 |
| Q3 | Time limits: 5s for the 1st team and 10s for the rest? (Will live in config either way) | Step 1.4 |
| Q4 | Does the timer **start manually** (admin presses Start) or **automatically** when a team becomes current? Current default: manual | Step 1.4 |
| Q5 | Is there a separate **"Correct"** button, or does End round cover it (since scoring is manual)? | Step 1.4 |
| Q6 | Can someone **join late** (after the game starts)? | Step 2.4 |
| Q7 | Same player signed in on **two devices** at once: allow, or last sign-in wins? | Step 2.4 |
| Q8 | Team avatar picker: v1 or stretch goal? (Default: stretch, S1) | Phase 6 |
 
**Resolved (1 Nov 2026):** queue closing rule → D15; dropped player re-buzzing → D14 (team is out for that question); un-buzz → D16.
 
---
 
## 4. Architecture
 
```
 ┌───────────── Phones / Projector (React + TS + Vite, PWA) ─────────────┐
 │   /play                     /admin                      /display      │
 └───────────┬──────────────────────────────────────┬────────────────────┘
       REST (HTTPS, JSON)                    SignalR (WebSocket)
  join, teams, players, scores       buzz, admin round controls,
                                     server → all: "GameUpdated" snapshot
 ┌───────────▼──────────────────────────────────────▼────────────────────┐
 │  BuzzerApp.Api  (ASP.NET Core, .NET 10)                               │
 │   Endpoints · GameHub · GameClock (BackgroundService) · Auth · EF Core│
 │        │ calls (singleton Game, lock-protected)                       │
 │  BuzzerApp.Core  (pure C#: Game, RoundPhase, TeamQueue, Scoring)      │
 └───────────────────────────────┬───────────────────────────────────────┘
                                 │ EF Core (Npgsql)
                          PostgreSQL: Players, Teams, ScoreAdjustments
```
 
**Why `GameClock`?** Something must notice when the 2s grace window ends, even if nobody presses anything. Core can't run timers by itself (that would make tests depend on real time). So Core exposes `Tick()`, which checks the time through `TimeProvider`. A small background service in the API calls `Tick()` every ~100ms and broadcasts a snapshot if anything changed. Core **also** checks the window inside `Buzz()`, so a late buzz is rejected even if the next tick hasn't run yet. Correctness must never depend on tick timing.
 
**What lives where**
| Data | Stored | Lost if server restarts? |
|---|---|---|
| Players, teams, PIN hashes, score ledger | Database | No |
| Current round (phase, team queue, window end, current team, timer start) | Memory (`Game` singleton) | Yes. Admin just re-enables buzzing. Acceptable trade-off |
 
---
 
## 5. Game state machine (the heart of the app)
 
**Plain English:** the game is always in exactly one "phase", and only certain buttons work in each phase. Writing the phases down stops impossible situations, like buzzing while someone is answering or starting a timer with nobody in the queue.
 
**Technically:** a finite state machine. `RoundPhase` is an enum. Each action checks the current phase (a *guard*) and moves to a new phase (a *transition*). Invalid actions are rejected with a reason, not ignored silently.
 
| Phase | Meaning | Allowed actions → next phase |
|---|---|---|
| `Idle` | Between questions | Admin **EnableBuzzing** → `BuzzingOpen` |
| `BuzzingOpen` | Players may buzz. Window not started until the first buzz | Player **Buzz**: adds the team if it isn't queued yet; the first buzz sets `WindowEndsAt = now + BuzzWindow`. **Auto-close** → `Ready` when the window ends *or* all teams are queued. Admin **DisableBuzzing** → `Ready` (or `Idle` if nobody buzzed). Admin **ResetBuzzers** → clears queue and window, stays `BuzzingOpen` |
| `Ready` | Queue frozen; current team = first non-dropped entry; timer at 0, not running | Admin **StartTimer** → `Answering`. Admin **Drop** → next team (stay `Ready`) or `Exhausted`. Admin **EndRound** → `Idle` |
| `Answering` | Timer running for the current team | Admin **Drop** → next team → `Ready` (timer reset), or `Exhausted`. Admin **EndRound** → `Idle` |
| `Exhausted` | Every queued team was dropped | Admin **EndRound** → `Idle` (and see Q2) |
 
Game-level phase (separate, simpler): `Lobby` (joining, teams) → `Playing` → `Finished`.
 
### Globe colours (computed on the client from the snapshot + "who am I")
| Viewer | Situation | Globe |
|---|---|---|
| Player | Buzzing open, my team not queued | Bright/neutral, **tappable** ("BUZZ") |
| Player | My team is current | **Green**: "YOUR TEAM IS UP" + who buzzed |
| Player | My team queued, waiting | **Amber**: "Your team is #3" + who buzzed |
| Player | My team dropped this question | **Red**: "Out this question" |
| Player | Not queued and buzzing closed / Idle | **Grey**, not tappable |
| Admin | Any | Neutral (white/grey) with split controls and the **timer**. Turns **red** once the current team passes its time limit (visual cue only) |
| Display | Any | Queue list + timer for the current team |
 
Always show **text as well as colour** (some people are colour-blind).
 
---
 
## 6. Data model (v1)
 
```
Team             Player                        ScoreAdjustment (ledger)
-----            ------                        ------------------------
Id (int)         Id (int)                      Id (int)
Name             DisplayName                   PlayerId (int?, FK)  ─┐ exactly one
NormalizedName*  NormalizedDisplayName*        TeamId   (int?, FK)  ─┘ of these set
AvatarKey?       PinHash                       Amount (int, signed: +add / −remove)
                 IsAdmin (bool)                Reason (string?)
                 TeamId (int?, FK)             CreatedAt (UTC)
                 CreatedAt (UTC)               CreatedByPlayerId (admin who did it)
 
* NormalizedX = UPPER-INVARIANT copy with a UNIQUE index → case-insensitive uniqueness.
  Same pattern ASP.NET Identity uses, and it works on both PostgreSQL and SQLite.
```
 
Totals = `SUM(Amount)` grouped by player or team (team total depends on **Q1**).
 
In-memory only (Core): `QueueEntry(TeamId, BuzzedByPlayerId, BuzzedAt, Status: Waiting/Current/Dropped)`.
 
---
 
## 7. Repository layout
 
```
buzzer-app/                      ← repo root (Azure Repos, cloned via Fork)
├─ README.md
├─ .gitignore                    ← VisualStudio template + node_modules/, dist/, .env
├─ azure-pipelines.yml           ← CI: build + unit tests (Step 0.5)
├─ .azuredevops/
│  └─ pull_request_template.md   ← checklist shown on every PR
├─ docs/
│  └─ PLAN.md                    ← this file
├─ backend/
│  ├─ BuzzerApp.sln(x)           ← newer VS versions create .slnx; either is fine
│  ├─ src/
│  │  ├─ BuzzerApp.Core/         ← Class Library: game rules ONLY
│  │  └─ BuzzerApp.Api/          ← ASP.NET Core Web API: endpoints, hub, clock, EF Core, auth
│  └─ tests/
│     └─ BuzzerApp.Core.Tests/   ← xUnit tests for Core
├─ frontend/                     ← Vite + React + TypeScript (opened in VS Code)
└─ postman/                      ← exported Postman collection
```
 
**Why only two backend projects?** The main boundary that matters is *game rules vs everything else*. A separate `Infrastructure` project for EF Core is what large Clean Architecture codebases do. Here it adds ceremony without benefit, so the DbContext lives in `Api/Data`. **Dependency rule:** `Api → Core` only. `Core` references nothing.
 
---
 
## 8. Working together: Git & pull-request workflow
 
**Plain English:** `main` is the shared, always-working version. Nobody edits it directly. Each person works on their own branch, then asks the other to review. The pipeline runs the tests. Only when the review is approved **and** the tests are green can the change go into `main`. It goes in by **rebasing**: your commits are replayed on top of the latest `main`, so history stays one straight line.
 
### Merge strategies compared
| Strategy | What `main` looks like | Keeps individual commits? | Verdict |
|---|---|---|---|
| Merge (no fast-forward) | Branches and merge commits ("merge bubbles") | Yes | ❌ messy |
| Squash | One commit per PR | No, collapsed into one | OK, but loses step detail |
| Semi-linear (rebase + merge commit) | Straight line plus a merge commit per PR | Yes | Middle ground |
| **Rebase and fast-forward** | **One straight line** | **Yes** | ✅ chosen (D22). Requires tidy commits |
 
### Branch policies on `main` (Azure DevOps → Project settings → Repositories → Policies → `main`)
| Policy | Setting | Why |
|---|---|---|
| Require a minimum number of reviewers | **1**; "Allow requestors to approve their own changes" **off** | The other developer must approve |
| Check for comment resolution | **Required** | Review comments can't be ignored |
| Limit merge types | **Only "Rebase and fast-forward"** | Linear history |
| Build validation | The CI pipeline, **Required**, expires **immediately when `main` is updated** | Tests must pass against the latest `main` |
| Automatically delete source branch | On (in the Complete dialog) | No stale branches |
 
Enabling any required policy also blocks direct pushes (and force pushes) to `main`. If one of us is away and something is urgent, the project admin can grant themselves "Bypass policies". Use it rarely.
 
### The loop for every step
| # | Do | Command-line equivalent (Fork has buttons for all of these) |
|---|---|---|
| 1 | Update `main` | `git switch main` → `git pull` |
| 2 | Create a branch named after the step | `git switch -c feature/1.3-team-queue` |
| 3 | Work in **small commits** with clear messages ("Add grace window to Buzz") | `git commit` |
| 4 | Before opening a PR, rebase on the latest `main` and re-run tests | `git fetch` → `git rebase origin/main` |
| 5 | Tidy commits if needed (squash "fix typo" commits into the commit they fix) | `git rebase -i origin/main` |
| 6 | Push. After any rebase you must **force-push safely** | `git push --force-with-lease` |
| 7 | Open a PR in Azure DevOps; fill the template; the other person reviews; the pipeline runs | — |
| 8 | Address comments with new commits, then tidy and force-push again | — |
| 9 | Complete with **Rebase and fast-forward**; delete the branch; both people pull `main` | — |
 
**Golden rules**
- **Never rebase or force-push `main`**, or a branch someone else is working on. Rebasing rewrites commit IDs. Anyone holding the old IDs gets a broken history.
- `--force-with-lease`, not `--force`. It refuses to overwrite the remote branch if someone pushed to it since you last fetched.
- One PR ≈ one plan step. Small PRs get real reviews; huge ones get rubber-stamped.
- Divide work by **area**, not by file, to reduce conflicts (e.g. one person on Core tests while the other does frontend Phase 4 screens with fake data).
---
 
## 9. Phases
 
Each step lists **Learn** (concepts to teach first), **Do** (what I build) and **Done when** (how I know it's finished).
 
---
 
### Phase 0 — Environment, repo, collaboration & CI setup
 
**Goal:** an empty but correctly structured solution that builds, runs, is tested by a pipeline on every PR, and is protected by branch policies.
 
#### Step 0.1 — Check tools
**Do**
| Tool | Check | Notes |
|---|---|---|
| .NET 10 SDK | `dotnet --list-sdks` shows `10.x` | |
| Visual Studio | Installer → workload **"ASP.NET and web development"** | |
| Node.js LTS | `node -v`, `npm -v` | Needed for Vite/React |
| VS Code | Extensions: **ESLint**; optional **Prettier** | |
| PostgreSQL **server** | pgAdmin connects to a local server | pgAdmin is only a *client*. You also need the server installed (or a Docker container) |
| Git Fork | Signed in to Azure DevOps (or GitHub, per R5) | |
 
**Learn:** SDK vs runtime; what Node/npm are (C# analogy: Node ≈ .NET runtime, npm ≈ NuGet).
 
#### Step 0.2 — Repo (confirm R5 first)
**Do (Azure DevOps)**
1. Go to `dev.azure.com` → create an **organization**, then a **private project** `BuzzerApp`. Invite your collaborator (Organization settings → Users; the first 5 users get a free Basic licence).
2. **Repos** → initialise the default repo with a README and the **VisualStudio** `.gitignore`.
3. Clone with Fork into e.g. `C:\dev\buzzer-app`.
4. Add to `.gitignore` if missing: `node_modules/`, `dist/`, `.env`, `*.db`.
5. Create `docs/` and copy this file in as `docs/PLAN.md`. Commit: `Add project plan`. *(Branch policies aren't on yet, so this first commit can go straight to `main`.)*
**If R5 = GitHub:** same steps on GitHub; make the repo **public**, so rulesets and Actions are free.
 
**Learn:** what `.gitignore` does and why `bin/`, `obj/` and `node_modules/` must never be committed; organization vs project vs repo in Azure DevOps.
 
#### Step 0.3 — Create the backend solution in Visual Studio
**Do** (option names may differ slightly between VS versions):
 
1. **Create a new project → "Blank Solution"**
   - Name: `BuzzerApp`. Location: `C:\dev\buzzer-app\backend`.
2. Right-click solution → **Add → New Project → "Class Library"**
   - Choose the C# one that says **.NET**, *not* ".NET Framework" (that's the old Windows-only platform).
   - Name `BuzzerApp.Core`. Location `...\backend\src`. Framework **.NET 10.0 (LTS)**.
   - Delete `Class1.cs`.
3. **Add → New Project → "xUnit Test Project"**
   - Name `BuzzerApp.Core.Tests`. Location `...\backend\tests`. Framework .NET 10.
   - Right-click the test project → **Add → Project Reference → BuzzerApp.Core**.
4. **Add → New Project → "ASP.NET Core Web API"**
   - Name `BuzzerApp.Api`. Location `...\backend\src`.
   | Option | Choose | Why |
   |---|---|---|
   | Framework | .NET 10.0 (LTS) | |
   | Authentication type | **None** | We add our own PIN + cookie auth (R2). The built-in options assume Microsoft accounts/Identity |
   | Configure for HTTPS | ✅ | Real hosting is HTTPS; cookies and PWA features need it |
   | Enable container support | ❌ | Not needed yet; adds Docker complexity |
   | Enable OpenAPI support | ✅ | Generates the API description; Postman can import it |
   | Do not use top-level statements | ❌ | Modern style, matches the docs you'll read |
   | Use controllers | ❌ for Minimal APIs (R3), ✅ if work uses controllers | Decide now and record in R3 |
   | Enlist in .NET Aspire orchestration | ❌ | Over-engineering for this app |
   - Add a Project Reference: `BuzzerApp.Api → BuzzerApp.Core`.
5. Right-click `BuzzerApp.Api` → **Set as Startup Project** → **F5**.
   - The template's sample endpoint (weather forecast) should respond. OpenAPI JSON is at `/openapi/v1.json` in development. Recent templates don't include Swagger UI, so call endpoints with Postman or the `.http` file.
6. **Test Explorer** → Run All (the template test passes).
7. Commit in Fork: `Create backend solution structure`.
**Learn:** solution vs project; `.csproj` (open it and read it); project references and *dependency direction*; what `Program.cs` is at a high level (depth comes in Step 2.1).
 
**Done when:** solution builds, API runs, test runs, committed. Core has **no** package references.
 
#### Step 0.4 — Create the frontend
**Do** (terminal in repo root):
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm run dev
```
Open the `frontend` folder in VS Code. Visit the printed URL. Commit: `Create frontend with Vite React TS`.
 
**Learn:** what `package.json`, `node_modules` and `package-lock.json` are (and why the lock file **is** committed); what `npm run dev` actually starts.
 
#### Step 0.5 — CI pipeline, branch policies and PR template
**Do**
1. Create `azure-pipelines.yml` at the repo root (backend only for now; the frontend steps are added in Step 4.5):
```yaml
# azure-pipelines.yml — CI for the Buzzer App.
# Runs (a) on every PR into main, via the branch policy "Build validation",
# and (b) on every commit that lands on main, via the trigger below.
 
trigger:
  branches:
    include:
      - main
# No "pr:" section. For Azure Repos, PR builds are switched on by the
# branch policy, not by YAML. (GitHub-hosted repos use "pr:" instead.)
 
pool:
  vmImage: ubuntu-latest   # Microsoft-hosted Linux agent: cheapest and fastest to start.
  # Self-hosted fallback (your own PC runs the build):
  # pool:
  #   name: Default
 
steps:
  # Hosted agents may not have the newest SDK preinstalled. Pin it explicitly
  # so a build never silently uses a different .NET version than your machine.
  - task: UseDotNet@2
    displayName: Install .NET 10 SDK
    inputs:
      packageType: sdk
      version: 10.0.x
 
  # "test" restores, builds and runs the tests in one go, then publishes the
  # results to the pipeline's Tests tab. Any failing test fails the step,
  # which fails the build, which blocks the PR. That's the whole point.
  - task: DotNetCoreCLI@2
    displayName: Build and run backend unit tests
    inputs:
      command: test
      projects: backend/tests/**/*.csproj
      arguments: --configuration Release
```
2. Commit it on a branch, then in Azure DevOps: **Pipelines → New pipeline → Azure Repos Git → your repo → Existing YAML file** → pick `azure-pipelines.yml` → Run.
   - **Gotcha:** new organizations may get **0 free Microsoft-hosted parallel jobs** until Microsoft approves a free-tier request (a form; typically 2–3 business days). If the run says no hosted parallelism, either request the grant or install a **self-hosted agent** on your PC (one is free, with unlimited minutes) and use the `pool: name: Default` block.
3. Add `.azuredevops/pull_request_template.md`:
```markdown
## Plan step
Phase X, Step X.Y — <title>
 
## What changed and why
 
## How I tested it
- [ ] Unit tests added/updated and passing locally
- [ ] Rebased on latest main
- [ ] Commits are tidy (no "wip"/"fix typo" commits)
```
4. Set the **branch policies on `main`** from §8.
5. Prove it works: open a PR with a deliberately failing test → the build goes red → **Complete is blocked**. Then fix it → green → the reviewer approves → complete with *Rebase and fast-forward*.
**Learn:** what CI is and why it runs on a clean machine (catches "works on my machine"); YAML basics (indentation is structure; lists use `-`; key: value); agents, pools, tasks and steps; why branch policies are enforced on the **server** (local hooks can be skipped).
 
**Done when:** a failing test blocks a PR; a passing, approved PR completes with a linear history visible in Fork.
 
---
 
### Phase 1 — Game engine (pure C#, test-driven)
 
**Goal:** all game rules in `BuzzerApp.Core`, proven by unit tests, with no web or database.
 
**Why start here:** this is the hardest logic and the part that must be correct. It's also in C#, your strongest language. It needs no UI, network or DB, so a failing test points at exactly one thing.
 
**Learn across the phase:** classes vs `record`s; enums; encapsulation (`private set`); guard clauses; Arrange/Act/Assert; **TDD red → green → refactor**; returning results vs throwing exceptions; `lock` and thread safety; injecting time with `TimeProvider` (and `FakeTimeProvider` in tests, from the NuGet package `Microsoft.Extensions.TimeProvider.Testing`); options/settings objects.
 
#### Step 1.1 — The very first test (where coding starts)
**Do:** create `tests/BuzzerApp.Core.Tests/GameTests.cs` and write the test **before** the class exists:
```csharp
public class GameTests
{
    [Fact]
    public void New_game_starts_in_Idle_phase()
    {
        // Arrange + Act
        var game = new Game(TimeProvider.System, new GameSettings());
 
        // Assert
        Assert.Equal(RoundPhase.Idle, game.Phase);
    }
}
```
It won't compile. That's **red**. Then create `RoundPhase.cs` (enum), `GameSettings.cs` (record with `BuzzWindow = TimeSpan.FromSeconds(2)` and the time limits) and `Game.cs` in Core, with just enough code to pass (**green**). Delete the template `UnitTest1.cs`.
 
**Learn:** why the test comes first; why `TimeProvider` and settings are passed in (so tests control time and configuration).
 
#### Step 1.2 — Phase transitions
**Do:** `EnableBuzzing(teamIds)`, `DisableBuzzing()`, `EndRound()` with guards. `EnableBuzzing` receives the current team IDs so the game knows when "every team has buzzed". Failures are reported with a small `GameResult` record (`Success`, `Error`) so the hub can tell a player "Buzzing is closed" without exceptions.
**Tests:** every valid transition, plus at least one invalid one per action.
**Learn:** the Result pattern vs exceptions (when each is right).
 
#### Step 1.3 — Team queue and grace window
**Do:** `Buzz(playerId, teamId)`:
- rejected unless `BuzzingOpen`;
- **lazy window check first**: if `WindowEndsAt` has passed, close now and reject;
- ignored if the team is already queued (reason: "Your team has already buzzed");
- the first accepted buzz sets `WindowEndsAt`;
- auto-close when every team is queued.
Also `Tick()` (closes the queue if the window has passed and returns whether anything changed) and `ResetBuzzers()`. Everything inside one `lock`.
**Tests:** order preserved; second buzz from the same team ignored; buzz after `FakeTimeProvider.Advance(2s)` rejected **without** calling `Tick()`; `Tick()` closes the queue; all-teams auto-close; reset clears the queue and window; **concurrency test** with `Parallel.For` (many players from 4 teams → exactly 4 entries, one per team, positions 1..4).
**Learn:** race conditions; why `List<T>` isn't thread-safe; what `lock` does; why to return copies of internal lists; why "lazy check + tick" beats relying on a timer alone.
 
#### Step 1.4 — Answering flow (needs Q2–Q5)
**Do:** on close → `Ready` with current = first entry; `StartTimer()` records `TimeProvider.GetUtcNow()`; `Drop()` marks the current team dropped and advances to the next (or `Exhausted`); `TimeLimitFor(position)`; `IsOverTime` computed.
**Tests:** use `FakeTimeProvider.Advance(...)` to test over/under time with no real waiting.
**Learn:** why tests must never use `Thread.Sleep`; deterministic tests.
 
#### Step 1.5 — Scoring rules (needs Q1)
**Do:** a pure `ScoreCalculator`: `amount × multiplier`, sign from Add/Remove, validation (amount > 0, multiplier ≥ 1). Team-total rule per Q1.
**Tests:** add, remove, multiply, invalid input.
 
#### Step 1.6 — Snapshot
**Do:** `GameSnapshot` record (phase, queue entries with team/buzzer name/position/status, current team, timer start, time limit, window end). Built by `game.GetSnapshot()` inside the lock.
**Learn:** immutable records as messages; why the snapshot is identical for every player (the client works out its own colour).
 
**Phase 1 done when:** all tests green locally **and** in the pipeline. `BuzzerApp.Core.csproj` has no ASP.NET/EF references. I can explain every state transition.
 
---
 
### Phase 2 — REST API + database
 
**Learn across the phase:** `Program.cs` line by line (builder, **DI container**, **middleware pipeline**); DI lifetimes (**Singleton** `Game` vs **Scoped** `DbContext`, and why mixing them wrongly causes bugs); EF Core (DbContext, entities, migrations); configuration (`appsettings.json`, Options pattern) and **User Secrets**; REST conventions and status codes; **DTOs vs entities**; validation; password hashing; cookie authentication.
 
| Step | Do | Done when |
|---|---|---|
| 2.1 | Read the template `Program.cs` together. Delete the weather sample. Bind `GameSettings` from `appsettings.json` | I can explain each line |
| 2.2 | Confirm **R1**. Add `Npgsql.EntityFrameworkCore.PostgreSQL` + `Microsoft.EntityFrameworkCore.Design`. Connection string in **User Secrets** (right-click project → Manage User Secrets). Create entities (§6) + `AppDbContext` in `Api/Data`. First migration (Package Manager Console: `Add-Migration Initial`, `Update-Database`) | Tables visible in pgAdmin. I can read the generated migration |
| 2.3 | Team endpoints: `GET/POST /api/teams`, `PUT /api/teams/{id}`, `DELETE /api/teams/{id}`. Unique index on `NormalizedName` | Duplicate name (any case) → `409 Conflict` |
| 2.4 | Confirm **R2**, Q6, Q7. `POST /api/session/join` {joinCode, displayName, pin, teamId}: new name → create; existing name + correct PIN → rejoin; wrong PIN → error. Hash with `PasswordHasher<T>`. Sign in with a cookie holding PlayerId/Name/TeamId/Role claims. `GET /api/session/me`. **Gotcha:** configure cookie auth to return `401` rather than redirecting to a login page | Join, rejoin and wrong PIN all behave correctly in Postman |
| 2.5 | Admin bootstrap: admin display name(s) in config; seeded as admin. `POST /api/players/{id}/promote` (admin only) | Co-host can be promoted |
| 2.6 | `GET /api/players` (admin), `PUT /api/players/{id}/team` (move) | |
| 2.7 | Scores: `POST /api/scores/adjustments` (uses Core's `ScoreCalculator`), `GET /api/scores/teams` (anyone), `GET /api/scores/players` (admin) | Totals correct from the ledger |
| 2.8 | Postman collection covering everything; export to `/postman` | Collection committed |
 
---
 
### Phase 3 — SignalR real-time layer
 
**Learn:** WebSockets (persistent two-way connection) vs HTTP request/response; what a **Hub** is; connection lifecycle (`OnConnectedAsync`/`OnDisconnectedAsync`); **groups**; `IHubContext` (pushing from outside the hub); `[Authorize]` on hub methods; why the hub is short-lived but `Game` is a singleton; **`BackgroundService`** and `PeriodicTimer`.
 
| Step | Do | Done when |
|---|---|---|
| 3.1 | Register `TimeProvider.System` and `Game` as **singletons**. `AddSignalR()`, `MapHub<GameHub>("/hubs/game")` | App starts |
| 3.2 | `GameHub.OnConnectedAsync`: add admins to group `"admins"`; send the current snapshot to the caller | A new connection receives the state |
| 3.3 | Player method: `Buzz()`. Player ID **and team ID come from the cookie claims, never from parameters** (otherwise anyone could buzz as anyone) | |
| 3.4 | Admin methods with `[Authorize(Roles = "Admin")]`: `EnableBuzzing`, `DisableBuzzing`, `ResetBuzzers`, `StartTimer`, `Drop`, `EndRound` | A non-admin call is rejected |
| 3.5 | After any change: `Clients.All.SendAsync("GameUpdated", snapshot)`. REST changes (teams, scores) also broadcast via `IHubContext` | All clients update together |
| 3.6 | `GameClock : BackgroundService`: `PeriodicTimer` every 100ms → `game.Tick()` → if it changed, broadcast via `IHubContext` | Queue closes 2s after the first buzz with nobody pressing anything |
| 3.7 | Manual test with a throwaway console client (`Microsoft.AspNetCore.SignalR.Client`) or two browser tabs. (Postman is awkward for SignalR's protocol) | Two clients see each other's buzzes instantly |
 
---
 
### Phase 4 — React fundamentals with fake data (biggest learning phase)
 
**Goal:** learn React properly by building every screen with **fake data**, with no networking. One new concept at a time.
 
**Learn, in this order** (each concept explained from zero, compared with C# where possible):
1. How a browser turns HTML/CSS/JS into a page; what Vite does (dev server, hot reload, bundling).
2. JS/TS essentials: `const`/`let`, arrow functions, objects/arrays, `map`/`filter` (≈ LINQ `Select`/`Where`), destructuring, `import`/`export`, `async`/`await` (≈ C# `Task`).
3. TypeScript: `type`/`interface`, union types (`"Idle" | "BuzzingOpen"`), optional fields.
4. JSX; components; **props** (≈ constructor parameters).
5. **State** (`useState`) and why changing state re-renders.
6. Events, conditional rendering, lists and `key`.
7. `useEffect` (side effects) and **why React StrictMode runs effects twice in development**.
8. Lifting state up; custom hooks.
9. CSS basics: box model, flexbox, making a circle, responsive sizing.
| Step | Do |
|---|---|
| 4.1 | Tour the template: `index.html`, `main.tsx`, `App.tsx`, `package.json` scripts. Change text, watch hot reload |
| 4.2 | `src/types/game.ts`: TS types mirroring `GameSnapshot`, `Team`, `PlayerScore` |
| 4.3 | `src/dev/fakeData.ts`: snapshots for every phase |
| 4.4 | `Globe` component (props: colour, label, sublabel, onPress, disabled) + CSS |
| 4.5 | Pure function `getGlobeState(snapshot, me)` + **Vitest** tests: first TS unit tests. **Add the frontend steps to `azure-pipelines.yml`** (see below) |
| 4.6 | `Stopwatch` component (admin + display only): counts up from a start instant using `requestAnimationFrame` or a 100ms interval |
| 4.7 | Screens: `JoinScreen` (code, name, PIN, team select), `PlayerScreen`, `AdminScreen` (split globe + timer, buzz toggle, Reset buzzers), `Leaderboard`, `AdminScoresGrid` (amount, multiplier, Add/Remove), `DisplayScreen` |
| 4.8 | Routing with `react-router`: `/`, `/play`, `/admin`, `/display`; read `?code=` from the URL |
| 4.9 | A dev-only dropdown to switch fake snapshots so every phase can be seen |
 
Pipeline addition for Step 4.5 (append to `steps:`):
```yaml
  - task: NodeTool@0
    displayName: Install Node.js LTS
    inputs:
      versionSpec: 24.x          # match the major version you use locally
 
  # "npm ci" (not "npm install") installs EXACTLY what package-lock.json says
  # and fails if package.json and the lock file disagree. Reproducible builds.
  - script: npm ci
    displayName: Install frontend packages
    workingDirectory: frontend
 
  # The Vite react-ts template's build script runs the TypeScript compiler
  # first, so type errors fail the pipeline even if no test covers them.
  - script: npm run build
    displayName: Type-check and build frontend
    workingDirectory: frontend
 
  # "vitest run" runs once and exits. Plain "vitest" starts watch mode,
  # which would hang the pipeline forever.
  - script: npx vitest run
    displayName: Run frontend unit tests
    workingDirectory: frontend
```
 
**Done when:** every screen renders correctly for every phase using fake data; Vitest is green locally and in the pipeline; I can explain props vs state.
 
---
 
### Phase 5 — Connect frontend to backend
 
| Step | Do | Learn |
|---|---|---|
| 5.1 | Vite **dev proxy**: `/api` and `/hubs` → backend URL (`ws: true` for hubs) | Why same-origin means no CORS config and cookies just work |
| 5.2 | `src/api/client.ts`: typed `fetch` wrapper | HTTP from the browser; error handling |
| 5.3 | Real join flow | Forms, loading/error states |
| 5.4 | `useGameConnection()` hook with `@microsoft/signalr`: `withAutomaticReconnect()`, `on("GameUpdated")`, buzz/admin actions | Custom hooks; connection lifecycle; StrictMode double-connect gotcha |
| 5.5 | On reconnect, and when the tab becomes visible again (`visibilitychange`), get a fresh snapshot | Why phones drop connections when locked |
| 5.6 | Remove fake data from real screens (keep it for tests) | |
| 5.7 | Test with 3+ browser windows **and** a real phone on the LAN (`npm run dev -- --host`) | |
 
---
 
### Phase 6 — Admin features
 
| Step | Do |
|---|---|
| 6.1 | Team management: create, rename, delete teams |
| 6.2 | Players list with ⋮ menu → **Move to** team, **Make admin** |
| 6.3 | Scores grid: player rows and team rows; amount + multiplier + Add/Remove; live totals |
| 6.4 | Score history list with an **undo** for the last adjustment (uses the ledger) |
 
---
 
### Phase 7 — PWA & polish
 
| Step | Do | Gotcha |
|---|---|---|
| 7.1 | `vite-plugin-pwa`: manifest, icons, `display: standalone` | **Don't cache API/hub responses.** A stale service worker on event day is a nightmare. Cache the app shell only, and use auto-update |
| 7.2 | Screen Wake Lock while on `/play`, `/admin` and `/display` | Re-request it after the tab becomes visible again |
| 7.3 | `/display`: QR code (e.g. `qrcode.react`) with join URL + code; lobby names grouped by team; big queue + timer | |
| 7.4 | UX: huge tap targets, text + colour, readable from arm's length, test on small phones | |
 
---
 
### Phase 8 — Deploy & rehearsal
 
| Step | Do |
|---|---|
| 8.1 | Production build: React `dist` copied into the Api's `wwwroot`, served by ASP.NET Core (`UseStaticFiles` + SPA fallback). One deployable, same origin |
| 8.2 | Confirm **R4**. Create resources the day before the event; enable WebSockets; set the connection string, join code and `GameSettings` in App Settings (not in code) |
| 8.3 | Optional: extend the pipeline with a deploy stage (multi-stage YAML: Build → Deploy) for work practice |
| 8.4 | **Rehearsal** with 5+ real phones: Wi-Fi *and* 4G, lock/unlock mid-round, refresh, rejoin on another browser, two admins at once, simultaneous buzzes from different and same teams, restart the server mid-game |
| 8.5 | Event-day checklist: QR on screen, admin accounts tested, backup plan ready (free online buzzer site or hands up), **delete Azure resources afterwards** |
 
---
 
## 10. Stretch goals (only after v1 works end-to-end)
- **S1** Team avatar picker (preset images).
- **S2** Replace the REST layer with **HotChocolate GraphQL** (queries/mutations) for work practice. SignalR stays.
- **S3** Floating name bubbles in the lobby.
- **S4** Automatic points by queue position.
- **S5** Sound effects (iOS needs a user tap before audio can play).
- **S6** Game setting to allow a dropped team's other players to answer (individual mode).
- **S7** Mirror the repo to public GitHub for the CV.
---
 
## 11. Glossary
| Term | Plain English |
|---|---|
| PWA | A website that can be installed to the home screen and opens full-screen like an app |
| SPA | Single-page app: one HTML page, and JavaScript swaps the screens |
| WebSocket | A connection that stays open so the server can push messages at any time |
| SignalR | Microsoft's library that manages WebSocket connections, reconnection and groups for you |
| Hub | The SignalR class whose methods clients call, and which sends messages to clients |
| BackgroundService | A class ASP.NET Core runs in the background for the app's whole lifetime (here: the game clock) |
| Grace window | The short time after the first buzz during which other teams can still join the queue |
| DI | Dependency Injection: the framework creates objects and hands them to whoever needs them |
| DTO | Data Transfer Object: the shape sent over the wire, separate from the DB entity |
| ORM / EF Core | Maps C# classes to database tables so you rarely write SQL by hand |
| Migration | A versioned C# script describing a database schema change |
| TDD | Test-Driven Development: write a failing test, make it pass, tidy up |
| JSX | HTML-like syntax inside TypeScript that React turns into UI |
| Props / State | Props = inputs given to a component; State = data a component owns and changes |
| Race condition | A bug where the result depends on which thread happens to run first |
| CI | Continuous Integration: every change is built and tested automatically on a clean machine |
| PR | Pull Request: a request to bring your branch into `main`, where it's reviewed and tested first |
| Branch policy | Server-side rules on a branch (reviewers, passing build, allowed merge types) |
| Rebase | Replaying your commits on top of another branch, giving a straight-line history |
| Fast-forward | Moving `main`'s pointer forward to your commits without creating a merge commit |
| `--force-with-lease` | A safe force-push that refuses if someone else pushed in the meantime |
| Agent | The machine that runs a pipeline: Microsoft-hosted (cloud) or self-hosted (your PC) |