# F9 progress (working note)

> **Audience:** the developer, and the AI session that continues F9.
> F9 runs over more than one session. This file says where it has got to. It is deleted when F9 is marked done (its findings move into the F9 DONE note in `docs/FrontendSteps.md`).
> To continue: read "Where it stopped" below first. It names the exact next action.

## Where it stopped (11 Nov 2026, fourth session)

**State of the repo:** branch `frontend-f9`, last code commit `Let the score form's drop-down shrink to a phone's width`, nothing uncommitted. `npm run lint`, `npm run build` and `npm test` (1356 tests in 89 files) all pass. Nothing is pushed.

**Exact place:** part 2 (the live walkthrough) is finished except its last item. Steps 1 and 2 of the old list are done: M5 and M6 were re-checked in a real browser (M5 was not fully fixed; it is now, see the table), and the walkthrough passes **106 of 106 checks** in each of three set-ups: arcade pack with six teams, `default` pack with three teams (one with a 24-character name), arcade pack with eight teams (one with a 24-character name, two with icon keys the pack doesn't know). The only finding it still prints is H3, which waits for the developer.

**What to do next, in order:**

3. **The last walkthrough pass: once through the Vite dev server** (it proxies to port 5283, so start the scratch API on 5283 for that pass: `startApi({ joinCode, port: 5283 })`, and run the script with `BASE=http://localhost:5173`). Also check M1 there: open the app with the API stopped, start it, press "Try again", and the event name and theme arrive. Put the scratch `api/appsettings.json` back first (`appsettings.arcade6.json` next to the `api` folder is the original).
4. **Part 3:** rework `docs/ManualTestChecklist.md` into one start-to-finish session (read its "For AI workers" section first): set-up at the top, duplicates merged, rows that F9 made wrong removed, rows added for H1, H2, M2, M5, M6 and H3, section 7 "Whole-evening run" filled, rows the live walkthrough proved marked as such. Tick nothing. Commit as `Add F9 manual checks`.
5. **Part 4, wrap up:**
   - Ask the developer, **one question at a time**: first H3 (may the backend send the change messages after a registration?), then M4 (should Export work without Finalize first?). Both are backend changes, so the answer may be "do it in a backend step"; record whichever is decided.
   - Tell the developer the two things that are a matter of taste (see "Seen, not changed").
   - Put Appendix B of `docs/FrontendSteps.md` in priority order as the Playwright backlog, adding H1, H2, M2, M5 and M6 (none can be shown in jsdom).
   - Update `docs/PlanMVP.md`, `CLAUDE.md` and `docs/FrontendSteps.md` (the F9 DONE note with the findings below, deviations, and what was not checked by hand; the steps table; the "start at" line), and add a `docs/DecisionLog.md` entry.
   - Delete this file. Last commit: `Mark F9 done in FrontendSteps`.
6. **Clean up:** `docker rm -f buzzer-f9-uat`; make sure no `dotnet BuzzerApp.Api.dll` is left on port 5290 or 5283; confirm `git status` shows nothing from the walkthrough.
7. **Finish** with a plain-words summary for the developer: what was fixed and why, and which manual checks were not run.

## Order of work

| # | Part of the brief | What it is | Status |
|---|---|---|---|
| 1a | 1. Review | Read the whole frontend against the shared rules; write the findings below, by severity | **done** (11 Nov 2026) |
| 1b | 1. Review | Fix the findings in small commits, each with a test that failed first where one is possible | **done** except H3 and M4, which wait for the developer. 1355 tests, lint and build clean |
| 2 | 2. Live walkthrough | Separate PostgreSQL container, API in Production mode serving the built frontend, real browsers driven by a throwaway script; then once through the Vite dev server; another team count; the `default` pack | **in progress**, about half way (see "Where it stopped"). Found H2, H3, M5 and M6 so far |
| 3 | 3. Manual walkthrough | Turn `docs/ManualTestChecklist.md` into one start-to-finish session; fill section 7; mark what the live walkthrough proved | not started |
| 4 | 4. Wrap up | Export-before-finalize decision (the developer's); deployment notes for Milestone R; Appendix B in priority order; PlanMVP / CLAUDE.md / DecisionLog; mark F9 done | not started |

## Baseline (before any F9 change)

`npm run lint` clean, `npm run build` with no notices (main chunk 480 kB, Fluent 414 kB, admin chunks 3 to 15 kB), `npm test` 1310 tests in 83 files, all passing.

## What was read

Every doc in `docs/`, `../OriginalFullPlan.md`, and all of `frontend/src` outside the tests: `app/`, `mvvm/`, `stores/`, `realtime/`, `api/`, `domain/`, every view model, the pages, the shared components and the theme root and registry. The tests were checked by search and by a script, not read one by one (see "Checked and found fine").

## Findings

Severity: **High** = would hurt on event day. **Medium** = wrong behaviour in a case that can happen, or a duplicate the brief names. **Low** = code quality (a rule written twice, a stale comment).

| # | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| H1 | High | **The app has no error screen.** Three files are downloaded on demand: the event's theme pack and the admin screens. If one fails to arrive (flaky Wi-Fi, or a phone still holding the page from before a redeploy, asking for files that no longer exist), React throws. Inside the routes, react-router then shows its own developer page ("Unexpected Application Error!" with a stack trace); outside them (the theme pack) the whole page goes blank. Either way the only way back is to know to reload. The same happens for any unexpected error while a screen draws | One error screen in `app/` with a "Reload" button, used as the route tree's `ErrorBoundary` and around the theme load | **fixed** (`components/ErrorScreen`, `app/errorBoundaries`; inside the shell the header and navigation stay) |
| H2 | High | **After any dialog closes, the whole app stays hidden from screen readers, and the keyboard is dropped.** Found by the live walkthrough. While a dialog is open Fluent marks the rest of the page `aria-hidden`. The app closed a dialog by no longer rendering it, while it was still open, so Fluent never got to undo that: on screens where the dialog was the only Fluent focus-managed control (a player's Teams screen, the admin's Event screen) `#root` kept `aria-hidden="true"` until a reload, and everywhere the focus fell to the page body instead of returning to the button that opened the dialog. Sighted touch users saw nothing wrong | Dialogs are now closed by telling them `open={false}` while still on the page (`FormDialog.open`, `useLastDefined`), and the opening buttons are marked as where focus returns (`useRestoreFocusTarget`) | **fixed**; checked in a real browser (page un-hidden, focus back on ✎ / Add team / Finalize). jsdom can't show it, so it is also in Appendix B |
| H3 | High | **A newly registered player does not appear on anyone else's phone.** Found by the live walkthrough. Registration (`POST /api/session/register`) sends no `TeamsChanged` / `ScoresChanged`; every other write does. So as people join, the Teams screen (the "lobby"), the join screen's head counts, the admin's player list and the "Team or player" picker stay as they were until something else changes or the phone reconnects | **A backend change**: `SessionService` should call `TeamsAndScoresChangedAsync()` after a successful registration (one line, plus a case in `WriteNotificationTests`). The frontend already reloads on those messages | **waiting for the developer** (the F-steps may not change the backend without asking) |
| M1 | Medium | **The event is asked for once and never again.** If the server can't be reached when the app opens, the guard offers "Try again", but that only re-asks the session. The app then runs in the default theme with no event name until someone reloads by hand (Appendix B's F2 row left this for F9) | "Try again" also reloads the event when its load failed | **fixed** (`RouteGuardViewModel`) |
| M2 | Medium | **A session that ends while the phone is connected leaves the player on "Reconnecting…" for good.** The hub refuses the reconnect (401), the connection retries for ever, and nothing asks `/me` until the phone is locked and unlocked or a screen makes a REST call (`/play` makes none). F4 recorded this as a known limit. It matters after a server restart that loses the cookie keys (PlanMVP R2, item 6) | `RealtimeCoordinator` re-reads the session when a connection attempt fails; a 401 then signs the person out and the guards show the join screen | **fixed** (`GameConnection.onAttemptFailed`, `reconnectPolicy`, `RealtimeCoordinator`) |
| M3 | Medium | **`JoinViewModel` has its own copy of "server error → field messages"** (`showServerFieldErrors`, `isJoinField`, `edited`), the same rule as `mvvm/FormSubmission.ts` (`readFailure`, `fieldEdited`). Named in the brief | **fixed**: the join screen now reads a failure with the shared `readFailure` (its own `showServerFieldErrors` and `isJoinField` are gone). It keeps its own submit cycle rather than a `FormSubmission`, on purpose: a failure there is more than a sentence (a rate-limit countdown that outlives edits and holds the button; "Sign in instead" on a taken real name), and `FormSubmission` would need three members only this screen uses. The reason is in the class comment |
| M4 | Medium | **Export needs a Finalize in the same visit** (F8's open item). Not a code fault: the event id is only in the finalize answer | The developer decides (see below) | waiting |
| M5 | Medium | **The admin's Scores screen is wider than a phone.** Found by the live walkthrough. At 360 px the page was 415 px wide: it scrolled sideways and the bottom navigation hung partly off the screen. The "Points / Multiplier" row was a grid of two `1fr` columns, and a `1fr` column never shrinks below its content's minimum width, which for a text box is its default size | The columns are `minmax(0, 1fr)`, **and** every text box and drop-down may get narrower than its built-in width (`minWidth: 0`). The first half alone was not enough: the re-check still measured 381 px, because Fluent's `Field` has its own inner grid that kept each text box at its twenty-character default; and with a 24-character team name the page was 373 px, because a drop-down asks for the width of its longest option | **fixed** (`AdjustmentEntryForm`, `components/useFieldControlStyles.ts`, which is now the one place the join screen, the dialogs and the score form take their text-box and drop-down sizing from; the join screen had its own copy). Re-checked in a real browser: every admin screen measures exactly 360 px, with six teams and with eight including a 24-character name. jsdom has no layout, so there is no automated test: Appendix B and the manual checklist |
| M6 | Medium | **After a dialog is submitted (not cancelled), the keyboard focus falls to the page body.** Found by the live walkthrough; the rest of H2. While the request runs the confirm button became `disabled`, and a disabled button drops the focus it holds, so when the dialog closed there was no focus to hand back to the button that opened it | The confirm button is held with `disabledFocusable` (it keeps the focus and reads as unavailable), and the form ignores a submit while one is running, which is what `disabled` did before | **fixed** (`FormDialog`, with two tests that failed first). Re-checked in a real browser: after Save, Rename and Add team the focus is on the button that opened the dialog |
| M7 | Medium | **The join screen had lost its side padding and its centred width.** A mistake made by F9's own fix for L2, found in the walkthrough's screenshots: the shared page frame leaves the padding to the app shell, and the join screen is the one screen shown outside the shell, so its text and boxes touched the edges of the phone | The join screen adds its own padding and maximum width to the shared frame (`outsideShell` in `JoinPage`) | **fixed**; seen in the screenshots of both packs. A look, so no automated test: the manual checklist |
| L1 | Low | The map "team id → colour and icon key" is built by the same three lines in `PlayViewModel` and `HostViewModel` | **fixed** (`teamLooksById`) |
| L2 | Low | Seven pages each carry their own copy of the page, heading and section styles (with the same comment), and the 44 px tap-target size is written in about twenty places | **fixed** (`components/usePageStyles.ts`, `components/sizes.ts`). The dev-only theme preview keeps its own headings |
| L3 | Low | `TeamPicker` and `TeamStylePicker` repeat the same radio-card frame (fieldset, legend, grid, card, focus ring, error line) | **fixed** (`components/RadioCards.tsx`: `RadioCardGroup` and `RadioCard`, with its own test) |
| L4 | Low | `compareNames` compares lower-cased names; the server orders by upper-cased ones. Names containing `_`, `[`, `]`, `^` or a backtick sort differently in the admin's "Sort by Team" than on the Teams screen | **fixed** |
| L5 | Low | Types written twice: `ConnectionName` (domain) and `ConnectionState` (realtime); `ScoreTargetKind` / `ScoreDirection` (domain) and `ScoreTarget` / `ScoreDirection` (api) | **fixed** (also `PlayerRole` / `Role`, found while doing it) |
| L6 | Low | A few comments tell the build history instead of the reason ("arrives in F4", "(F6)", "a decision for F9") | **fixed**, except the note in `EventAdminViewModel` about the export decision, which goes when M4 is decided |
| L7 | Low | The browser tab's title stays "Buzzer"; F0 expected the event's name to replace it | Optional. Belongs with R1's web manifest (the home-screen name); noted for Milestone R | note only |
| L8 | Low | Twelve test assertions only check that a message exists (`toBeDefined()`). Fine where the text is the server's; weaker where the app wrote the sentence | **fixed** for the app's own sentences (9 assertions); the rest are preconditions inside a test whose real assertion follows |

### Checked and found fine

- **Layers.** Lint proves the imports. Read for leaks: no view uses `useState`, `useEffect` or `useMemo`; every exported component is an `observer`; no view sorts, filters or decides. Two view models call an API class directly (`JoinViewModel` → `EventApi.getJoinTeams`, `EventAdminViewModel` → `ArchiveApi`). Both are documented choices (F2, F8): a store would only pass the call through, since nothing is kept or shared. Left as they are.
- **Other years.** No 2026 team name, colour key, icon key or team count outside `packs/arcade-2026/` (searched code and tests).
- **Lifecycle (F4's eight rules).** Re-read against `RealtimeCoordinator`, `RoundStore` and `SignalRGameConnection`. Rules 1–8 hold as the DONE note says; M2 is the one gap.
- **Security and privacy.** Hub methods take no arguments; real names are shown only where the server sent them; the only browser storage is the join code; the export is a plain link; `/dev/*` routes are absent from the production build (searched `dist/`); admin routes sit behind `AdminGuard` and the admin chunks are only requested by an admin route.
- **Tests.** No real timers, no `skip` / `only`, no `any`, `@ts-ignore` or disabled lint rule. A script found no test without an assertion (739 test blocks). The page tests over MSW are 1300 of about 10 000 test lines, so they don't repeat the unit tests.
- **Lists.** React keys are ids everywhere except one list on the dev-only preview page.

## Walkthrough set-up (nothing here is in the repo)

- Database: container `buzzer-f9-uat` (`postgres:16-alpine`, port 5437). **Remove it when F9 is done:** `docker rm -f buzzer-f9-uat`.
- API: `dotnet publish` of the Api into the session scratchpad, with the built frontend copied into its `wwwroot`, run in Production mode on port 5290 with environment variables (its own join code and admin). The repo's `wwwroot`, the dev database and User Secrets are not touched.
- Browsers: a throwaway Playwright script (Edge, headless, 360 px wide phone contexts) in the scratchpad. Each run uses a new join code, which the server treats as a new event.
- **Where the scratch files are:** `C:\Users\numan\AppData\Local\Temp\claude\18ac847a46a2a0ef\bb254bb7-936c-40ea-b90d-91b43b4d3ff4\scratchpad` (a temporary folder outside the repo; a new session may have to ask before it reads or runs things there).
  - `api\`: the published API. Its `wwwroot` must be replaced after every frontend build: delete it, then copy `frontend/dist/*` in.
  - `walk\lib.mjs`: helpers. `startApi({ joinCode })` starts `dotnet BuzzerApp.Api.dll` on port 5290 with the environment variables (connection string to port 5437, the join code, an admin "Uat Host" / "Hosty" / PIN 4321, migrate on start); also `stopApi`, `launch`, `newPerson`, `register`, `signIn`, `apiRegister`, `check`, `summary`, `overflowsSideways`.
  - `walk\walk.mjs <label>`: the whole walkthrough (join errors, register / refresh / sign out / sign in, taken names and the rate limit, names visibility, team edits, scores, two rounds, an API restart mid-round, promotion with two hosts, the guards, finalize and export, H1, M2, console errors). Run from `walk\` with `node walk.mjs arcade6`.
  - `walk\probe-wide.mjs`, `walk\probe-dialog4.mjs`, `walk\probe-nav.mjs`: small checks of one thing each. `walk\shots\`: screenshots.
- **If that folder is gone,** rebuild it: `dotnet publish backend/src/BuzzerApp.Api -c Release -o <scratch>/api`, copy `frontend/dist` into its `wwwroot`, `npm install playwright-core` in a scratch folder, and drive the installed Edge with `chromium.launch({ channel: 'msedge', headless: true })`. Start the container with `docker run -d --name buzzer-f9-uat -e POSTGRES_USER=uat -e POSTGRES_PASSWORD=uat-f9-throwaway -e POSTGRES_DB=buzzer_uat -p 127.0.0.1:5437:5432 postgres:16-alpine` if it is not running.
  - `deploy.sh` (next to the `api` folder): builds the frontend and replaces the scratch `wwwroot`. `appsettings.arcade6.json` (the original), `appsettings.default3.json` and `appsettings.arcade8.json`: copy one over `api/appsettings.json` to choose the set-up, then `node walk.mjs <label>`.
- **Things the script had to learn** (all fixed in the fourth session; kept here because they say something about the app or about Playwright):
  1. A name such as "Extra 1" also matches "Extra 10"; `getByLabel('Points')` also matches the section "Add or remove points"; Fluent's message bar is `role="group"`, not `alert`.
  2. The ready buzzer pulses, and Playwright waits for an element to stop moving before it taps, so it never tapped: use `tap({ force: true })`. The same for two hosts pressing Begin together (the second press may find the button already greyed).
  3. Once a team is in the queue its teammates' buzzers stop being pressable (by design), so a teammate's "not counted" buzz only happens when both press before the first answer comes back: the script presses them in one `Promise.all`.
  4. A phone-emulated page widens itself to fit content that is too wide, so "does it scroll sideways" must compare with the screen's width (360), not with the window's. The earlier version of that check could not fail. When a page is too wide, Playwright's clicks also land in the wrong place ("the form intercepts pointer events"): that symptom means "measure the page", not "the button is broken".
- Writing a script inside a Bash heredoc kept failing on quoting. Write the file with the Write tool and run it with `node <file>`.

## Seen, not changed (for the developer to judge)

Both are in the arcade pack at 360 px wide. Neither breaks anything; they are about looks, so they are the developer's call.

- **Team names break in the middle of a word on the team cards** ("Rage Quitter / s", "AFK Allstar / s"). `TeamCard` shows the name at `fontSizeBase500` with `overflowWrap: anywhere`. A smaller size on narrow screens, or breaking only between words, would fix it.
- **The header is tall.** The event's name wraps to three lines next to the person's name and "Sign out", about 180 px of a 740 px screen.

## For Milestone R (found during the review; nothing to do in F9)

- **Caching of `index.html`.** The API serves it through `UseStaticFiles()` with no `Cache-Control`, so a browser may reuse a copy for a while without asking (it guesses from `Last-Modified`). After a redeploy that phone asks for script files that no longer exist. R1 or R3 should send `Cache-Control: no-cache` for `index.html` and a long `max-age` with `immutable` for `/assets/*` (their names carry a hash). This is a backend change in `HostingSetup`. H1's error screen is the safety net for the phones that still get caught.
- L7 (the page title) and the white flash before a dark theme loads (the splash has no styling) belong with the web manifest work.

## Decisions waiting for the developer

- **H3:** may the backend send `TeamsChanged` / `ScoresChanged` after a successful registration? It is one call in `SessionService` plus a test case. Without it the Teams screen is not a live lobby while people join. Ask this one first: it matters more on the night.
- **M4, F8's open item:** should Export work without pressing Finalize first in the same visit? It needs the event id on `GET /api/event` (one field in `EventInfoResponse`, a backend change), or a new `GET` that says whether an archive exists. Today: Finalize, then Download, and finalizing again is harmless.
