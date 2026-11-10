# Frontend steps F0–F9 — implementation briefs

> **Audience:** AI workers implementing one step each in a fresh session, and the developer who starts and reviews them.
> Adds implementation detail to `docs/PlanMVP.md` §10 Milestone F. **PlanMVP wins on product decisions; this file wins on frontend implementation detail.**
> Written 10 Nov 2026. **F0, F1 and F2 are done: start at F3.**
>
> The backend is finished and is not changed by these steps. If a step seems to need a backend change, stop and ask the developer.

| Step | Branch | Suggested model | Scope |
|---|---|---|---|
| F0 | `frontend-f0` — **DONE** | **Opus 5.5** | Packages, tooling, folders, composition root, MVVM base, theme contract + `default` pack + `/dev/theme`, guard tests, CI. Sets the patterns every later step copies |
| F1 | `frontend-f1` — **DONE** | Sonnet 5.5 | `arcade-2026` theme pack, spare team colours, `docs/ThemePacks.md` (how to add next year's pack) |
| F2 | `frontend-f2` — **DONE** | Sonnet 5.5 | API client, wire types, one API class per feature, stores, MSW handlers, test factories |
| F3 | `frontend-f3` | Sonnet 5.5 | `/join` (new player / sign in), route guards, layout shell + navigation |
| F4 | `frontend-f4` | **Opus 5.5** | SignalR connection, round store, server clock, session and connection lifecycle, buzzer state rule |
| F5 | `frontend-f5` | Sonnet 5.5 | `/play`: buzzer and team queue |
| F6 | `frontend-f6` | Sonnet 5.5 | `/teams`: team cards, edit names, rename, move, make admin, create and delete team |
| F7 | `frontend-f7` | Sonnet 5.5 | `/scores` leaderboard; `/admin/scores` adjustments and undo |
| F8 | `frontend-f8` | Sonnet 5.5 | `/admin` host screen; `/admin/event` finalize and export |
| F9 | `frontend-f9` | **Fable** | Whole-frontend review, live walkthrough against the real backend, fixes |

Opus is suggested where a mistake is expensive: F0 fixes the architecture for every later step, and F4 has lifecycle and timing bugs that only show up on a real phone. If a Sonnet step goes wrong twice on the same point, rerun that step on Opus.

---

## Developer guide (what you do by hand)

Nothing here is done by the AI worker. Each brief ends with a **Developer does** list for anything specific to that step.

### One-time setup (before F0)

1. **Node.** `node -v` must show 24 or newer (CI uses 24).
2. **VS Code extensions.** ESLint (`dbaeumer.vscode-eslint`). Optional: Vitest (`vitest.explorer`) to run tests from the editor.
3. **Backend running locally** (needed from F2 on, to try the app; the tests never need it):
   - Repo root: `docker compose up -d` (the dev PostgreSQL on port 5434).
   - Start the API: Visual Studio with the **http** profile, or `dotnet run --project backend/src/BuzzerApp.Api --launch-profile http`.
   - Check: `http://localhost:5283/healthz` shows `Healthy`.
   - The join code and admin sign-in are whatever your User Secrets hold (B2 set `DEV-2026`, real name `Dev Admin`, PIN `1234`, unless you changed them).
4. **Frontend running locally:** in `frontend/`, `npm install` once, then `npm run dev`. Open `http://localhost:5173`. Vite forwards `/api` and `/hubs` to the API, so the browser only ever talks to port 5173 (same origin, cookies work).
5. **A phone on your Wi-Fi** (from F3 on):
   - `npm run dev -- --host`. Vite prints a `Network:` address such as `http://192.168.1.20:5173`.
   - The first time, Windows asks whether Node may accept connections: allow it for **Private networks**.
   - Open that address on the phone (same Wi-Fi). Plain http works in Development. The API does not need to be reachable from the phone; Vite proxies to it.

### The loop for every step

1. Update `main` and create the branch: `git switch main`, `git pull`, `git switch -c frontend-f<n>`. (If the previous step is not merged yet, branch from the previous step's branch instead.)
2. Start a **new chat** with the suggested model and paste:
   ```
   Read CLAUDE.md. Then read docs/FrontendSteps.md: "Shared rules for every worker",
   the "F<n>" brief, and Appendix A. Read only the PlanMVP sections the brief names.
   Do F<n>.
   ```
3. The worker builds, tests, commits (no push, no PR) and finishes with a summary and a DONE note in this file.
4. You review: read the summary, run `npm run dev`, try the step's **Check**, look at `/dev/theme`.
5. Push and open the PR yourself: `git push -u origin frontend-f<n>`. CI (`backend` and `frontend` jobs) must be green. Merge with "Rebase and merge".

No GitHub settings change during Milestone F: the `frontend` check already exists and stays required.

---

## Shared rules for every worker

### What to read (and what not to)

- Read `CLAUDE.md`, this section, your step's brief and Appendix A. From `docs/PlanMVP.md` read §0, §1 and §9, plus any section or decision (D-number) your brief names.
- **Do not read** `docs/BackendSteps.md` (99 KB of backend history), `docs/DecisionLog.md` (history for the developer) or `../OriginalFullPlan.md`. Appendix A replaces PlanMVP §8 and the C# contracts for normal work. Open a C# file only when Appendix A seems wrong or incomplete; the C# contract wins, and you say so in your DONE note.
- Read the DONE notes of earlier F-steps in this file. They record what exists and every deviation.

### Process

- The developer's prompt "Do F<n>" counts as "go". Don't stop to propose a file list. Stop and ask only when the brief is unclear, looks wrong, or needs a decision that isn't yours (a PlanMVP decision, a backend change, a new package not listed in the brief).
- **Branch:** work on the checked-out branch, which must be `frontend-f<n>`. If it is `main` or another step's branch, stop and tell the developer. Never create, switch or delete branches.
- **Commits:** small, one logical change each, in the imperative ("Add the API client"). **No push, no PR.** No Claude attribution (no `Co-Authored-By`, no "Generated with" line).
- **Done** means all of these pass in `frontend/`, with zero warnings: `npm run lint`, `npm run build`, `npm test`. Plus the step's own **Check**. Never disable a lint rule, skip a test, add `// @ts-ignore` or use `any` to get there. If a rule seems wrong, ask.
- **Finish** with a short summary for the developer (a few paragraphs): what was built, why it is shaped that way, anything non-obvious. The developer reads C# well and is new to React, TypeScript and MobX, so explain frontend ideas in plain words and compare with C# where it helps.
- **Mark the step done in this file as your last commit:** in the table, change the branch cell to `` `frontend-f<n>` — **DONE** ``; add ` — DONE` to the step's heading; add a "Kept for reference; **do not redo.**" note above the brief listing what exists, every deviation from the brief, and what later steps must know; if something affects a later step, add it to that step's brief too; append your rows to Appendix B; update the "start at F<n>" line at the top. Commit as `Mark F<n> done in FrontendSteps`.
- Comments explain *why*, not *what*.
- **Packages:** install only what your brief lists. Look up the current stable version (`npm view <name> version peerDependencies`); never guess, and never use `--force` or `--legacy-peer-deps`. Several libraries are newer than you may expect (MobX 7, react-router 8, Vitest 5, MSW 3, TypeScript 6, Vite 8, ESLint 10): **check their current documentation instead of writing from memory.** Versions confirmed on 10 Nov 2026 to accept React 19 and Vite 8: `@fluentui/react-components` 9.75, `@fluentui/react-icons` 2.0, `react-router` 8.5, `mobx` 7.1, `mobx-react-lite` 5.1, `@microsoft/signalr` 10.0, `vitest` 5.1, `msw` 3.0, `@testing-library/react` 16.3, `jsdom` 31.
- **Don't touch** `backend/`, the developer's Docker database, or User Secrets. Don't run `docker compose`. The tests need none of them.
- Keep committed scripts cross-platform (`npm` scripts only). CI runs on Linux: import paths are case-sensitive there, so match file names exactly.

### Architecture: MVVM with MobX

The app is split so that **all logic lives in plain classes that can be tested without a browser or React** (decision D34). Dependencies point one way only:

```
 views (.tsx)  →  view models  →  stores  →  services (API classes, GameConnection)
                        ↘           ↓
                         domain (pure functions and types; imports nothing)
 theme  ← used by views and components only
```

| Layer | Folder | What it is | May import | Must not import |
|---|---|---|---|---|
| Domain | `src/domain/` | Pure functions and types: buzzer state, sorting, validation, formatting. No state | other `domain/` files | everything else, including `mobx` and `react` |
| Services | `src/api/`, `src/realtime/` | Plain classes behind interfaces that talk to the server. No MobX, no React | `domain/` | `mobx`, `react`, Fluent, `stores/`, `features/` |
| MVVM helpers | `src/mvvm/` | `Loadable<T>`, `Command`, MobX configuration | `mobx`, `api/` types | `react`, `stores/`, `features/` |
| Stores | `src/stores/` | MobX classes that live as long as the app. Own server data, loading state and subscriptions | `mobx`, `mvvm/`, `api/`, `realtime/`, `domain/` | `react`, Fluent, router, `theme/`, `features/`, `components/` |
| View models | `src/features/<f>/*ViewModel.ts` | One MobX class per screen or dialog. State, computed values ready to render, commands | `mobx`, `mvvm/`, `stores/`, `domain/`, **types** from `api/` and `realtime/` | `react`, Fluent, router, `theme/`, `components/`, the DOM (`window`, `document`, `localStorage`) |
| Views | `src/features/<f>/*.tsx` | React components. Render the view model, call its commands | `react`, Fluent, router, `mobx-react-lite`, own view model, `components/`, `theme/`, hooks from `app/` | `api/`, `realtime/` (types only), store methods (go through the view model) |
| Components | `src/components/` | Shared presentational components. Props in, events out | `react`, Fluent, `mobx-react-lite`, `theme/`, `domain/` types | `stores/`, `api/`, `realtime/`, `features/`, `app/` |
| Theme | `src/theme/` | Pack contract, packs, `ThemeRoot`, token helpers | `react`, Fluent, `domain/` types | `stores/`, `api/`, `features/` |
| App | `src/app/` | Composition root: builds services and stores, routes, guards, `useViewModel` | everything | — |
| Test support | `src/test/` | Setup, factories, fakes, `renderWithApp` | everything | imported by tests only |

F0 turns this table into ESLint rules (`no-restricted-imports` per folder), so a wrong import fails `npm run lint`. Imports across folders use the `@/` alias (`@/stores/TeamsStore`); imports inside a folder use `./`.

**The four rules of MVVM here**

1. **A view has no logic.** It reads properties of its view model and calls its commands. No `fetch`, no rules ("if phase is open and my team…"), no sorting or filtering, no formatting beyond what the theme decides. `useState` is allowed only for throwaway UI state that nothing else cares about (a menu being open). If you are writing an `if` in a view that isn't "which element do I show for this already-decided state", it belongs in the view model.
2. **A view model has no React and no look.** No JSX, hooks, Fluent, DOM, colours, fonts or theme flavour text. It exposes *meaning* (`buzzerState: 'queued'`, `queuePosition: 2`, `canBegin: true`), and the view and theme decide how that looks and reads. Its dependencies arrive through the constructor, typed as interfaces or store classes, so a test passes fakes. Errors are caught and exposed as observable state (`error`, `fieldErrors`); a view never needs `try`/`catch`.
3. **A store owns server data.** One store per kind of data. It calls an API class, keeps `Loadable` state, reloads when the hub says the data changed, and offers the write methods. After a successful write a store **reloads itself**; it never waits for the hub notification (that is for other people's phones, and the hub may be reconnecting).
4. **A service knows nothing about the UI.** API classes and `GameConnection` are plain async classes with an interface each (`TeamsApi`, `GameConnection`), so tests swap in fakes from `src/test/fakes/`.

**How a screen is wired** (F0 provides `useViewModel` and one worked example):

```tsx
// features/teams/TeamsPage.tsx — the view
export const TeamsPage = observer(function TeamsPage() {
  const vm = useViewModel((services) => new TeamsViewModel(services.teams, services.session));
  // render vm.cards, call vm.renameTeam(...)
});
```
```ts
// features/teams/TeamsViewModel.ts — the view model (no React)
export class TeamsViewModel {
  private readonly teams: TeamsStore;
  private readonly session: SessionStore;

  constructor(teams: TeamsStore, session: SessionStore) {
    this.teams = teams;
    this.session = session;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  activate(): void { void this.teams.ensureLoaded(); }   // called when the page mounts
  get cards(): TeamCardModel[] { /* computed from the stores */ }
}
```
```ts
// features/teams/TeamsViewModel.test.ts — no React, no network
const vm = new TeamsViewModel(new TeamsStore(fakeTeamsApi, fakeGame), sessionSignedInAs(player));
```

### MobX and TypeScript traps (read before writing a class)

- **This TypeScript config forbids two things you may reach for.** `erasableSyntaxOnly` is on, so **no `enum`** (use a union of string literals: `type RoundPhase = 'idle' | 'open'`) and **no constructor parameter properties** (`constructor(private api: TeamsApi)` is an error: declare the field and assign it, as in the example above). `verbatimModuleSyntax` is on, so types are imported with `import type`.
- Use `makeAutoObservable(this, {}, { autoBind: true })` as the **last** line of the constructor. `autoBind` lets a view pass `vm.save` straight to `onClick`.
- `makeAutoObservable` does not work with inheritance. **No base view-model class and no `extends`.** Share behaviour by composition (`Loadable`, `Command`).
- F0 sets `enforceActions: 'always'`. Code that runs **after an `await`** is outside the action: wrap the state change in `runInAction(() => { … })` (or use `flow`). `Loadable` and `Command` already do this, so most classes never need to.
- **Replace, don't mutate.** Assign a new array or object (`this.items = [...]`); never `push`, `splice` or change a field of an item in place. Views then update for sure, and tests can compare values.
- **Every component that shows view-model or store data is an `observer`**, in `features/` and in `components/` alike. A component that isn't one shows stale data without any error.
- Don't read an observable into a local variable outside render, or pass `vm.someGetter` results through `useMemo`/`useState`: read them in render.
- `#private` fields can't be made observable. Use TypeScript's `private` keyword.
- **Do not enable the React Compiler** (the template README mentions it). It memoises renders in a way that fights `observer`.
- `StrictMode` stays on. In development React mounts, unmounts and mounts again: `activate()` and `dispose()` on a view model, and `start()` / `stop()` on the connection, must be safe to call in that order and more than once.
- MobX is version 7. Confirm the points above against its documentation when you first use them; say so in the DONE note if anything differs.

### Theme rules

- **Components are structure; packs are style** (D31). A colour, font family, border radius, border style or shadow is written only inside `src/theme/packs/<key>/`. Everywhere else use Fluent `tokens.*` or the typed `appTokens.*` from `src/theme/appTokens.ts`. Spacing and layout sizes (padding, gap, grid columns) are structure and may be written in components, preferably with Fluent spacing tokens.
- Styling uses Fluent's `makeStyles` (Griffel). No CSS files outside `src/theme/`, no inline `style` except to pass a value that came from the pack (a team's colour as a CSS variable).
- A team's look comes from `useTeamVisual(colorKey, iconKey)`. A key the pack doesn't know gets the pack's fallback, never an error.
- **State is never shown by colour alone.** Always text or an icon too. Animations respect `prefers-reduced-motion`.
- Two tests guard this (F0): `noHardcodedStyle.test.ts` fails on a hard-coded colour, font, radius or shadow outside `packs/`; `packs.contract.test.ts` checks **every registered pack** against the contract. A new pack is therefore checked by `npm test` without anyone writing a test for it.

### Built for other years

Teams and players change every year: 2026 has six teams; another year may have three or thirteen, with other names, colours and icons.

- No team count, team name, colour key or icon key in any component, view model, store or test. `'red'` or `"Rage Quitters"` may appear only inside `packs/arcade-2026/`.
- Tests build their data with the factories in `src/test/factories.ts` (`makeTeams(n)`, `makePlayers(n)`, `makeSnapshot(...)`), which generate neutral names ("Team 1", "Player 7"). Where the count matters (queue, ranks, team picker, move dialog, grids) use `it.each` over several shapes, for example 1, 2, 6 and 13 teams, plus the edges: a team with no members, equal scores, the longest allowed names.
- Layouts must hold from 1 to 13 or more teams and with 20-character display names and 24-character team names. No fixed "2 × 3" grid.

### Lists and order

- The server returns every list in a defined order (Appendix A). **Show it as it arrives.** Don't re-sort.
- Where the UI offers its own sort (admin player scores), the sort is a pure function in `domain/` whose last key is the id, and names are compared with the one shared comparer `compareNames` (case-insensitive, fixed rule; not the browser's locale). Tests assert the exact order.
- React list `key`s are ids, never array indexes.

### Tests

- **Unit tests are the bulk** and sit next to the file they test (`TeamsViewModel.test.ts`). Domain functions, view models and stores are tested as plain classes with fakes: no React, no network, no MSW.
- **A few integration tests** per feature, for what unit tests can't show: API classes against MSW handlers (wire format, ProblemDetails parsing, status handling), and one or two flows through a real page with real stores (`renderWithApp`, MSW, the fake hub connection). Don't repeat every rule through the UI.
- **Time is faked.** `vi.useFakeTimers()` or an injected clock. Never a real `setTimeout` wait or sleep in a test.
- Query the page the way a user would (`getByRole`, `getByLabelText`), which also proves the text-not-only-colour rule.
- Explicit imports (`import { describe, it, expect } from 'vitest'`), no globals.
- **Playwright is not part of the MVP** (D32). While you build, note 2–5 scenarios from your step that only a real browser or several devices can prove, and append them to Appendix B.

### Devices and accessibility

- Design for a phone first: everything works at **360 px wide**, tap targets are at least 44 px, no horizontal scrolling, nothing depends on hover.
- Real elements (`button`, `label` + `input`, headings), visible focus, an accessible name on every icon-only button.
- Text sizes stay readable at arm's length; the buzzer and the host buttons are the biggest things on their screens.

### Hosting constraints (the app ends up on Azure, served by the API)

- The built app is served by the API from the **same origin** (D22). Call the server with **relative URLs only** (`/api/...`, `/hubs/game`). No base-URL setting, no CORS, no environment files.
- The server treats a path as a page of this app only when its **last segment has no dot**. Never put a dot in a route path.
- **No service worker** (D1): the app is a plain web site. Don't add `vite-plugin-pwa`.
- Never commit build output (`frontend/dist`, `backend/src/BuzzerApp.Api/wwwroot`); both are git-ignored.
- **Never trust the client for the game:** no player id, team id or timestamp is ever sent with a buzz or a host action (Appendix A: the hub methods take no arguments).

---

## F0 — Foundations — DONE

> **Done 10 Nov 2026. Kept for reference; do not redo.**
>
> **What exists** (`frontend/src/`)
> - Packages (versions checked with `npm view`): `@fluentui/react-components` 9.75.2, `@fluentui/react-icons` 2.0.345, `react-router` 8.5.1, `mobx` 7.1.6, `mobx-react-lite` 5.1.2; dev `vitest` 5.1.0, `jsdom` 31.0.0, `@testing-library/react` 16.3.3, `/dom` 10.4.2, `/user-event` 14.6.9, `/jest-dom` 7.0.1 (imported as `@testing-library/jest-dom/vitest`).
> - Tooling: scripts `test`, `test:watch`; `lint` now runs with `--max-warnings 0`. `vite.config.ts` uses `defineConfig` from `vitest/config`, the dev proxy, and `resolve.tsconfigPaths: true` (Vite 8 reads the `@/*` alias from `tsconfig.app.json`, so the alias is written once). CI runs `npm test`. Template files removed; README rewritten; `<title>` is "Buzzer"; neutral favicon.
> - `app/`: `AppServices.ts` (`AppServices { themes: ThemeCatalog }`, `createAppServices()`), `AppServicesContext.ts` (context + `useAppServices`), `AppServicesProvider.tsx`, `useViewModel.ts` (+ test, including StrictMode), `routes.ts` (`/` placeholder home, `/dev/theme` lazily and only when `import.meta.env.DEV`; it is absent from the production bundle), `App.tsx`. `main.tsx` builds services and router once, outside React, under `StrictMode`.
> - `mvvm/`: `configureMobx`, `Loadable<T>` (`value`, `status`, `error`, `isLoading`, `load()`, `ensureLoaded()`; reload keeps the value, last started wins, never rejects), `Command<TArgs>` (`isRunning`, `error`, `run(...)` → `Promise<boolean>`, `clearError()`; ignores a second run, never rejects), `toError`. Tests for both.
> - `domain/`: `buzzer.ts` (type **and** runtime list `buzzerVisualStates`), `names.ts` (name length limits), `themeCatalog.ts` (`PackKeys`, `ThemeCatalog`: how view models learn a pack's colour/icon keys without importing the theme).
> - `theme/`: `types.ts` (contract; PlanMVP §9.2 updated to match), `appTokens.ts`, `buildFluentTheme.ts`, `registry.ts` (`themeKeys`, `resolveThemeKey`, `loadThemePack` with a per-key promise cache that forgets failures, `themeCatalog`), `ThemeRoot.tsx` (`ThemeRoot` with `scope: 'page' | 'section'`, and `ThemePackProvider` for an already loaded pack), `ThemePackContext.ts`, `useThemePack.ts` (`useThemePack`, `useCopy`, `useFormatScore`), `useTeamVisual.ts` (+ pure `resolveTeamVisual`), `defaultCopy.ts` (+ `mergeCopy`, `buzzerCopyKeys`), `formatScore.ts`, `contrast.ts` (colour parsing and WCAG contrast for the contract test), `cssCustomProperties.d.ts` (lets `style={{ '--team-fill': … }}` type-check), `packs/default/` (Fluent's web brand ramp, light, system fonts, colours `c1`–`c8`, shape icons `circle`, `square`, `triangle`, `diamond`, `generic`; `generic` is the fallback). Guard tests `packs.contract.test.ts` and `noHardcodedStyle.test.ts` (which also tests its own patterns), plus unit tests.
> - `components/`: `Buzzer.tsx`, `TeamCard.tsx` (both `observer`), with tests.
> - `features/dev/`: `ThemePreviewPage.tsx`, `ThemePreviewViewModel.ts` (+ unit test and one page test); `features/home/HomePage.tsx` placeholder.
> - `test/`: `setup.ts`, `renderWithApp.tsx` (`renderWithApp`, `renderWithAppAsync`), `factories.ts`, `testServices.ts` (`createTestServices(overrides)`), `fakes/FakeThemeCatalog.ts`, `deferred.ts`, `flushPromises.ts`. `api/types.ts` has `Member` and `Team` only (for the factories).
>
> **Deviations and decisions**
> - File names: `routes.ts` (no JSX), and the context split into `AppServicesContext.ts` + `AppServicesProvider.tsx` because Fast Refresh wants a `.tsx` file to export components only.
> - `useViewModel<T extends object>` rather than `T extends ViewModel`: TypeScript rejects a class with none of an all-optional interface's members, which would have rejected every view model without `activate`/`dispose`.
> - Theme tokens: verified in Fluent's source that `FluentProvider` writes **every** key of the theme object as a CSS variable and that portals (dialogs, menus) get the provider's class, so the app tokens are extra keys on the Fluent theme as planned; no `document.documentElement` fallback. `ThemeRoot` with `scope="page"` additionally sets the `<html>` background and `color-scheme` (over-scroll area, scroll bars).
> - Contract refinements over the §9 sketch: `text.body/muted` added (needed for the contrast check), team colours carry `onFill`, `teams.fallback`, `buzzer.radius` (so a pack can square every Fluent corner and still keep a round buzzer), buzzer `colors: 'team' | {fill, text}`, `numbers.scoreDigits`, `effects.scanlines` takes a colour (so the overlay has no hard-coded colour), `copy` keys are those in `defaultCopy.ts`.
> - Griffel (Fluent's CSS-in-JS) rejects `borderWidth`/`borderStyle`/`borderColor`; use `...shorthands.border(width, style, color)`.
> - The style guard also catches named colours on colour properties (`color: 'red'`), beyond the brief's list. It skips comments, `src/test/` and test files.
> - ESLint layer rules use `regex` patterns; every source file also may not import with `../` (so the rules can't be bypassed) nor import `@/test/`. View models, stores, MVVM helpers and domain files may not use `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `location` (`no-restricted-globals`). In a feature folder, `.ts` files follow the view-model rules and `.tsx` files the view rules. `observer` is registered as a component wrapper for the Fast Refresh rule. Each rule was proved with a deliberately wrong import per layer (32 errors), then removed; `#ff0000` in `TeamCard` failed the guard test, then was removed.
> - MobX 7, checked against its changelog: `observable.ref` is now `observableRef` (and similar named exports); `makeAutoObservable`, `runInAction`, `enforceActions` work as the shared rules describe. Injected services and constants are excluded with `false` overrides (see the preview view model). The test setup turns any `[MobX]` warning into a test failure.
> - jsdom lacks `matchMedia` and `ResizeObserver` (Fluent needs both); `setup.ts` stubs them. Small SVG icons are inlined as `data:` URLs by Vite, large files resolve to `/src/...`; the contract test accepts both.
> - Buzzer: browsers deliver `pointerdown` to a **disabled** button, so the component checks `disabled` itself (a test caught it).
> - `npm audit` reports a moderate `minimatch` advisory inside the ESLint/typescript-eslint toolchain (dev only; the suggested fix downgrades ESLint). Not acted on.
> - Checked by the worker: lint, build, tests (172), and the dev server serving `/` and `/dev/theme` and their modules. **Not** checked in a real browser (the worker had none): the developer's look at `/dev/theme` at 360 px is the visual check.

**Model:** Opus 5.5. **Read also:** PlanMVP §9 (theming), D30, D31, D34.

**Goal:** an app shell that renders with the `default` theme pack, the folder structure and lint rules above, the MVVM helpers, a working test setup in CI, and a `/dev/theme` preview page that is the first worked example of view + view model + test. Later steps copy what this step establishes, so favour clarity over cleverness.

**Packages** (versions per the shared rule): `@fluentui/react-components`, `@fluentui/react-icons`, `react-router`, `mobx`, `mobx-react-lite`; dev: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`. (MSW comes in F2, SignalR in F4, fonts in F1.)

**Tooling**
- `package.json` scripts: add `"test": "vitest run"` and `"test:watch": "vitest"`.
- `vite.config.ts`: dev proxy `/api` → `http://localhost:5283` and `/hubs` → the same with `ws: true`; the `@` → `src` alias (also `paths` in `tsconfig.app.json`; check whether Vite 8 can read tsconfig paths itself before adding anything); the Vitest block (`environment: 'jsdom'`, `setupFiles`). Use `defineConfig` from `vitest/config` so the `test` key is typed.
- `eslint.config.js`: the layer table as `no-restricted-imports` rules per folder (the typescript-eslint version of the rule can allow type-only imports where the table says "types only"). Add one deliberate wrong import locally to prove each rule fires, then remove it.
- `.github/workflows/ci.yml`: in the `frontend` job replace the commented Vitest line with `- run: npm test`. **Do not rename the job** (it is a required check).
- Remove the template: `src/App.css`, `src/index.css`, `src/assets/*`, `public/icons.svg`, the demo `App.tsx` content. Replace `frontend/README.md` with a short real one (run, test, folder map, pointer to this file). Set the page `<title>` to a neutral name; the event name arrives from the API in F2.

**Files to create** (names may be refined; keep the folders)
- `src/main.tsx`, `src/app/App.tsx`, `src/app/AppServices.ts` (the composition root: one `createAppServices()` that builds every service and store; almost empty for now), `src/app/AppServicesContext.tsx` (`AppServicesProvider`, `useAppServices`), `src/app/useViewModel.ts`, `src/app/routes.tsx` (`createBrowserRouter`; for now `/` and the dev-only `/dev/theme`).
- `src/mvvm/configureMobx.ts` (`enforceActions: 'always'`; called once from `main.tsx` and from the test setup).
- `src/mvvm/Loadable.ts`: observable holder for one piece of server data. `value`, `status: 'idle' | 'loading' | 'ready' | 'error'`, `error`, `load()`, `ensureLoaded()`. Two behaviours matter and need tests: a reload **keeps the previous value** while it runs (no flicker when the hub says "changed"), and when two loads overlap **the one started last wins** (a slow early response must not overwrite a newer one).
- `src/mvvm/Command.ts`: wraps an async action for a button. `isRunning`, `error`, `run(...)`. A second `run` while one is running is ignored (no double submit); a thrown error becomes `error`, never an unhandled rejection.
- `src/domain/buzzer.ts`: only the type `BuzzerVisualState = 'ready' | 'yourTeamUp' | 'queued' | 'out' | 'waiting'` (the rule that computes it is F4).
- `src/theme/`: `types.ts`, `appTokens.ts`, `buildFluentTheme.ts`, `registry.ts`, `ThemeRoot.tsx`, `useThemePack.ts`, `useTeamVisual.ts`, `defaultCopy.ts`, `packs/default/index.ts`, and the two guard tests.
- `src/components/Buzzer.tsx`, `src/components/TeamCard.tsx` (presentational only; wired to real data in F5 and F6).
- `src/features/dev/ThemePreviewPage.tsx`, `ThemePreviewViewModel.ts`, `ThemePreviewViewModel.test.ts`.
- `src/test/setup.ts` (jest-dom matchers, MobX config, cleanup), `src/test/renderWithApp.tsx` (renders a view inside `FluentProvider` + theme + services + a memory router), `src/test/factories.ts` (start with `makeTeams(n)` and `makeMembers(n)`).

**`useViewModel`**
- `useViewModel(create)` builds the view model **once** per mounted view (`useState` initialiser), passing `AppServices`. An effect calls `vm.activate?.()` on mount and `vm.dispose?.()` on unmount. Define a small `ViewModel` interface with those two optional methods.
- Most view models need neither method: they are computed views over stores. `activate` is for "make sure my stores are loaded" and for timers; `dispose` undoes exactly what `activate` did.

**Theme system** (start from PlanMVP §9.1–9.2; you may refine the contract, and you then update §9.2 to match)
- `ThemePack` is **data only**: no components, no JSX, no logic. That is what lets next year's design be converted into a pack by filling in one typed object.
- The contract must cover, with a named slot each: Fluent (`mode`, brand ramp, optional overrides); surfaces, borders, the shadow; fonts (`heading`, `body`, `numeric`); the buzzer's look per `BuzzerVisualState` (a state may say "use the player's team colour" instead of a fixed colour; each state has an `animation` of `none | pulse | blink`); teams (`colors: Record<colorKey, { fill, onFill }>` where `onFill` is the text colour that is readable on `fill`; `icons: Record<iconKey, url>`; a `fallback` colour and icon for unknown keys); number format (how many digits scores are padded to, `0` for none); optional `effects`; optional `copy` (flavour text per key, falling back to `defaultCopy.ts`).
- `teams.colors` and `teams.icons` may hold **more keys than the seeded teams use**. The spare ones are what an admin picks from when creating a team (F6).
- **How tokens reach components:** build one theme object = Fluent theme (`createDarkTheme` / `createLightTheme` from the brand ramp) + overrides + the app's own tokens as extra keys, and give it to `FluentProvider`. Fluent writes every key as a CSS variable and applies them inside dialogs and menus too (they render in a portal, outside the page's DOM tree, which is why setting variables on a wrapper `div` is not enough). `appTokens.ts` exports the typed `var(--…)` references. Verify this against the Fluent UI v9 theming documentation ("custom tokens"); if it does not hold, set the variables on `document.documentElement` and say so in the DONE note.
- `registry.ts`: `themeKey` → lazy `import()` of the pack; an unknown key resolves to `default`. Export the list of keys for the contract test and the preview page.
- `ThemeRoot` takes a `themeKey` prop, loads the pack, and renders a plain splash while it loads. (F2 feeds it the active event's key. Until then it uses `default`.)
- `packs/default/`: a neutral, readable pack (Fluent's own brand ramp, system fonts, a handful of generically named team colours such as `c1`…`c8` with a simple generic icon). It is the fallback forever and the starting point for new packs.
- `packs.contract.test.ts`, over every key in the registry: all required slots present and non-empty; every colour parses as a CSS colour; contrast of at least 4.5:1 for body text on the page and panel surfaces and for each team's `onFill` on `fill`; every buzzer state defined; the fallback present; every icon URL resolves.
- `noHardcodedStyle.test.ts`: reads the source files under `src/` except `theme/packs/` and test files, and fails on hex colours, `rgb(`/`hsl(`, literal font families, numeric `borderRadius` and literal `boxShadow`. Keep the patterns simple and explain each in a comment.

**Presentational components**
- `Buzzer`: a large round `button`. Props: visual state, the team's colour key (for states that use it), label, optional sublabel, `disabled`, `onPress`. Fires on **`pointerdown`**, not on click: click fires on release, which costs time in a buzzer race. Keyboard activation still works, and one press produces one call. `touch-action: manipulation` so a fast double tap doesn't zoom.
- `TeamCard`: border in the team colour, icon top-left in a fixed box with `object-fit: cover`, team name, member list (display name; real name in smaller text when present; a marker on the viewer's own row). Provide **slots** for a card action and a per-member action so F6 adds menus without changing the layout. Handles zero members and the longest names.

**`/dev/theme` preview** (route exists only when `import.meta.env.DEV`)
- A pack switcher over every registered pack; app token swatches with their names; the three fonts; common Fluent controls (button, input, tabs, dialog, menu, table, message bar); a `TeamCard` for every team colour in the pack plus the fallback; the `Buzzer` in every state; and a "number of teams" control (1 to 13) to see the grids reflow.
- `ThemePreviewViewModel` holds the selected pack key and team count and produces the sample data from the **pack's own keys**. It is deliberately the reference example: keep it small and exemplary, with its test.

**Watch out**
- Keep `StrictMode`. Nothing in F0 may depend on an effect running once.
- Fluent components need `FluentProvider` in tests too: always render through `renderWithApp`.
- Test files live under `src/`, so `npm run build` type-checks them as well.

**Check:** `npm run dev` shows the shell with the default pack; `/dev/theme` shows everything listed and reflows from 1 to 13 teams at 360 px; lint, build and tests pass; breaking a layer rule or writing `#ff0000` in a component fails lint or the guard test.

**Playwright candidates:** none expected from this step (maybe "the preview page renders every registered pack without console errors").

**Developer does:** the one-time setup above. After the worker finishes, open `/dev/theme` and resize the window down to phone width.

---

## F1 — Arcade pack — DONE

> **Done 10 Nov 2026. Kept for reference; do not redo.**
>
> **What exists**
> - `frontend/src/theme/packs/arcade-2026/` (`index.ts`, `icons/`), registered in `registry.ts` after `default`. Packages `@fontsource/press-start-2p` and `@fontsource/vt323` 5.3.0 (only the `latin` and `latin-ext` 400 CSS files are imported; browsers fetch a file only when a character needs it).
> - Team colours: the six from PlanMVP §9.3 under `red`, `yellow`, `green`, `blue`, `purple`, `pink`, plus spares `orange`, `teal`, `white`. Icons: the six `<team>.png` copies, plus `default` (a transparent pixel face, `icons/default.svg`, which takes the team colour from the card's icon box so it suits any colour); `default` is also the fallback icon. The fallback colour is a mid grey.
> - `docs/ThemePacks.md`: what a pack is, the contract field by field, adding a pack step by step, never deleting packs, the ready-to-paste prompt, and gotchas learned here.
> - The backend's `appsettings.json` already uses these exact colour and icon keys; nothing to change there.
>
> **Deviations and decisions**
> - **No scanlines.** The contract takes one opaque line colour; one pixel line in three over VT323's one-pixel strokes would erase letters. The pack says where to add `effects.scanlines` if the developer wants to try it on a real screen.
> - **Red's `onFill` is `#FFFFFF`**, not off-white or ink: ink reaches only 3.8:1 and `#F2F2F2` 4.4:1 on `#D7263D`. Every other team colour uses ink.
> - **The chrome is grey.** The `fluent.brand` ramp is neutral greys, and `colorBrandBackground*` plus `colorNeutralForegroundOnBrand` are overridden so primary buttons are off-white with ink text. The hard shadow is `4px 4px 0 #3A3A3A` (black would vanish on the near-black page). `borderRadiusCircular` is kept so radios and switches stay recognisable.
> - **Fonts and sizes.** Headings, scores and the buzzer use Press Start 2P; everything Fluent draws (buttons, inputs, menus, tables) uses VT323, because Fluent has no separate button font. VT323 is small for its size, so `fontSizeBase100`–`500` and their line heights are raised; `fontSizeHero800` (the buzzer label) is 24px so "WAITING" fits inside the buzzer at 360 px (40px fits five glyphs). All font weights are 400 (neither font has a bold).
> - Buzzer states: `ready` pulses and `yourTeamUp` blinks, both in the team colour; `queued`, `waiting`, `out` are greys of falling brightness with fixed text colours.
> - One change outside the pack: `ThemePreviewPage.tsx` section headings now set `fontSize`/`lineHeight` explicitly (Base600). Left to the browser's 1.5em default, a wrapped heading overlapped itself once the pack raised the base line height. No contract slot was added.
> - Contract test: nothing arcade-specific added; it ran over the pack automatically (183 tests now).
> - **Checked:** lint, build, tests; and `/dev/theme` with `arcade-2026` rendered in headless Edge (layout width 500, since headless Edge won't go narrower): every team colour, the fallback, wrapping of the longest names, Fluent controls and the buzzer states look right. **Not** checked at a true 360 px or on a phone: that, and taste, are the developer's call on `/dev/theme`.
>
> **Later steps must know**
> - Copy strings are upper case in this pack (`BUZZ!`, `YOUR TEAM'S UP!`). Keep views free of `text-transform` and let the pack decide.
> - Press Start 2P is one em wide per glyph: when a view puts text in the heading or numeric font, long words wrap with `overflow-wrap: anywhere` (as `TeamCard` does). F5's buzzer sublabel is in this font too (24px); keep it to a few short words.

**Model:** Sonnet 5.5. **Read also:** PlanMVP §9.3 (the look, the palette table, the icon rules). Look at `images/team-logos/group-participating-teams.png` and one `<team>-face.png` for the style.

**From F0:** the contract is `src/theme/types.ts` (PlanMVP §9.2 shows its shape); copy `packs/default/index.ts` as the starting point. A buzzer state uses the team colour with `colors: 'team'`; scanlines are `effects: { scanlines: { color } }`; the buzzer's shape is `buzzer.radius` (separate from Fluent's radii, so square corners elsewhere don't make the buzzer square unless you want it). Team cards use Fluent's `borderRadiusLarge`/`borderRadiusMedium`, so the `borderRadius*` overrides square them too. Every colour must be opaque hex, `rgb()` or `hsl()` (no named colours, no alpha), and contrast is checked at 4.5:1 for text on surfaces, `onFill` on `fill` and fixed buzzer colours. Register the pack in the `loaders` object in `registry.ts` (its order is the preview's order).

**Goal:** `packs/arcade-2026` and a guide that lets next year's pack be made by handing a design to an AI.

**Packages:** `@fontsource/press-start-2p`, `@fontsource/vt323` (self-hosted fonts: nothing may depend on a CDN on event day).

**Do**
- `src/theme/packs/arcade-2026/index.ts` implementing the F0 contract, dark mode, per PlanMVP §9.3: near-black page, ink `#111111` and off-white `#F2F2F2` as the extremes, square corners (every Fluent `borderRadius*` token `0`), chunky borders, a hard offset shadow with no blur, optional faint scanlines. **Not** neon: no glow, gradients, chrome or glitch.
- Fonts imported inside the pack so they load with it: `Press Start 2P` for headings, buttons and scores; `VT323` (or the system font if it reads poorly at small sizes) for body text. Scores padded to 5 digits (`00120`).
- Team colours: the six from the §9.3 table under their colour keys, each with an `onFill` that passes the contrast test. Icons: copy `images/team-logos/<iconKey>-face.png` to `packs/arcade-2026/icons/<iconKey>.png` and import them (the originals stay in `images/`). They are solid tiles with aspect ratio 1.26:1.
- **Spare keys for teams an admin creates:** at least two more colours that are clearly different from the six (name them plainly, for example `orange`, `teal`), and one generic icon key (`default`) drawn as a simple tile in the same style. Use the generic icon as the pack's fallback too.
- Buzzer states per §9.3 "Colour clash": `ready` uses the player's team colour; the other states differ by label, brightness and animation, never by a red/amber/green status colour. Flavour text in `copy`.
- Register the pack in `registry.ts`.
- **`docs/ThemePacks.md`** (for the developer and for future AI sessions), covering: what a pack is and what it must not contain; the contract field by field in plain words; adding a pack step by step (copy `packs/default`, fill in, add icons, register, set `Event:ThemeKey` and the teams' `ColorKey` / `IconKey` in the backend config, which must be keys the pack has); how it is checked (`npm test` runs the contract test on it; `/dev/theme` for the eye); that packs are never deleted because archives refer to them; and a **ready-to-paste prompt** of this shape:
  ```
  Read docs/ThemePacks.md and frontend/src/theme/types.ts. Here is next year's design: <images / description>.
  Create frontend/src/theme/packs/<key>/ implementing ThemePack. Change nothing outside that folder
  except registry.ts. Run npm test and fix what the contract test reports.
  ```

**Watch out**
- Nothing outside `packs/arcade-2026/` and `registry.ts` should need to change. If a component can't be styled through the contract, the contract is missing a slot: add the slot (types, default pack, contract test), don't special-case the component. Record it in the DONE note.
- `Press Start 2P` is wide: check that the longest team name (24 characters) and a 20-character display name still fit a card at 360 px (wrap, don't clip).
- The six team colours cover the whole hue wheel, so any other strong colour will look like a team. Keep the chrome neutral.

**Tests:** the contract test covers the pack. Add nothing arcade-specific unless a slot was added.

**Check:** `/dev/theme` with `arcade-2026` selected shows every team colour (six plus the spares and the fallback), every buzzer state and the Fluent controls in the arcade style, readable at 360 px. Switching back to `default` still works.

**Playwright candidates:** visual snapshots of `/dev/theme` per pack (the one place screenshots would catch a regression a unit test can't).

**Developer does:** judge the look on `/dev/theme` on your phone. Taste is yours: ask the worker for changes in the same chat.

---

## F2 — API layer and stores — DONE

> **Done 10 Nov 2026. Kept for reference; do not redo.**
>
> **What exists** (`frontend/src/`)
> - Package: dev `msw` 3.0.4. **MSW 3 renamed the option:** `server.listen({ onUnhandledFrame: 'error' })`, not `onUnhandledRequest`.
> - `api/`: `types.ts` (every REST type and request body of Appendix A; the hub's snapshot types are left to F4's `realtime/types.ts`), `ApiError.ts` (`ApiError extends Error`; `fromResponse`, `network()`, `unreadable()`), `ApiClient.ts` (`get / post / patch / delete / download`, options `{ anonymous, query }`; the only `fetch`), and per feature an interface plus its `Http…` class: `EventApi`, `SessionApi`, `TeamsApi`, `PlayersApi`, `ScoresApi`, `ArchiveApi`.
> - `realtime/GameEvents.ts`: the `GameEvents` interface, `Unsubscribe`, and `NoGameEvents` (nothing ever fires).
> - `stores/`: `EventStore`, `SessionStore`, `ScoresStore`, `TeamsStore`, each with tests. `AppServices` now has `themes`, `event`, `session`, `teams`, `scores`, `eventApi`, `archive`. `createAppServices({ fetchFunction?, events? })` is the composition root; F4 passes the real connection as `events`.
> - `app/`: `AppViewModel` (+ test) activates the event load and `session.restore()`; `App.tsx` shows `ThemeSplash` (now exported from `ThemeRoot.tsx`) until the event load has finished, then `ThemeRoot` with the event's `themeKey` (the default pack when the event can't be loaded).
> - `mvvm/Loadable`: two additions, both tested: `reloadIfRequested()` (reload unless still idle: what a hub notification uses) and `reset()` (back to idle, and a load still running is dropped).
> - `test/`: MSW (`msw/server.ts`, `msw/handlers.ts` with a default handler for every route and `problemResponse()`; started in `setup.ts`), factories (`makeEventInfo`, `makeJoinTeams`, `makeMe`, `makeAdminMe`, `makePlayer(s)`, `makeTeamScores`, `makePlayerScores`, `makeAdjustments`, `makeFinalizeResponse`, `problem`), `fakes/` (`FakeEventApi`, `FakeSessionApi`, `FakeTeamsApi`, `FakePlayersApi`, `FakeScoresApi`, `FakeArchiveApi`, `FakeGameEvents`; each API fake has `calls`, `clearCalls()`, `failNext(error)` through a shared `CallRecorder`), and `createTestFakes()` + `createTestServices(overrides, fakes)`, which builds the **real stores over the fakes**.
>
> **Deviations and decisions**
> - **Stores forget on a change of person.** `TeamsStore` and `ScoresStore` reset their `Loadable`s when `session.me?.playerId` changes (sign-out, expiry, another person). Otherwise the next person on a shared phone would see the last person's cached lists, which can hold their real name. Not in the brief; the brief's `Loadable` had no `reset`.
> - **A store write reloads what is on screen, across stores.** `TeamsStore` takes `ScoresStore` and `SessionStore` too: a rename, move or create reloads the teams, the scores already loaded (their names change) and, when the write changed the caller, `session.refresh()`. "Already loaded" means any `Loadable` that isn't idle (`reloadIfRequested`), including one whose last load failed.
> - **`TeamsChanged` and a reconnect also refresh the session** (inside `TeamsStore`): the caller may have been moved to another team or made an admin. F4's rule 6 (`session.refresh()` after a reconnect) therefore happens already for the teams path; F4 may keep its own call (a duplicate `/me` is harmless) or drop it.
> - **`SessionStore.restore()` never rejects.** A `401` means anonymous; any other failure (server down) leaves `status: 'unknown'` and sets `error`, so a guard can offer "try again" rather than send a signed-in person to `/join`. `refresh()` also never rejects (a failure keeps the known `me`; a `401` signs out). A `/me` answer is applied only if nothing newer happened since it was asked (a slow `restore()` can't undo a sign-in; the later of two refreshes wins).
> - **`GET /api/session/me` is marked anonymous** in the client, so a `401` there is read by `SessionStore` instead of also firing `onSessionExpired`. Register, sign-in, event info and join teams are anonymous too.
> - **`signOut()`** treats a `401` as success (the session had already ended) and rethrows any other failure, leaving the person signed in.
> - **`ArchiveApi.exportArchive(eventId)`** (the brief says one method per route) returns the file as a `Blob` through `ApiClient.download`. F8's brief says Export is a plain link, so that this file never sits in memory or storage: use the link there and delete this method if it stays unused.
> - **Unclassified errors.** `ApiError.kind` for 405, 415 and 5xx is `'server'`; the brief's list has no other fit. A 2xx whose body isn't JSON also becomes kind `server`.
> - **`ScoresStore.ensureAdminDataLoaded()`** loads the admin-only lists only if `session.isAdmin`, so a player's screen can never trigger a `403`. The admin lists are public `Loadable`s (`scores.playerScores`, `scores.recentAdjustments`), next to `scores.teamScores`; likewise `teams.teams`.
> - jsdom works with MSW unchanged: relative URLs in handlers and in `fetch` resolve against jsdom's location.
> - **Checked:** lint, build, tests (330). **Not checked:** the brief's "Check" (the app switching to the event's theme against the real backend, and starting with the backend stopped). The tests cover both paths with fakes and MSW (`App.test.tsx`, `AppViewModel.test.ts`, `AppServices.test.ts`); the real-backend look is the developer's.
>
> **Later steps must know**
> - **F3:** `services.eventApi.getJoinTeams(code)` is the join screen's team list (no store: it depends on the code). `session.register` / `signIn` throw `ApiError` (`kind`, `fieldErrors` by request field name, `message` = the server's text, `retryAfterSeconds`). `App` already calls `restore()`; guards should treat `status === 'unknown'` as "splash, or a retry when `session.error` is set". `ThemeSplash` is exported from `@/theme/ThemeRoot`.
> - **F4:** implement `GameEvents` in `GameConnection` and pass it as `createAppServices({ events })` (`main.tsx`). The stores already reload what is loaded on `onTeamsChanged`, `onScoresChanged` and `onReconnected`.
> - **F6, F7:** use the store methods named in the brief: `teams.createTeam / renameTeam / deleteTeam / editNames / editOwnNames / movePlayer / promote`, `scores.adjust / reverse`. All throw `ApiError`, reload by themselves, and return the server's row.

**Model:** Sonnet 5.5. **Read also:** Appendix A (all of it).

**From F0:** `src/api/types.ts` already holds `Member` and `Team` (needed by the factories): complete the file, don't recreate it. `src/test/factories.ts` has `makeTeams(n, { membersPerTeam })` and `makeMembers(n, firstPlayerId)`. Add the stores to `AppServices` next to `themes` and to `createTestServices` (`src/test/testServices.ts`). `ApiError` should extend `Error`: `Loadable.error` and `Command.error` are `Error`, and `toError` passes subclasses through. Test helpers that exist: `deferred()` (settle a promise by hand), `flushPromises()` (microtasks only), `renderWithApp` / `renderWithAppAsync` (for a view that suspends). The test setup fails any test during which MobX warns. `ThemeRoot` in `App.tsx` takes the key from the event store.

**Goal:** everything that talks REST, the stores that hold the results, and the test doubles later steps use. No screens yet, except that the app now loads the active event and uses its theme.

**Packages:** dev `msw`.

**Do**
- `src/api/types.ts`: the wire types from Appendix A, exactly. Union string types, `| null` where the server sends null.
- `src/api/ApiError.ts`: one error class for every failed call. Fields: `status`, `kind` (`'validation' | 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'rateLimited' | 'network' | 'server'`), `title`, `detail`, `fieldErrors` (`Record<string, string[]>`, empty when none), `retryAfterSeconds`, and `message` = the text to show a person (`detail`, else `title`, else a generic sentence). The server's messages are already written for users: show them as they are.
- `src/api/ApiClient.ts`: the only place that calls `fetch`. `get / post / patch / delete`; JSON in and out; `credentials: 'same-origin'`; `204` → `undefined`; any non-2xx → parse the ProblemDetails body into an `ApiError`; a network failure → `ApiError` of kind `network`; `Retry-After` header → `retryAfterSeconds`. Takes `fetch` and an `onSessionExpired` callback through its constructor.
- **The 401 rule:** a `401` on a call that needs a session means the session has ended: call `onSessionExpired`, then throw. A `401` from **sign-in** means "wrong name or PIN" and must **not** trigger it. Calls made without a session (event info, join teams, register, sign in) are marked anonymous so the client knows the difference.
- One class per feature, each with an interface of the same name that tests fake: `EventApi`, `SessionApi`, `TeamsApi`, `PlayersApi`, `ScoresApi`, `ArchiveApi`. One method per route in Appendix A, typed in and out. No logic.
- Stores in `src/stores/`:
  - `EventStore`: the active event (`name`, `year`, `themeKey`) in a `Loadable`.
  - `SessionStore`: `me`, `status: 'unknown' | 'anonymous' | 'signedIn'`, `isAdmin`; `restore()` (calls `/me`; `401` → anonymous), `register()`, `signIn()`, `signOut()`, `refresh()`, `handleSessionExpired()`. `register` and `signIn` rethrow the `ApiError` so the join view model can show it.
  - `TeamsStore`: teams with members; `rename`, `create`, `remove`, and the player writes that change the team list: `editNames`, `editOwnNames`, `movePlayer`, `promote`.
  - `ScoresStore`: `teamScores`; for admins `playerScores` and `recentAdjustments`; `adjust`, `reverse`.
  - Every write: call the API, then reload the store(s) whose data it changed (a move or rename changes names on the scoreboards too; an own-name edit also needs `session.refresh()`). Errors propagate to the caller.
  - Stores take a `GameEvents` interface (`onTeamsChanged(cb)`, `onScoresChanged(cb)`, `onReconnected(cb)`, each returning an unsubscribe function) and reload **what is already loaded** when it fires. F4 supplies the real one; for now pass a do-nothing implementation.
- `AppServices`: build the client, APIs and stores; wire `onSessionExpired` to the session store. `App.tsx`: on start call `event.load()` and `session.restore()`, and give `ThemeRoot` the event's `themeKey` (fall back to `default` if the event can't be loaded; show the splash while it loads so the default theme doesn't flash first).
- `src/test/`: MSW server setup and default handlers for every route (built from the factories), `factories.ts` extended (`makeMe`, `makeTeams`, `makeTeamScores`, `makePlayerScores`, `makeAdjustments`, `problem(status, …)`), and `src/test/fakes/` with in-memory fakes of each API interface and of `GameEvents`.

**Watch out**
- JSON numbers only: ids are numbers, including adjustment ids. Dates are ISO strings; keep them as strings in the types and parse where displayed.
- `GET /api/players` exists (Appendix A) but no MVP screen needs it. Give `PlayersApi` the method; don't build a store for it.
- Validation errors name fields in camelCase exactly as the request does (`displayName`, `teamId`).
- `fetch` does not reject on a 4xx or 5xx; only on network failure.
- MSW in Vitest runs in Node (`msw/node`): `onUnhandledRequest: 'error'` so a test can't silently hit the network.

**Tests**
- Unit: `ApiError` mapping from each status and body shape; each store with a fake API (load, reload keeps the old value, a write reloads the right stores, errors surface, hub event reloads only loaded data); `SessionStore` transitions.
- Integration (MSW): `ApiClient` + two or three API classes: JSON round trip, ProblemDetails with and without `errors`, `204`, `401` anonymous vs session, `429` with `Retry-After`, network failure.

**Check:** with the backend running, the app loads and switches to the event's theme (`arcade-2026` if F1 is merged); with the backend stopped, it still renders with the default pack and no crash.

**Playwright candidates:** app start with the API down, then up (recovers without a manual reload?).

**Developer does:** start the backend (one-time setup, step 3) to see the theme switch.

---

## F3 — Join, sign in, guards and the shell

**Model:** Sonnet 5.5. **Read also:** PlanMVP D18, D19, D21, D22; Appendix A "Event" and "Session".

**From F0:** routes are built in `app/routes.ts` (`createAppRoutes()`, `createAppRouter()`); `/` is a placeholder `features/home/HomePage.tsx` to replace with the redirect (delete it). `/dev/theme` must stay outside the guards. Name-length limits are in `@/domain/names` (`PERSON_NAME_MIN_LENGTH` …): validate against those.

**From F2:** the join screen's team list comes from `services.eventApi.getJoinTeams(code)` (no store). `session.register` / `signIn` throw `ApiError` (`kind`, `fieldErrors`, `retryAfterSeconds`; `message` is the server's text). `App` already calls `session.restore()`; while `session.status` is `unknown` show `ThemeSplash` (`@/theme/ThemeRoot`), or a "try again" when `session.error` is set (the server could not be reached, which is not the same as signed out). Stores forget their data when the signed-in person changes, so sign-out needs nothing extra.

**Goal:** a person can register or sign in on a phone and lands on the right start page; every route is guarded; the layout and navigation exist for the screens that follow.

**Do**
- Routes: `/join` (public), `/play`, `/teams`, `/scores` (signed in), `/admin`, `/admin/scores`, `/admin/event` (admin). Pages that later steps build are placeholders now (a heading inside the layout). `/` and unknown paths redirect by session: anonymous → `/join`, player → `/play`, admin → `/admin`.
- Guards in `src/app/`: while the session status is `unknown` show the splash (never flash the join page at a signed-in person); anonymous → `/join`; a player on an admin route → `/play`; an admin on `/play` → `/admin`.
- `components/AppLayout`: header (event name, the person's display name, sign out) and a bottom navigation. Players: **Buzz · Teams · Scores**. Admins: **Host · Teams · Scores · Event**. The nav items come from a small pure function of the role (tested), not from conditionals scattered in JSX.
- `/join?code=XXXX` with two tabs, **New player** and **Sign in**, driven by `JoinViewModel`:
  - Join code: prefilled from the URL, else from the last one used on this phone. Store it through a small `JoinCodeMemory` interface (a `localStorage` implementation in `app/`, a fake in tests): view models never touch `localStorage`.
  - New player: real name, display name, 4-digit PIN, team picker. The picker loads `GET /api/event/teams?code=` **once the code is complete** (on arrival with `?code=`, on blur, or on a "Continue" button). Not on every keystroke: the route is rate-limited.
  - Sign in: real name and PIN (admins sign in here too).
  - Client-side checks mirror the server so most mistakes never leave the phone: names 2–20 characters after trimming, PIN exactly 4 ASCII digits, a team chosen. Put them in `domain/validation.ts` (pure, tested); the server stays the authority.
  - On success the session store becomes signed in and the guards navigate.
- Error handling, each case visible next to what caused it:
  | Response | Show |
  |---|---|
  | `400` with `errors` | Each message under its field |
  | `404` (teams or register) | "That join code is not recognised" on the code field |
  | `409` (register) | The server's `detail`. When it says the real name is registered, offer "Sign in instead" (switches tab, keeps the name) |
  | `401` (sign in) | The server's message ("Real name or PIN is incorrect.") on the form; stay on the form |
  | `429` | "Too many attempts. Try again in N seconds" from `retryAfterSeconds`; disable submit until then |
  | network | "Can't reach the server. Check your connection and try again" |
- Sign out: `POST /api/session/signout`, session becomes anonymous, guard goes to `/join`.

**Watch out**
- PIN input: `inputMode="numeric"`, `maxLength={4}`, `autoComplete="off"`, masked. Strip anything that isn't `0-9`.
- The team picker shows however many teams the event has (cards or a list with colour, icon, name, member count), usable at 360 px for 2 and for 13 teams.
- The 409 text differs for real name and display name; show the server's text, don't guess.
- A signed-in person who opens `/join` goes to their start page.
- Don't build the realtime connection here (F4).

**Tests**
- Unit: `JoinViewModel` (validation, each error case, tab switch keeping the name, code memory, picker loads once per code), guards as pure decisions, nav items per role.
- Integration: one register flow and one sign-in flow through the real page with MSW (fill the form, submit, land on the right route), plus one failing case each.

**Check:** against the real backend: register a player on a phone and land on `/play`; sign out; sign in again; sign in as the admin and land on `/admin`; wrong PIN shows the message; refresh keeps you signed in; an unknown join code is reported.

**Playwright candidates:** register → refresh → still signed in; two phones registering the same display name at once (one gets the 409); the back button after sign-out doesn't show a signed-in page.

**Developer does:** try it on a real phone (one-time setup, step 5). Register a couple of test players.

---

## F4 — Realtime

**Model:** Opus 5.5. **Read also:** PlanMVP D5–D8, D13; Appendix A "Hub".

**From F0:** `BuzzerVisualState` and the runtime list `buzzerVisualStates` are in `@/domain/buzzer`; put `getBuzzerState` next to them. To test StrictMode's activate → dispose → activate, use `renderHook(..., { reactStrictMode: true })` as `app/useViewModel.test.tsx` does: a `<StrictMode>` inside the wrapper did not replay effects.

**From F2:** `GameConnection` implements `realtime/GameEvents.ts` and is passed as `createAppServices({ events })` in `main.tsx` (today a `NoGameEvents`). `TeamsStore` already refreshes the session on `TeamsChanged` and on a reconnect, and every store reloads what is loaded, so rule 6's `session.refresh()` is a harmless duplicate for the teams path. Test fakes: `FakeGameEvents` (`emitTeamsChanged()` …) and `createTestServices(overrides, fakes)`.

**Goal:** one SignalR connection per signed-in app, a round store every screen can read, and the pure rule that turns a snapshot into the buzzer's state. Bugs here show up as "my phone froze on event day", so the lifecycle rules below are the step.

**Packages:** `@microsoft/signalr`.

**Do**
- `src/realtime/types.ts`: the snapshot types and `RoundResult` from Appendix A.
- `src/realtime/GameConnection.ts`: interface + SignalR implementation. `start()`, `stop()`, `buzz()`, `beginRound()`, `nextTeam()`, `resetRound()` (each returns `Promise<RoundResult>`), and subscriptions that return an unsubscribe function: `onRoundUpdated`, `onAdminRoundUpdated`, `onTeamsChanged`, `onScoresChanged`, `onStateChanged` (`'disconnected' | 'connecting' | 'connected' | 'reconnecting'`). It implements F2's `GameEvents`. No MobX in this class.
- `src/test/fakes/FakeGameConnection.ts`: lets a test emit snapshots, change state and answer invocations.
- `src/stores/RoundStore.ts`: `connectionState`, `publicSnapshot`, `adminSnapshot`, and the commands (thin calls to the connection that return the `RoundResult`).
- `src/stores/ServerClock.ts`: the phone's clock is not the server's. On every snapshot store `offset = serverNow − local now`; `now()` returns local time plus the offset. F8's timer uses it. Takes the local clock as a constructor argument so tests control time.
- `src/domain/buzzerState.ts`: `getBuzzerState(snapshot, myTeamId)` → `{ state, position?, buzzedBy? }`:
  | Situation | State |
  |---|---|
  | No snapshot, phase `idle`, or I have no team | `waiting` |
  | Phase `open`, my team **not** in the queue | `ready` (the only state in which the buzzer can be pressed) |
  | My team's entry is `current` | `yourTeamUp` |
  | My team's entry is `waiting` (phase `open` or `locked`) | `queued`, with its position |
  | My team's entry is `passed` | `out` |
  | Phase `locked` or `exhausted`, my team not in the queue | `waiting` |
- `src/domain/roundErrors.ts`: error code → sentence for a person (Appendix A lists the codes).
- `src/app/RealtimeCoordinator.ts` (or inside `AppServices`): the lifecycle rules below, wired with MobX `reaction`s and the browser's `visibilitychange` event. This is the one place allowed to mix stores and the DOM.

**Lifecycle rules (each needs a test with the fake connection and fake timers)**
1. **Connect only while signed in.** Session becomes signed in → `start()`. Becomes anonymous → `stop()` and clear both snapshots.
2. **Role change → restart.** The hub keeps the identity it connected with. When `me.role` changes (a player was promoted), stop and start again; otherwise the new admin never receives admin snapshots.
3. **Drop stale snapshots.** Keep the highest `version` seen and ignore a lower one. Track the public and the admin stream separately.
4. **Forget the version when the connection drops or starts.** The server's version counter lives in memory and **restarts near zero when the server restarts**. If the client kept its old high number it would ignore every snapshot after a restart, for the rest of the night. Reset the held versions in `onreconnecting`, `onclose` and before every `start()`, so the snapshot the server sends on connect is always accepted. (Reset there, not in `onreconnected`: the first snapshot can arrive before that callback runs.)
5. **Never give up reconnecting.** SignalR's default policy stops after four tries (about 40 s); a locked phone is away far longer. Give `withAutomaticReconnect` a policy that keeps trying with a capped delay (for example 0, 1, 2, 5 s, then every 10 s). The first `start()` is not covered by automatic reconnect: retry it yourself with the same delays while still signed in.
6. **After every (re)connect:** call `session.refresh()` (`/me`). A `401` means the session ended: the session store goes anonymous and the guards show the join page. Then let the stores reload (`onReconnected`), because `TeamsChanged` / `ScoresChanged` sent while offline were missed.
7. **When the tab becomes visible again** (`visibilitychange`): if disconnected, start now instead of waiting for the next retry; call `session.refresh()`.
8. **StrictMode-safe.** `start()` while starting, `stop()` while starting, and start → stop → start in quick succession must leave exactly one live connection and no unhandled rejection.

**Watch out**
- The client never decides that a round has locked. It shows the last snapshot; `windowEndsAt` may drive a cosmetic countdown at most.
- `invoke` rejects when the connection is down or the server refuses (a non-admin calling a host method gets a `HubException`). `RoundStore` turns both into a failed `RoundResult`-like outcome the view models can show; it never throws into a view.
- A failed buzz can still mean the round changed (`changed: true` with `round.windowClosed`). Don't act on the result's `changed`; the snapshot that follows is the truth.
- Event names are exactly `RoundUpdated`, `AdminRoundUpdated`, `TeamsChanged`, `ScoresChanged`. Hub methods take **no arguments**.
- Vite's proxy needs `ws: true` for `/hubs` (set in F0); without it the connection falls back to slower transports or fails.
- Add a small dev-only page `/dev/realtime` (connection state, both snapshots as text, the three host buttons if admin) so this step can be checked before F5 and F8 exist. It is a view + view model like any other.

**Tests**
- Unit: `getBuzzerState` over the whole table with `it.each` across several team counts and positions; `RoundStore` version rules (rules 3 and 4, including the "server restarted" case: version 57 then a fresh connection sending version 1); `ServerClock`; the coordinator's rules 1, 2, 6, 7 with fakes; retry delays with fake timers.
- The real SignalR class has little logic left; cover its start/stop state machine (rule 8) with a stubbed `HubConnection`. Don't try to run a hub in Vitest.

**Check:** against the real backend, with `/dev/realtime` open in two browser windows (one player, one admin): Begin in the admin window shows `open` in both at once; the admin window has the admin snapshot and the player window doesn't; stop the API and start it again: both windows reconnect by themselves and show the idle round; lock the phone for a minute, unlock: the state is current within a second or two.

**Playwright candidates:** two browsers stay in sync through a round; server restart mid-round recovers without a reload; a player promoted to admin starts receiving the buzz list without signing in again; phone sleep/wake (needs a real device or network emulation).

**Developer does:** the restart check above (stop and start the API from Visual Studio while both windows are open).

---

## F5 — Play

**Model:** Sonnet 5.5. **Read also:** PlanMVP §9.3 "Colour clash", D9, D13.

**From F0:** `Buzzer` (`@/components/Buzzer`) takes `state`, `teamColorKey`, `label`, `sublabel?`, `disabled?`, `onPress`. It already fires on `pointerdown`, lets Enter/Space through once, ignores right clicks and (because browsers still send pointer events to a disabled button) ignores presses while `disabled`. The label for a state is `useCopy()[buzzerCopyKeys[state]]` (`@/theme/defaultCopy`). The view model should expose the queue position as a number; the view words it.

**Goal:** the player's screen: a big buzzer and the team queue.

**Do**
- `features/play/PlayViewModel.ts` (round store, session store, teams store) and `PlayPage.tsx`, using F0's `Buzzer` and F4's `getBuzzerState`.
- The view model exposes: the buzzer state with position and who buzzed; `canBuzz` (state is `ready` **and** connected **and** no buzz in flight); the queue rows (position, team name, who buzzed, status, "is my team", the team's colour and icon keys looked up from the teams store by team id); a connection notice when not connected; the last buzz error as text; and the `buzz` command.
- The view picks the label per state from the theme's `copy` (with the position filled in), shows the queue under the buzzer, and adds the buzzer and queue to `/dev/theme` with sample data if F0's preview doesn't already cover the queue.
- After a press: show "sent" at once (don't wait for the server to make the button feel dead), then let the next snapshot decide the real state. `round.unknownPlayer` means the player joined after this round began: say "You're in from the next round".

**Watch out**
- Nothing is sent with a buzz. No ids, no time.
- A team in the queue from the snapshot may be missing from the teams store (deleted or not loaded yet): fall back to the snapshot's team name and the pack's fallback visual; never crash or hide the row.
- The snapshot's team names are the names at Begin; the teams store has today's names. In the queue, show the snapshot's.
- A repeated press is harmless (the server ignores it) but the view model should still send only one buzz per `ready` state.
- An admin has no team and is redirected away from `/play` by the guard; the view model must still behave if constructed without a team (`waiting`).
- At 360 px the buzzer stays large and the queue scrolls beneath it for 13 teams.

**Tests**
- Unit: `PlayViewModel` for every buzzer state, `canBuzz` in each combination, the queue rows over several team counts, the missing-team fallback, one buzz per ready state, each error code's text.
- Integration: one flow on the real page with the fake connection (snapshot `open` → press → queued snapshot → locked snapshot shows "your team's up").

**Check:** two phones on different teams and an admin on `/dev/realtime`: Begin; both buzz; the order on both phones matches the server's; the second phone shows its position; Next team moves the turn; Reset returns both to waiting. A third player registering mid-round sees the "next round" message.

**Playwright candidates:** two contexts buzzing near-simultaneously show a consistent order; the buzzer responds to touch at 360 px; reduced-motion disables the blink.

**Developer does:** the two-phone check. This is the first step that feels like the product: note anything about size, wording or speed for F9.

---

## F6 — Teams

**Model:** Sonnet 5.5. **Read also:** PlanMVP §9.4, D17, D19–D21; Appendix A "Teams" and "Players".

**From F0:** `TeamCard` (`@/components/TeamCard`) takes `name`, `colorKey`, `iconKey`, `members: TeamCardMember[]` (`{ id, displayName, realName?, isViewer? }`, so map the wire `Member` in the view model) and two slots: `action` (the card's ⋮ menu) and `renderMemberAction(member)` (the per-member ⋮ or ✎). Member rows are already 44 px high. For the create-team picker, `AppServices.themes` (a `ThemeCatalog`, `@/domain/themeCatalog`) gives a view model the active pack's `colorKeys` and `iconKeys` without importing the theme; the view draws each key with `useTeamVisual`.

**Goal:** the shared Teams screen. Players see every team and edit their own names. Admins also rename, create and delete teams, edit anyone's names, move players and make admins.

**Do**
- `features/teams/TeamsViewModel.ts` and `TeamsPage.tsx`: a responsive grid of F0's `TeamCard`, in the server's order. Real names appear only where the server sent them (admins see all; a player sees their own).
- Each dialog has its own small view model and view:
  - **Edit names** (own row for players; any member for admins): display name and real name, both prefilled; send only the fields that changed; nothing changed → just close. Own edit uses `/api/players/me`, an admin editing someone else uses `/api/players/{id}`.
  - **Rename team** (admin).
  - **Move to…** (admin): lists the **other** teams; confirm; the player moves.
  - **Make admin** (admin): a confirmation that says plainly that the person leaves their team and that the app has no way to undo it.
  - **Add team** (admin): name, colour, icon. The colours offered are the active pack's colour keys **that no team uses yet** (the server refuses a duplicate colour); every icon key of the pack is offered. The view reads the keys from the pack and hands them to the view model as plain strings (a view model never imports the theme). When no colour is free, say so instead of showing an empty picker.
  - **Delete team** (admin): confirmation; a `409` means the team has players, scores or buzz history: show the server's text.
- Admin actions hang off the card's and members' action slots (a ⋮ menu). Players get one ✎ on their own row.
- All writes go through `TeamsStore` (F2), which reloads; the hub keeps other phones current.

**Watch out**
- Client-side checks match the server: person names 2–20, team names 2–24, after trimming. `409` on a name clash shows the server's text on the field it concerns.
- A move or rename applies to the **next** round (D13); if a round is running, say so in the dialog rather than surprising the host.
- The grid and every dialog must work for a team with no members, for 1 and for 13 teams, and when the viewer is an admin (who is on no team and appears on no card).
- `colorKey` and `iconKey` sent on create must be keys exactly as the pack has them (lower-case letters, digits, hyphens).
- No demote and no remove-player exists in the API. Don't invent UI for them.

**Tests**
- Unit: `TeamsViewModel` (cards for a player vs an admin, own-row marker, real-name visibility as given by the server, over several team counts and an empty team); each dialog view model (validation, only-changed-fields, the 409 cases, "other teams" list, free colour keys, no free colour).
- Integration: one admin flow (rename a team) and one player flow (edit own display name) through the page with MSW.

**Check:** as a player: see all teams, no one else's real name, edit your own display name and see it change on a second phone without a refresh. As an admin: rename, add a team with a spare colour, try to delete a team that has players (refused with a clear message), delete the empty new team, move a player, make a second admin and sign in as them.

**Playwright candidates:** a rename on one device appears on another without reload; a player cannot reach admin actions by URL or DOM; keyboard-only use of the ⋮ menu and dialogs.

**Developer does:** the two-device check, and decide whether the spare colours from F1 look right next to the six.

---

## F7 — Scores

**Model:** Sonnet 5.5. **Read also:** PlanMVP D25, D26; Appendix A "Scores".

**From F0:** format scores with `useFormatScore()` (`@/theme/useThemePack`); it applies the pack's `numbers.scoreDigits` and puts a minus sign before the padding. Use `appTokens.fontNumeric` for score text.

**Goal:** the team leaderboard for everyone and the scoring screen for admins.

**Do**
- `/scores` — `LeaderboardViewModel` + page: teams in the server's order with rank, colour, icon, name and total; equal totals share a rank (the server sends it: don't compute ranks); the viewer's own team is marked. The view pads the total per the pack's number format. Admins see the same page.
- `/admin/scores` — `AdminScoresViewModel` + page:
  - Team rows on top, player rows below with **Sort by: Team / Score**. The sort is the pure `sortPlayerScores(rows, mode, teamOrder)` in `domain/`: *Team* = the server's team order, then display name, then id; *Score* = total descending, then display name, then id. Players without a team come last in *Team* mode.
  - Entry: pick one target (a team or a player), amount (whole number above 0), multiplier (1–100, default 1), optional reason (up to 200 characters), then **Add** or **Remove**. Show the result before sending ("+ 30", "− 30").
  - Recent adjustments (20), newest first as the server sends them: target, signed amount, reason, who, when, and **Undo**. Undo is hidden on a row that is itself an undo (`reversesAdjustmentId` set) and disabled on a row already undone (`isReversed`).
- Writes go through `ScoresStore`, which reloads team scores, player scores and the recent list.

**Watch out**
- Team and player scores are separate ledgers (D25). Adding to a player does not change the team's total; don't suggest it does.
- `400` errors arrive per field (`amount`, `multiplier`, `targetId`, `reason`); `409` on undo means someone else already undid it: show the text and reload.
- Two admins score at once on the night. Never assume the list on screen is current: after any write, reload; the hub covers the other admin's phone.
- Totals can be negative. The padded format must cope (`-0050` is ugly: decide the rule in the view's formatter, test it).
- The player list has every player of the event; it must stay usable at 360 px with 40 or more rows.

**Tests**
- Unit: `sortPlayerScores` in both modes with ties, missing teams and exact expected order; the leaderboard view model (own team marker, shared ranks shown as sent, several team counts); the admin view model (entry validation, signed preview, Undo visibility rules, error cases); the score formatter including negatives.
- Integration: add points to a team through the page with MSW and see the total and the recent list change.

**Check:** two admins and a player: add, remove and undo for a team and for a player; the player's `/scores` updates without a refresh; a second undo of the same row is refused politely; sort by team and by score.

**Playwright candidates:** leaderboard updates live on a second device; two admins adjusting at the same moment both end up with the same totals; undo twice.

**Developer does:** the two-admin check.

---

## F8 — Host and event admin

**Model:** Sonnet 5.5. **Read also:** PlanMVP D10–D12, D29; Appendix A "Hub" and "Archive".

**From F2:** `services.archive` is the `ArchiveApi` (no store). `finalize()` returns the event id the export link needs. F2 also added `exportArchive(eventId)`, which holds the file in memory as a `Blob`: not wanted here (see the last Watch-out). Use the plain link and delete that method and `ApiClient.download` if nothing else uses them.

**Goal:** the host runs a whole round from a phone, and can finalize and export the event.

**Do**
- `/admin` — `HostViewModel` (round store, server clock) + page:
  - **Begin**, **Next team**, **Reset**, each enabled only when it can work: Begin in `idle`; Next team in `locked`; Reset in any phase except `idle`. Each is disabled while its call is in flight. A refused call shows the sentence for its error code (`round.emptyRoster`: "No players have joined a team yet").
  - The team queue with the current team marked (text, not only colour), and the **elapsed time** since the current team's turn began: `ServerClock.now() − currentSince`, never below zero, ticking a few times a second. The tick is a timer started in `activate()` and cleared in `dispose()`.
  - The full buzz list from the admin snapshot, in the order sent: `#1 Alice (Team) +0.00s`, and `#2 Bob (Team) +0.21s · not counted` when `countedForTeam` is false. The formatting is a pure function in `domain/`.
  - Phase shown in words ("Waiting for buzzes", "Locked", "Every team has passed").
- `/admin/event` — `EventAdminViewModel` + page: **Finalize** (confirmation; it can be run again and replaces the archive) showing when it was finalized, and **Export**, a normal link to `/api/archive/{eventId}/export` so the browser downloads the file.
- Remove the `/dev/realtime` page's host buttons if they now duplicate this screen (keep the page as a debugging view).

**Watch out**
- Two hosts may press at once. The server refuses the second; show its message quietly and trust the snapshot.
- All state comes from the admin snapshot. Never keep a local copy of the queue or guess the next team.
- Reset is the normal end of a question (award points on `/admin/scores`, then Reset). No confirmation on it, but it must not fire twice from a double tap.
- A just-promoted admin gets the admin snapshot only after the connection restarts (F4 rule 2); until it arrives, show "connecting" rather than an empty buzz list.
- **Open item (don't solve silently):** the event id needed for the export link is returned only by the finalize call. So Export is available after Finalize has been pressed in this session; that is acceptable because finalizing again is harmless. Showing Export without finalizing first would need the event id on `GET /api/event` (a backend change). Build the first behaviour and leave the note for F9 and the developer.
- The exported file holds real names. Don't keep it in memory or storage; let the browser download it.

**Tests**
- Unit: `HostViewModel` (which buttons are enabled in each phase, in-flight disabling, each error code, queue rows, the elapsed time with fake timers and a fake clock, timer cleared on dispose); the buzz-line formatter (`+0.00s`, rounding, "not counted"); `EventAdminViewModel` (export available only after finalize, errors).
- Integration: a round on the real page with the fake connection: Begin → snapshots → Next team → Reset.

**Check:** on a phone as admin, with two players on other phones: run three full rounds (one where every team buzzes, one that locks by the timer with a single buzz, one passed through to "every team has passed"); the timer counts from the moment a team becomes current; the buzz list shows teammates' later buzzes as not counted; award points between rounds; Finalize, then Export downloads `buzzer-archive-<year>.json`.

**Playwright candidates:** a full round across three browser contexts; two hosts pressing Begin together; export downloads a file with the expected name.

**Developer does:** the full-round check on real phones. **Don't commit the exported file** (it is git-ignored, and it contains real names).

---

## F9 — Whole-frontend review and live walkthrough

**Model:** Fable. **Read:** everything a worker reads, plus all DONE notes, and PlanMVP in full. This step may read `docs/BackendSteps.md` "B9" for how the backend walkthrough was run.

Each step was built in isolation, mostly by smaller models. This step finds what they missed and proves the app works end to end once, before deployment.

**1. Review** (report findings first, grouped by severity; then fix in small commits, each with a test that failed before the fix where a test is possible)
- **Architecture:** every layer rule in the shared table (the lint rules prove imports; read for logic that leaked into views, React that leaked into view models, a store bypassed by a view model calling an API, duplicated rules that should be one function in `domain/`).
- **Theme separation:** switch the event to the `default` pack and use every screen. Anything that looks broken or still looks "arcade" is a leak. Would next year's pack need a component change? If so, the contract is missing a slot.
- **Other years:** search for the 2026 team names, colour keys, icon keys and the number six outside `packs/arcade-2026/`. Run the app against 3 teams and against 8 (the backend's `Event:Teams` config with a fresh join code).
- **Lifecycle:** F4's eight rules, re-read against the code and the tests.
- **Security and privacy:** nothing sent with a buzz or host action; real names shown only where the server sent them; no real names or exports kept in storage; admin screens unreachable for players (guards and the server's 403 both).
- **Tests:** tests that can pass for the wrong reason, missing error cases, real timers, hard-coded 2026 data, an integration test that repeats what unit tests already prove.
- **Quality:** readable by a person new to React; names say what things are; no dead code, no leftover dev scaffolding in the production bundle (`/dev/*` routes are dev-only); bundle size sane for a phone on 4G.
- **Accessibility and devices:** 360 px, keyboard, focus, text with every colour, reduced motion.

**2. Live walkthrough** (as B9 did for the backend; nothing from it is committed)
- A **separate** PostgreSQL container and environment variables for the API, never the developer's dev database or User Secrets. Build the frontend, serve it from the API (`wwwroot`, git-ignored) so the real same-origin setup is what is tested, and also run it once through the Vite dev server.
- Drive real browsers (whatever automation the session has; a throwaway Playwright script in the scratchpad is fine) with several players on several teams and two admins: join and sign-in with every error case; names hidden and shown correctly; team admin; scoring and undo; several rounds including near-simultaneous buzzes; **restart the API mid-round** and confirm every client recovers without a reload; promote a player and confirm they become a host without signing in again; finalize and export.
- Repeat the core path with a different team count and with the `default` pack.

**3. Wrap up**
- Decide the F8 open item (export before finalize) with the developer.
- Check what deployment will need and note it for Milestone R: the API serves `index.html` with caching headers that won't leave a phone on an old build after a redeploy (there is no service worker, so this is the only stale-app risk); the web manifest and Screen Wake Lock belong to R1.
- Tidy Appendix B into a prioritised Playwright backlog (which five would catch the most).
- Update `docs/PlanMVP.md`, `CLAUDE.md` and this file for anything that changed, add an entry to `docs/DecisionLog.md`, and mark F9 done.

**Developer does:** read the findings report before the fixes go in; answer the open items; then plan Milestone R (deployment).

---

## Appendix A — API and hub quick reference

Taken from the backend's `*Contracts.cs`, snapshot records and error codes on 10 Nov 2026. If this disagrees with the C#, the C# is right: tell the developer.

**Conventions.** All routes under `/api`. JSON is camelCase. Enums are camelCase strings. Dates are ISO 8601 strings in UTC. Auth is a cookie the browser handles by itself (same origin); there is no token to store. Any route may answer `401` (not signed in) or, on admin routes, `403` (signed in, not an admin).

**Errors** are ProblemDetails (`Content-Type: application/problem+json`):
```ts
interface ProblemDetails {
  title?: string;                          // short summary
  status?: number;
  detail?: string;                         // a sentence for the person, when there is one
  errors?: Record<string, string[]>;       // 400 validation only: request field name → messages
}
```
`429` also carries a `Retry-After` header in whole seconds.

**Input rules** (the server enforces them; mirror them client-side): person names 2–20 characters after trimming; team names 2–24; PIN exactly 4 digits `0-9`; colour and icon keys `^[a-z0-9-]{1,50}$`; adjustment amount a whole number above 0; multiplier 1–100; reason at most 200 characters.

```ts
type PlayerRole = 'player' | 'admin';
type RoundPhase = 'idle' | 'open' | 'locked' | 'exhausted';
type TeamTurnStatus = 'waiting' | 'current' | 'passed';
type ScoreTarget = 'team' | 'player';
type ScoreDirection = 'add' | 'remove';

interface EventInfo { name: string; year: number; themeKey: string }
interface JoinTeam { id: number; name: string; colorKey: string; iconKey: string; memberCount: number }

interface Me { playerId: number; realName: string; displayName: string; role: PlayerRole; teamId: number | null; teamName: string | null }

interface Member { playerId: number; displayName: string; realName: string | null }   // realName: admins and the caller's own row only
interface Team { id: number; name: string; colorKey: string; iconKey: string; sortOrder: number; members: Member[] }
interface TeamSummary { id: number; name: string; colorKey: string; iconKey: string; sortOrder: number }

interface Player { id: number; realName: string; displayName: string; role: PlayerRole; teamId: number | null; teamName: string | null }

interface TeamScore { teamId: number; name: string; colorKey: string; iconKey: string; total: number; rank: number }
interface PlayerScore { playerId: number; displayName: string; realName: string; teamId: number | null; teamName: string | null; total: number }
interface Adjustment {
  id: number; target: ScoreTarget; targetId: number; targetName: string;
  amount: number;                          // signed: negative for a removal or an undo of an addition
  reason: string | null;
  reversesAdjustmentId: number | null;     // set when this row is an undo
  isReversed: boolean;                     // true when this row has been undone
  createdAt: string; createdByDisplayName: string;
}

interface FinalizeResponse { eventId: number; year: number; schemaVersion: number; finalizedAt: string }
```

### Event (no session needed)
| Method and route | Success | Failures |
|---|---|---|
| `GET /api/event` | `200 EventInfo` | `404` no active event |
| `GET /api/event/teams?code=XXXX` | `200 JoinTeam[]` (display order) | `404` wrong code; `429` |

### Session
| Method and route | Body | Success | Failures |
|---|---|---|---|
| `POST /api/session/register` (no session) | `{ joinCode, realName, displayName, pin, teamId }` | `201 Me`, signed in | `400` fields; `404` wrong code; `409` name taken (`detail` says which and what to do); `429` |
| `POST /api/session/signin` (no session) | `{ joinCode, realName, pin }` | `200 Me`, signed in | `400` fields; `401` "Real name or PIN is incorrect." (also for a wrong code); `429` after 5 attempts in 5 minutes for one name |
| `POST /api/session/signout` | — | `204` | |
| `GET /api/session/me` | — | `200 Me` (read from the database: current names, team and role) | `401`: the session has ended (the server clears the cookie) |

### Teams
| Method and route | Who | Body | Success | Failures |
|---|---|---|---|---|
| `GET /api/teams` | signed in | — | `200 Team[]` (teams in display order, members by display name) | |
| `POST /api/teams` | admin | `{ name, colorKey, iconKey }` | `201 TeamSummary` | `400` fields; `409` name or colour in use |
| `PATCH /api/teams/{id}` | admin | `{ name }` | `200 TeamSummary` | `400`; `404`; `409` name in use |
| `DELETE /api/teams/{id}` | admin | — | `204` | `404`; `409` the team has players, scores or buzz history |

### Players
| Method and route | Who | Body | Success | Failures |
|---|---|---|---|---|
| `GET /api/players` | admin | — | `200 Player[]` (by display name; includes admins) | |
| `PATCH /api/players/me` | signed in | `{ displayName?, realName? }` (a missing or null field is left unchanged; at least one is required) | `200 Player` | `400`; `409` name taken |
| `PATCH /api/players/{id}` | admin | same | `200 Player` | `400`; `404`; `409` |
| `PATCH /api/players/{id}/team` | admin | `{ teamId }` | `200 Player` (also when already on that team) | `400` unknown team (field `teamId`) or the target is an admin; `404` |
| `POST /api/players/{id}/promote` | admin | — | `200 Player` (role `admin`, no team; also when already an admin) | `404` |

### Scores
| Method and route | Who | Body | Success | Failures |
|---|---|---|---|---|
| `GET /api/scores/teams` | signed in | — | `200 TeamScore[]` (total descending, then display order; equal totals share a `rank`: 1, 1, 3) | |
| `GET /api/scores/players` | admin | — | `200 PlayerScore[]` (total descending, then display name; players only, no admins) | |
| `GET /api/scores/adjustments?take=20` | admin | — | `200 Adjustment[]` (newest first; `take` 1–100) | |
| `POST /api/scores/adjustments` | admin | `{ target, targetId, amount, multiplier, direction, reason? }` | `201 Adjustment` | `400` fields |
| `POST /api/scores/adjustments/{id}/reverse` | admin | — | `201 Adjustment` (the undo row) | `400` that row is itself an undo; `404`; `409` already undone |

### Archive
| Method and route | Who | Success | Failures |
|---|---|---|---|
| `POST /api/archive/finalize` | admin | `200 FinalizeResponse` (can be repeated; replaces the archive) | |
| `GET /api/archive/{eventId}/export` | admin | the file `buzzer-archive-<year>.json` (contains real names) | `404` not finalized, or not this admin's event |

### Hub `/hubs/game` (SignalR, needs a session)

```ts
interface TeamQueueEntry { position: number; teamId: number; teamName: string; buzzedByDisplayName: string; status: TeamTurnStatus }

interface PublicRoundSnapshot {
  version: number;                 // rises by 1 with every change; restarts when the server restarts
  roundId: string | null;          // null while idle
  phase: RoundPhase;
  roundStartedAt: string | null;
  teamQueue: TeamQueueEntry[];     // in buzz order; one entry per team
  currentTeamId: number | null;
  windowEndsAt: string | null;     // set after the first buzz while open
  serverNow: string;               // the server's clock when the snapshot was made
}

interface BuzzEntry { sequence: number; playerId: number; displayName: string; teamId: number; teamName: string; offsetMs: number; countedForTeam: boolean }

interface AdminRoundSnapshot extends PublicRoundSnapshot {   // sent as its own message; same fields plus:
  buzzes: BuzzEntry[];             // every buzz in arrival order, teammates' later ones included
  currentSince: string | null;     // when the current team's turn began
}

interface RoundResult { success: boolean; error: string | null; changed: boolean }
```

| Direction | Name | Who | Notes |
|---|---|---|---|
| server → client | `RoundUpdated(PublicRoundSnapshot)` | everyone | Also sent once to each connection when it connects |
| server → client | `AdminRoundUpdated(AdminRoundSnapshot)` | admins | Also sent on connect to an admin |
| server → client | `TeamsChanged()` / `ScoresChanged()` | everyone | No payload: reload the data |
| client → server | `Buzz()` | players | No arguments. Returns `RoundResult` |
| client → server | `BeginRound()`, `NextTeam()`, `ResetRound()` | admins | No arguments. Return `RoundResult`. A non-admin call is rejected with an error, not a `RoundResult` |

Round phases: `idle` (no question) → Begin → `open` (buzzing; the first buzz starts a 2-second window) → `locked` (queue fixed, one team `current`) → Next team … → `exhausted` (every queued team passed). Reset returns to `idle` from anywhere. The roster is fixed at Begin: someone who joins or is moved during a round takes part from the next one.

| `RoundResult.error` | Meaning |
|---|---|
| `round.notIdle` | Begin while a round is running |
| `round.notOpen` | Buzz when buzzing isn't open |
| `round.windowClosed` | Buzz just after the window ended (the round locked) |
| `round.unknownPlayer` | The buzzer isn't in this round's roster (joined or moved after Begin, or has no team) |
| `round.notLocked` | Next team when no team is answering |
| `round.emptyRoster` | Begin when no player is on a team |
| `round.duplicatePlayer` | Should not happen; show a generic message |

A repeated buzz from the same player returns `success: true, changed: false`.

---

## Appendix B — Playwright backlog (not part of the MVP)

End-to-end tests are a later addition (PlanMVP §11). Each step appends the scenarios from its brief that it still thinks are worth automating, plus any it discovered. F9 puts them in priority order.

| Step | Scenario | Why it needs a real browser |
|---|---|---|
| F0 | `/dev/theme` renders every registered pack (switch through all of them) without console errors | Real CSS, real asset loading and Fluent's portals; jsdom has no layout and stubs `ResizeObserver` |
| F0 | One tap on the buzzer counts exactly one press ("Presses" on `/dev/theme`), also a fast double tap, and the page doesn't zoom | `pointerdown` vs click and `touch-action` only behave for real on a touch screen |
| F0 | `/dev/theme` at 360 px wide, 1 and 13 teams, longest names: no horizontal scroll, names wrap | Layout and wrapping need a real rendering engine |
| F0 | A dialog and a menu opened on `/dev/theme` use the selected pack's look | Portals render outside the page tree; only a browser shows that the CSS variables reach them |
| F1 | Visual snapshots of `/dev/theme` per registered pack, at 360 px and desktop width | The one place a screenshot catches a regression no unit test can: fonts that fail to load, wrapped or clipped text, a colour that clashes |
| F1 | With `arcade-2026` selected, the longest buzzer label ("WAITING FOR HOST") and a 24-character team name stay inside the buzzer and the card at 360 px | Glyph widths of Press Start 2P only exist in a real rendering engine |
| F2 | Start the app with the API stopped, then start the API: does it show the default theme at once and switch to the event's theme without a manual reload? | Today the event is loaded once at start and not retried; only a real browser and a real server restart show whether that is acceptable (F9 decides) |
| F2 | Sign in on a phone, delete the session cookie (or restart the API with a new key), tap anything: the app returns to the join page | The cookie handling and the 401 rule (`onSessionExpired`) are tested with MSW, but only a browser proves the real cookie behaves the same |
| F2 | Sign out, then a different person signs in on the same phone: no team list or score of the first person is visible, not even for a moment | The stores reset on a change of person (unit-tested); a browser shows there is no flash from React's own rendering |
