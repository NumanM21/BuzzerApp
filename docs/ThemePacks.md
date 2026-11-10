# Theme packs: how to add next year's look

> **Audience:** the developer, and future AI sessions asked to build a pack.
> The contract lives in `frontend/src/theme/types.ts` (every field has a comment there); PlanMVP §9 has the reasoning.

## What a pack is

A pack is **one typed object** in `frontend/src/theme/packs/<key>/index.ts` (plus the image files and fonts it needs, in the same folder). It says how the event looks: colours, fonts, corner shape, borders, shadow, the buzzer's look per state, the team colours and icons, how scores are written, and a few pieces of flavour text.

Components never hold a look. They read it through Fluent `tokens`, `appTokens`, `useTeamVisual`, `useCopy`, `useFormatScore` and `useThemePack`. So a redesign is a new pack plus one server setting, and no component changes.

**A pack must not contain** components, JSX, hooks, logic, or anything that reads the server or the stores. It is data. Small constants shared inside the file (`const ink = '#111111'`) are fine; behaviour is not. If a design needs something the contract can't say (a new slot), **add the slot** to `types.ts`, to the `default` pack and to `packs.contract.test.ts`, and make the components read it. Don't special-case one pack in a component.

Colours, fonts, radii and shadows are written **only** inside `theme/packs/`. `noHardcodedStyle.test.ts` fails the build otherwise.

## The contract, field by field

| Field | What it means |
|---|---|
| `key` | The folder name, the registry key and the value of the event's `Event:ThemeKey` on the server. Must be identical in all three. |
| `fluent.mode` | `light` or `dark`. Decides which Fluent base theme is built. |
| `fluent.brand` | Fluent's 16-step colour ramp (10 darkest … 160 lightest). Fluent paints primary buttons, links, focus rings and selected controls from it. For a dark theme the useful part is 70 (button fill) and 100–110 (links). If the design has no accent colour, use greys, so nothing looks like a team. |
| `fluent.overrides` | Any Fluent token to replace. Typical: every `borderRadius*` (square corners), the `shadow*` set, `strokeWidth*` (thicker outlines), font sizes and weights, `colorBrandBackground*` (a different primary button). |
| `surfaces` | `page` (behind everything), `panel` (cards and boxes), `panelBorder` (frame of panels and the buzzer). |
| `text.body`, `text.muted` | Text on `page` and on `panel`. Both need contrast of at least 4.5:1 on **both** surfaces. |
| `border` | Width and style of frames. The team card's frame uses the team's colour instead. |
| `shadow` | A full CSS `box-shadow`. `none` for flat. A hard offset shadow must not be pure black on a near-black page, or it disappears. |
| `fonts` | CSS font stacks for headings, body text and numbers. Web fonts are imported in the pack's `index.ts` so they load only with the pack. |
| `buzzer.radius` | `50%` is round. Independent of the Fluent radii. |
| `buzzer.states` | For each of `ready`, `yourTeamUp`, `queued`, `out`, `waiting`: `colors` (`'team'` to use the player's team colour, or fixed `{ fill, text }`) and `animation` (`none`, `pulse`, `blink`). A state must also differ by its label, never by colour alone. Reduced-motion users get no animation, automatically. |
| `teams.colors` | `colorKey` → `{ fill, onFill }`. `onFill` is the text colour on `fill`, at least 4.5:1. May hold **more** keys than the seeded teams: the spares are what an admin picks when creating a team. |
| `teams.icons` | `iconKey` → image URL (import the file so the build fingerprints it). Also may hold spares. The card shows the icon in a 63×50 box (1.26:1) with `object-fit: cover`. |
| `teams.fallback` | Colour and icon used for a key the pack doesn't know (a team made under another year's pack). Never an error. |
| `numbers.scoreDigits` | Zero-pad scores to this many digits; `0` for none. |
| `effects.scanlines` | Optional. One opaque colour for faint horizontal lines over the page. |
| `copy` | Optional flavour text over `defaultCopy.ts` (the buzzer labels, "no players yet", "you"). Keys you leave out keep the neutral wording. |

Rules that apply to every value: colours are opaque hex, `rgb()` or `hsl()` (no names, no transparency, so contrast can be checked); team colour and icon keys match `^[a-z0-9-]{1,50}$` (the server's rule).

## Adding a pack, step by step

1. **Copy** `frontend/src/theme/packs/default/` to `frontend/src/theme/packs/<key>/`. (`packs/arcade-2026/` is a fuller example: fonts, overrides, copy, PNG icons.)
2. **Fill in** `index.ts`: set `key`, then every slot above.
3. **Fonts:** `npm install @fontsource/<font>` (self-hosted: nothing may depend on a CDN on event day) and import the CSS you need at the top of the pack's `index.ts`, for example `@fontsource/vt323/latin-400.css`. Import only the weights you use.
4. **Icons:** put the image files in `<key>/icons/`, `import` each one, and list it under `teams.icons`. A tile with a solid background, at about 1.26:1, looks best; a transparent icon shows the team colour behind it. Keep the originals in `images/` as masters.
5. **Register** it in the `loaders` object in `frontend/src/theme/registry.ts` (`'<key>': () => import('./packs/<key>')`). The order there is the order the preview lists packs in.
6. **Backend config:** set `Event:ThemeKey` to `<key>`, and for each seeded team set `ColorKey` and `IconKey` to keys that exist in the pack's `teams.colors` and `teams.icons`. Seeding doesn't overwrite admin edits, so for an already-seeded event change the data, not just the config.
7. **Check:** `npm test` runs the contract test over every registered pack: slots filled, colours parse, contrast 4.5:1 for text on surfaces, `onFill` on `fill` and fixed buzzer colours, every buzzer state present, fallback present, every icon resolves. Fix what it reports. Then run `npm run dev`, open `/dev/theme`, pick the pack, and look at it at phone width (it lists every team colour, buzzer state and Fluent control, and the team count slider goes from 1 to 13). `npm run lint` and `npm run build` must pass too.

## Packs are never deleted

An archived event remembers its `ThemeKey`. Removing a pack would orphan old events, and the registry falls back to `default` for an unknown key, so the old look would silently change. Add packs; keep the old ones.

## Prompt for handing a design to an AI

Paste this at the start of a new session, with the design attached:

```
Read docs/ThemePacks.md and frontend/src/theme/types.ts. Here is next year's design: <images / description>.
Create frontend/src/theme/packs/<key>/ implementing ThemePack. Change nothing outside that folder
except registry.ts. Run npm test and fix what the contract test reports.
```

Things the AI should know that the prompt doesn't say: look at `packs/arcade-2026/index.ts` for a finished example; if the design needs something the contract can't express, stop and say so rather than editing a component; and the human judges the result on `/dev/theme`, so describe what to look at.

## Gotchas learned from `arcade-2026`

- **Wide fonts need bigger-than-default room.** Press Start 2P is a full em wide per glyph. The pack lowers `fontSizeHero800` (the buzzer label) so a seven-letter word fits inside the buzzer at 360 px. Test the longest copy strings and the 24-character team name.
- **Small fonts need larger sizes.** VT323 is small for its size; the pack raises Fluent's body sizes and line heights.
- **A font with no bold** smears when asked for bold. Set `fontWeight*` to `400`.
- **Fluent's own defaults are tuned to its brand.** In a dark pack, look at the outline colour (`colorNeutralStroke1`) and the primary button on `/dev/theme`; both may need an override.
- **Overlays need alpha, the contract has none.** That is why the arcade pack has no scanlines: an opaque line over thin text erases letters.
