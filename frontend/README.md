# BuzzerApp frontend

React 19 + TypeScript + Vite, Fluent UI v9, MobX (MVVM), react-router. The plan and the step briefs are in
[`docs/PlanMVP.md`](../docs/PlanMVP.md) and [`docs/FrontendSteps.md`](../docs/FrontendSteps.md); the latter's
"Shared rules for every worker" is the coding guide.

## Run

```sh
npm install
npm run dev          # http://localhost:5173 (add -- --host to open it from a phone on the same Wi-Fi)
```

The dev server forwards `/api` and `/hubs` to the API at `http://localhost:5283`, so start the backend for anything
that talks to the server. `/dev/theme` (development only) previews every theme pack.

## Check

```sh
npm run lint         # ESLint, zero warnings; also enforces the layer rules below
npm run build        # type-check (tests included) and production build
npm test             # Vitest, once; `npm run test:watch` to keep it running
```

The tests need neither the backend nor Docker.

## Folders (`src/`)

Dependencies point one way: views → view models → stores → services, with `domain/` usable from all of them.

| Folder | What lives there |
|---|---|
| `app/` | Composition root (`createAppServices`), routes, `useViewModel` |
| `domain/` | Pure rules and types; imports nothing else |
| `api/`, `realtime/` | Services: plain classes that talk to the server |
| `mvvm/` | `Loadable`, `Command`, MobX configuration |
| `stores/` | MobX classes that own server data for the app's lifetime |
| `features/<feature>/` | `XxxPage.tsx` (view) + `XxxViewModel.ts` (MobX, no React) + tests |
| `components/` | Shared presentational components (props in, events out) |
| `theme/` | Theme pack contract, registry, `ThemeRoot`, token helpers; `packs/<key>/` holds each pack (data only) |
| `test/` | Test setup, `renderWithApp`, factories, fakes |

Styling: Fluent `tokens` and `appTokens` only. Colours, fonts, radii and shadows are written in `theme/packs/` and
nowhere else (a test checks).
