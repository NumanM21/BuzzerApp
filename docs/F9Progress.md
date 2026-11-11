# F9 progress (working note)

> **Audience:** the developer, and the AI session that continues F9.
> F9 runs over more than one session. This file says where it has got to. It is deleted when F9 is marked done (its findings move into the F9 DONE note in `docs/FrontendSteps.md`).
> To continue: "Read CLAUDE.md, the F9 brief in docs/FrontendSteps.md and docs/F9Progress.md, then continue F9."

## Order of work

| # | Part of the brief | What it is | Status |
|---|---|---|---|
| 1a | 1. Review | Read the whole frontend against the shared rules; write the findings below, by severity | **done** (11 Nov 2026) |
| 1b | 1. Review | Fix the findings in small commits, each with a test that failed first where one is possible | **done** except M4, which waits for the developer. 1347 tests, lint and build clean |
| 2 | 2. Live walkthrough | Separate PostgreSQL container, API in Production mode serving the built frontend, real browsers driven by a throwaway script; then once through the Vite dev server; another team count; the `default` pack | **in progress.** Set up and running (see "Walkthrough set-up"); first runs found H2 and H3 |
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

## For Milestone R (found during the review; nothing to do in F9)

- **Caching of `index.html`.** The API serves it through `UseStaticFiles()` with no `Cache-Control`, so a browser may reuse a copy for a while without asking (it guesses from `Last-Modified`). After a redeploy that phone asks for script files that no longer exist. R1 or R3 should send `Cache-Control: no-cache` for `index.html` and a long `max-age` with `immutable` for `/assets/*` (their names carry a hash). This is a backend change in `HostingSetup`. H1's error screen is the safety net for the phones that still get caught.
- L7 (the page title) and the white flash before a dark theme loads (the splash has no styling) belong with the web manifest work.

## Decisions waiting for the developer

- **M4, F8's open item:** should Export work without pressing Finalize first in the same visit? It needs the event id on `GET /api/event` (one field in `EventInfoResponse`, a backend change), or a new `GET` that says whether an archive exists. Today: Finalize, then Download, and finalizing again is harmless.
