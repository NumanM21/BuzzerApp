# Decision log

A dated record of changes to the plan: what changed, why, and who decided. It is history for the developer.
AI sessions doing a normal step **don't need to read this file**; the current rules are in `PlanMVP.md`, `FrontendSteps.md` and `CLAUDE.md`. A session that changes a decision **adds an entry at the top** (newest first).

Earlier history, before this file existed: the "Changed …" notes inside `PlanMVP.md` §3, and the DONE notes in `BackendSteps.md` (its B9 section lists what the backend review changed).

---

## 11 Nov 2026 — One manual checklist, fed by every step

**Decided by:** the developer, after F6.

| # | Change | Why |
|---|---|---|
| 1 | **`docs/ManualTestChecklist.md` is the single list of what to try by hand.** Every step (frontend; the same rule is in `CLAUDE.md` for any step) adds one row per manual check, with what to do and what to expect, written for someone who did not read the code, before it marks itself done. F0–F6 were backfilled from their briefs and DONE notes. | The deferral below (manual testing at the end) meant the checks were scattered across DONE notes. The developer wants a proper start-to-finish walkthrough, not a hunt |
| 2 | **F9 assembles the walkthrough**: dedupes, orders it, writes section 7 (a whole games night), and marks which rows its live run already proved. | One person-sized session instead of twenty fragments |
| 3 | **F9 must settle a known duplicate:** `JoinViewModel`'s own server-error-to-field mapping (F3) versus the shared `mvvm/FormSubmission.ts` / `readFailure` that F6 added. Recorded in the F3 and F6 DONE notes and in the F9 brief. | F6 chose not to touch the join screen; the duplicate would otherwise be forgotten |

---

## 11 Nov 2026 — Manual testing deferred to the end

**Decided by:** the developer, during F5.

| # | Change | Why |
|---|---|---|
| 1 | **No manual testing until every B and F step is complete, just before deployment.** The briefs' "Check" and "Developer does" items (phones, two-browser checks, the real backend, looking at `/dev/theme`) wait for one hands-on pass at that point. A step is done when lint, build and tests pass; each DONE note lists the manual checks it did not run. | The developer wants to finish building first, then get hands-on with the whole codebase and app once, instead of context-switching into testing after every step |

Recorded in `CLAUDE.md` (working rules) and `docs/FrontendSteps.md` (developer guide, "Done" definition). The briefs themselves are unchanged, so they still describe the checks to do then. F9's live walkthrough is not changed by this decision.

---

## 10 Nov 2026 — Planning Milestone F (frontend)

**Session:** Fable, with the developer answering questions. Branch `frontend-f0`. Documentation only; no code was written.

**Why this session happened.** The backend is finished. The frontend will be built one step at a time in fresh chats by Sonnet 5.5 or Opus 5.5 (cheaper than Fable), with a Fable review at the end. Those sessions need a brief precise enough that a smaller model builds the right thing, and short enough that it doesn't spend its budget reading backend history.

### Decisions

