# Playwright draft — the F9 live walkthrough

> **Audience:** whoever starts the post-MVP Playwright work (PlanMVP §11, O10).
> **This is a draft, not a test suite.** Nothing here is run by `npm test`, by `npm run lint` or by CI, and the MVP does not depend on it. It is the script F9 used on 11 Nov 2026 to drive the finished app in real browsers, kept so the real tests don't start from nothing. What to automate first is in `docs/FrontendSteps.md`, Appendix B.

## What is here

| File | What it does |
|---|---|
| `walk.mjs` | One games night from start to finish with six browser contexts at phone size (a visitor, four players, a host): join and its error cases, register / refresh / sign out / sign in, taken names and the rate limit, who sees which names, team edits, scores and undo, two rounds, an API restart in the middle of a round, a promotion with two hosts, the guards, finalize and export, the error screen, and a session that ends while connected. 106 checks |
| `lib.mjs` | Helpers: start and stop the published API, open a phone-sized browser, register and sign in, read the buzzer and the queue, record a check |
| `probe-wide.mjs` | Measures every admin screen at 360 px and names what sticks out past the screen |

It passed in four set-ups: arcade pack with six teams, `default` pack with three, arcade pack with eight (one 24-character name), and through the Vite dev server.

## How F9 ran it

Everything is separate from the developer's database and User Secrets.

1. A throwaway database: `docker run -d --name buzzer-uat -e POSTGRES_USER=uat -e POSTGRES_PASSWORD=<pick one> -e POSTGRES_DB=buzzer_uat -p 127.0.0.1:5437:5432 postgres:16-alpine`
2. A published API with the built frontend in its `wwwroot`, in a folder **outside the repo**: `dotnet publish backend/src/BuzzerApp.Api -c Release -o <folder>`, then `npm run build` in `frontend/` and copy `frontend/dist/*` into `<folder>/wwwroot`.
3. In this folder: `npm install` (only `playwright-core`; it drives the Edge that Windows already has, so no browser download).
4. Two environment variables, then run:
   - `UAT_API_DIR`: the folder from step 2.
   - `UAT_CONNECTION_STRING`: `Host=localhost;Port=5437;Database=buzzer_uat;Username=uat;Password=<the one you picked>`
   - `node walk.mjs arcade6` (the label only names the screenshots, which go to `shots/`).

The script starts the API itself on port 5290 in Production mode, with a new join code every run. A new join code is a new, empty event, so every run starts clean on the same database. Another team count or theme: edit `Event` in the **published copy's** `appsettings.json`. Through the dev server: start `npm run dev` and run with `PORT=5283 BASE=http://localhost:5173`.

Remove the container afterwards: `docker rm -f buzzer-uat`.

## What to change to make it a real suite

- It is one long script: a failure early on changes what later steps see. Split it into independent tests with their own event (a join code each) and fixtures for "a host and N players".
- It waits with fixed sleeps and polling in places (`sleep`, `until`). Use Playwright's own `expect(...).toBe…` waits.
- It needs `@playwright/test`, a config, and the API and a database in CI.

## What it taught

- The ready buzzer pulses, and Playwright waits for an element to stop moving before it taps: use `tap({ force: true })`, or emulate reduced motion.
- A phone-emulated page widens itself to fit content that is too wide, so compare `scrollWidth` with the configured viewport width (`overflowsSideways` in `lib.mjs`), not with `clientWidth`. When a page is too wide, clicks land in the wrong place ("… intercepts pointer events"): measure the page before suspecting the button.
- Once a team is in the queue its teammates' buzzers stop being pressable, so a "not counted" buzz needs both presses in one `Promise.all`.
- Role queries need `exact: true` ("Extra 1" also matches "Extra 10"), and Fluent's message bar is `role="group"`, not `alert`.
- Two hosts pressing Begin "together": the second press may find the button already greyed. `click({ force: true })`, as a finger would.