| # | Change | Decided by | Why |
|---|---|---|---|
| 1 | **Frontend architecture is MVVM with MobX view-model classes** (new D34). Views are `observer` components with no logic; one MobX class per screen holds state and commands | Developer (chose it over "immutable view-model class + hook" and "hook-only view models") | Wanted view and view-model logic in their own classes, as in C# MVVM, mainly so logic is tested without a browser |
| 2 | **MobX stores replace TanStack Query** (D30 changed) | Developer, on Fable's recommendation | TanStack Query is hook-based and can't be called from a class. Keeping it beside MobX means two state systems and view-model tests that need a `QueryClient`. The app has about 20 routes, so small store classes cover loading and reloading |
| 3 | **Plain web app, no service worker** (D1 and R1 changed). A web manifest and Screen Wake Lock stay in R1; PWA install/offline moved to optional O9 | Developer | Easier, and a cached app shell is the usual way phones end up on an old build on event day. Nothing needs offline use. The app is deployed to Azure for the event week and served by the API |
| 4 | **Admins create and delete teams in the Teams screen** (D17 reworded; F6 grew). Teams known in advance are still pre-created from config | Developer | Config seeding covers the planned teams; the UI covers a change on the night. The API already supported it |
| 5 | **Theme packs carry spare team colours and a generic icon** (D31, §9) | Fable, following from 4 | A team created on the night needs a colour no other team uses and an icon, and both must come from the pack, not from a component |
| 6 | **Theme packs are data only, checked by a contract test over every registered pack; `docs/ThemePacks.md` (F1) explains adding one** (D31) | Fable, from the developer's requirement | The developer wants to hand next year's design to an AI and get a pack back without touching components. Data-only packs make that a fill-in-the-object task, and the test checks the result |
| 7 | **Step order: join/sign-in is F3, realtime is F4** (they were F4 and F3) | Fable (proposed in the plan, approved) | The realtime step can only be checked in a browser once someone can sign in and hold a cookie |
| 8 | **Vitest, React Testing Library and the CI test step start in F0**, not F3. MSW arrives in F2 | Fable (proposed, approved) | With MVVM every step from F0 has classes worth testing; the patterns should exist before the first feature copies them |
| 9 | **Frontend test strategy** (D32 changed): unit tests for domain functions, view models and stores; a few integration tests per feature; **Playwright not in the MVP**, with candidates collected per step (FrontendSteps Appendix B, optional O10) | Developer (unit tests, some integration, Playwright later) | Test where the logic is. End-to-end tests need the API and a database in CI and are a project of their own |
| 10 | **F9 added:** a whole-frontend review and live walkthrough by Fable | Developer | Same reason B9 existed: steps built in isolation by smaller models need one pass that reads everything and runs it for real |
| 11 | **Suggested models:** Opus for F0 (it sets the patterns every later step copies) and F4 (connection lifecycle); Sonnet for the rest; Fable for F9 | Fable | Spend the stronger model where a mistake is copied or only shows on a real phone |

### Things found while reading the backend that the frontend plan now covers

- **The round snapshot's `version` restarts when the server restarts** (it is an in-memory counter). A client that kept its old, higher number would ignore every later snapshot. F4 forgets the held version whenever the connection drops or starts. Also added to `CLAUDE.md` "Must never happen".
- **SignalR's default reconnect gives up after about 40 seconds**; a locked phone is away longer. F4 uses a policy that never gives up and reconnects when the tab becomes visible.
- **Hub notifications can be missed while a phone is offline**, so stores reload after every reconnect, and after their own writes rather than waiting for the notification.
- **`401` means two different things:** "wrong name or PIN" from sign-in, and "your session ended" everywhere else. The API client treats them differently (F2).
- **The buzzer fires on pointer-down, not click** (click fires on release, which costs time in a race) (F0).
- **Export needs the event id, and only the finalize response returns it.** F8 offers Export after Finalize in the same session. Left as an open item for F9 and the developer; the alternative is a small backend change (`eventId` on `GET /api/event`).
- **`erasableSyntaxOnly` is on in the TypeScript config**, so `enum` and constructor parameter properties (`constructor(private x: X)`) don't compile. Both are habits from C# and from older MobX examples, so the shared rules and `CLAUDE.md` call them out.
- **Several packages are newer than an AI model may assume** (MobX 7, react-router 8, Vitest 5, MSW 3, TypeScript 6, Vite 8). Versions were checked on the npm registry on this date; workers are told to read current documentation.

### Files changed

| File | Change |
|---|---|
| `docs/FrontendSteps.md` | **New.** Developer guide (what is done by hand), shared rules, briefs F0–F9, Appendix A (API and hub as TypeScript types, taken from the C# contracts), Appendix B (Playwright backlog, empty) |
| `docs/DecisionLog.md` | **New.** This file |
| `docs/PlanMVP.md` | v2.5. §0 rules 7 and 10; §1 Teams screen; §2 docs in the tree; §3 D1, D17, D30, D31, D32, D33 changed and D34 added; §5 diagram line; §6 glossary (MVVM, MobX, store); §9 principle, layout, contract note, spare keys, team card; §10 Milestone F table and folder structure; R1; §11 O9 and O10 |
| `CLAUDE.md` | What to read per kind of task; working rules ("Do F<n>" is go, no push or PR); frontend layout and where a frontend test goes; `npm test`; frontend entries under "Must never happen" |
| `docs/BackendSteps.md` | Two lines: a pointer to `FrontendSteps.md`, and the B9 "For F3" note now names F4 |

### Not decided here

- Whether Export should work without finalizing first (see above). F9.
- A deployment guide for Azure (Milestone R: R2, R3). The checklist from B9 is in PlanMVP R2; step-by-step portal instructions have not been written.
- The exact `ThemePack` contract: PlanMVP §9.2 is the starting sketch, F0 finalises it and updates §9.2.
