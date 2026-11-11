# Manual test checklist — the hands-on pass before deployment

> **Audience:** the developer, who does this pass once every B and F step is done (decided 11 Nov 2026, `docs/DecisionLog.md`), and the AI workers who feed it.
> **Why it exists:** a step is "done" when lint, build and tests pass, which proves nothing about a real phone, a real server or how the app feels. Everything those checks can't prove is collected here, so the developer gets one ordered walkthrough instead of hunting through twenty DONE notes.
> Written 11 Nov 2026 from the F0–F6 briefs and DONE notes. F7 added section 5. **F8–F9 add their rows as they finish.**

## For AI workers: how to feed this file

Every step that adds or changes something a person sees or does **adds its manual checks here, in the same commit series as the step** (before "Mark F<n> done"). This is part of "done", like the DONE note.

- **One row per thing to try**, written for someone who did **not** read the code: what to do, in order, and exactly what should happen. "Works" is not an expectation; "the card shows the new name on the second phone within a second, without a refresh" is.
- Put each row in the section where a person would meet it in a walkthrough, not in a section named after your step. Tag the row with your step (`F6`). If no section fits, add one in walkthrough order.
- Include **what needs what** in the *Needs* column: `phone`, `2 devices`, `real backend`, `2 admins`, `API restart`, or `browser` for anything a desktop browser does.
- Include the checks the brief called "Check" and "Developer does", and every item your DONE note lists under "Not checked". The DONE note keeps the list too; this file is the one the developer follows.
- Add the **failure cases** a person would try (wrong PIN, no network, a name already taken), not only the happy path.
- When a later step changes a flow, **update or delete** the rows it made wrong. Never leave a row describing behaviour that no longer exists.
- Mark nothing as passed: only the developer ticks boxes. Leave `[ ]`.
- Playwright candidates stay in `docs/FrontendSteps.md` Appendix B; this file is for a human.
- Don't ask the developer to run anything now. This is a list for the later pass.

**F9 (the final review)** turns this file into the finished walkthrough: dedupes, orders it as one start-to-finish session (setup → join → play → teams → scores → host → finalize), adds the live-walkthrough findings, and says which rows the live walkthrough already proved so the developer can skim those.

## Setup (once)

Follow "One-time setup" in `docs/FrontendSteps.md` (Node 24, backend and the dev PostgreSQL running, `npm run dev -- --host` for a phone on the same Wi-Fi). Then:

- [ ] `http://localhost:5283/healthz` shows `Healthy`; the app opens at `http://localhost:5173`.
- [ ] You have: one phone, a second device (another phone, or a second browser **profile or private window**: windows of one profile share the sign-in cookie), the join code and the admin's real name and PIN from User Secrets.
- [ ] A fresh event with several teams. Where a row says "any team count", repeat it once with a different number of teams.

How to read the table: **[ ]** tick when it behaved as described. If it didn't, note what you saw next to it and give the row to F9 or the next worker.

## 1. Look and theme

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| [ ] | F0 | Open `/dev/theme`. Resize to phone width (360 px). Step the team count from 1 to 13 | Cards reflow with no horizontal scroll; long names wrap; every Fluent control, buzzer state and team card is shown | browser |
| [ ] | F0 | On `/dev/theme`, open the dialog and the menu | They use the selected pack's look (not Fluent's default blue) | browser |
| [ ] | F1 | `/dev/theme` with `arcade-2026`, on your phone | Six team colours plus the spares and the fallback; every buzzer state; text is readable at arm's length; longest names (24 chars) wrap, not clip; no glow or gradients | phone |
| [ ] | F1 | Judge the look and **decide whether the spare colours** (orange, teal, white) look right beside the six | Your call. Note what to change | phone |
| [ ] | F1 | Switch the pack back to `default` | Everything restyles; nothing keeps an arcade look | browser |
| [ ] | F5 | In the arcade pack check the buzzer labels "WAITING FOR HOST", "Sent", "Number 2" | They fit inside the round buzzer at 360 px | phone |
| [ ] | F6 | On `/teams`, `/join` and a dialog, in the arcade pack at 360 px | Press Start 2P text in titles, picker labels and buttons doesn't overflow or overlap; tap targets feel at least finger-sized | phone |

## 2. Start-up, join and sign-in

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| [ ] | F2 | Open the app with the backend running | Splash, then the app in the event's theme (`arcade-2026` if that is the event's `ThemeKey`), with no flash of another theme first | real backend |
| [ ] | F2 | Stop the backend, reload | The app still renders with the default look and no crash; the join screen shows a clear "can't reach the server" message when you try | real backend |
| [ ] | F3 | Open `/join?code=<code>` on your phone. Register: real name, display name, 4-digit PIN, pick a team | The code is prefilled, teams show without pressing anything, and you land on the buzz screen | phone, real backend |
| [ ] | F3 | Sign out, then sign in again with real name + PIN | You land on your start page (`/play` for a player) | phone |
| [ ] | F3 | Sign in as the admin | You land on the host screen (`/admin`) | real backend |
| [ ] | F3 | Sign in with a wrong PIN | "Real name or PIN is incorrect." on the form; you stay on the form | real backend |
| [ ] | F3 | Use an unknown join code (typed, or `?code=`) | "That join code is not recognised" on the code field | real backend |
| [ ] | F3 | Register with a display name someone already uses, and separately a real name already registered | The server's sentence on the form; for the real-name case a "Sign in instead" button that keeps what you typed | real backend |
| [ ] | F3 | Six wrong PINs in a row for one name | The sixth is refused; the message counts down in seconds; the button comes back when it reaches zero | real backend |
| [ ] | F3 | Refresh the page while signed in | You stay signed in on the same screen | phone |
| [ ] | F3 | Sign out, then press the browser's Back button | The join page; never a signed-in screen, not even for a moment | browser |
| [ ] | F3 | Two phones register the same display name at the same moment | One lands on the buzz screen; the other sees the 409 message under the form | 2 devices |
| [ ] | F3 | `/join` at 360 px with 2 teams and with 13, and a 24-character team name | No horizontal scroll; inputs full width and at least 44 px tall; the bottom navigation never covers the last field, also with the on-screen keyboard open | phone |
| [ ] | F2 | Signed in on a phone, delete the session cookie (or restart the API with a new key), tap anything | The app returns to the join page | browser |
| [ ] | F2 | Sign out, then a different person signs in on the same phone | None of the first person's teams, names or scores show, not even for a moment | phone |

## 3. Connection and buzzing

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| [ ] | F4 | Open `/dev/realtime` as a player in one browser and as the admin in a private window. Admin presses Begin | Both show `open` at once; only the admin window has the admin snapshot | 2 devices |
| [ ] | F4 | With both open, stop the API and start it again | Both reconnect by themselves and show the idle round, with no reload | API restart |
| [ ] | F4 | Lock a phone for a minute (or airplane mode for two), unlock | The round state is current within a second or two | phone |
| [ ] | F4 | While a player is signed in, promote them from the Teams screen on another device | Their app moves to the host screen and receives the host data without signing in again | 2 devices |
| [ ] | F4 | In the browser's network panel after load, sign-in and sign-out | At most one open WebSocket to `/hubs/game` | browser |
| [ ] | F5 | Two phones on different teams plus an admin on `/dev/realtime`. Begin; both buzz | The order on both phones matches; each phone shows its own place ("Number 2") | 2 devices |
| [ ] | F5 | Admin presses Next team, then Reset | The turn moves on both phones; Reset returns both to waiting | 2 devices |
| [ ] | F5 | A third player registers while a round is running and tries to buzz | "You're in from the next round" | 3 devices |
| [ ] | F5 | One tap, and a fast double tap, on the buzzer | One buzz sent; the button reads "Sent" at once; the page doesn't zoom | phone |
| [ ] | F5 | Cut the network while the buzzer is ready and press; restore it | A notice shows, nothing is sent, and after reconnecting the buzzer is pressable again without a reload | phone |
| [ ] | F5 | `/play` at 360 px with 13 teams in the queue and the longest names | The buzzer stays large; the queue scrolls under it; no horizontal scroll | phone |
| [ ] | F5 | Turn on "reduce motion" in the phone's accessibility settings | The ready and your-team-up buzzer don't pulse or blink (state still shown in text) | phone |

## 4. Teams

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| [ ] | F6 | As a player open Teams | Every team is shown; only your own real name appears; you see ✎ on your row only; no Add team, no ⋮ menus | phone |
| [ ] | F6 | Edit your display name; keep a second phone on Teams | The new name shows on both phones with no refresh | 2 devices |
| [ ] | F6 | Edit a name to one someone else has | The server's sentence appears under the right field (display name or real name); the dialog stays open | 2 devices |
| [ ] | F6 | Open Edit names and press Save without changing anything | The dialog closes; nothing is sent | phone |
| [ ] | F6 | As the admin: ⋮ on a team → Rename | The new name shows on every phone; the dialog notes "a round is running…" if you do it mid-round | 2 devices |
| [ ] | F6 | As the admin: Add team | Only colours no team uses are offered; the first free colour and icon are preselected; the new team shows on other phones and in the join screen's team list with that colour | 2 devices |
| [ ] | F6 | Add teams until the theme has no free colour | The dialog says every colour is used and has no confirm button | real backend |
| [ ] | F6 | Delete a team that has players | Refused with the server's sentence in the dialog; the team stays | real backend |
| [ ] | F6 | Delete the empty team you created | It disappears everywhere | 2 devices |
| [ ] | F6 | ⋮ on a member → Move to… | Only the other teams are offered; after Move the player shows in the new team on every phone; mid-round the note says it applies from the next round | 2 devices |
| [ ] | F6 | ⋮ on a member → Make admin, then sign in as them | The dialog says plainly it can't be undone; they leave their team; their phone moves to the host screen | 2 devices |
| [ ] | F6 | Keyboard only: open a ⋮ menu, choose Move to…, pick a team, confirm | It works without a mouse; when the dialog closes, focus is back on the ⋮ button | browser |
| [ ] | F6 | `/teams` at 360 px with 13 teams, 24-character team names and 20-character display names | No horizontal scroll; menus and dialogs fit the screen | phone |
| [ ] | F6 | A player types `/admin` or `/admin/scores` in the address bar | They are sent back to `/play` | phone |

## 5. Scores

Have the admin scoring screen (**Scores** in the admin's bottom navigation, `/admin/scores`) open on one device and a player's **Scores** (`/scores`) on a phone. The player's screen is the leaderboard; an admin can also open it by typing `/scores`.

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| [ ] | F7 | As a player open Scores | Every team in the server's order with its rank and total; your own team says "(You)" in words; no form, no player list, nothing to tap | phone |
| [ ] | F7 | In the arcade pack look at a total of 0 and of 120 | Padded to five digits (`00000`, `00120`) in the number font | phone |
| [ ] | F7 | As the admin add the same points to two teams that are first on the board | Both rows show the same rank (for example 1, 1, 3), not 1, 2, 3 | 2 devices |
| [ ] | F7 | Keep the player's Scores open; the admin adds points to a team | The total and the order change on the player's phone within a second, with no refresh | 2 devices |
| [ ] | F7 | As the admin open Scores | Top to bottom: team standings, "Add or remove points", "Recent changes", "Players". No horizontal scroll at 360 px with 13 teams, 24-character team names and 40 or more players | phone |
| [ ] | F7 | Pick a team, Points `10`, Multiplier `3` (don't tap anything yet) | The buttons read "Add +30" and "Remove −30", and a line says "3 × 10 = 30 points for <team>" | phone |
| [ ] | F7 | Tap "Add +30" | "Saved: +30 for <team>"; the team's total rises by 30 and may move up; the top of "Recent changes" shows +30, the team, who did it and the time (your local time); Points, Multiplier and Reason reset, the team stays chosen | phone |
| [ ] | F7 | Pick a team, Points `5`, Reason `Wrong answer`, tap "Remove −5" | Total falls by 5; the recent list shows −5 with the reason | phone |
| [ ] | F7 | Remove more points than a team has | The total shows a minus sign and no zero padding (`-15`, not `-00015`), in both packs | phone |
| [ ] | F7 | Add points to a **player** | The player's total in "Players" rises; the team's total does **not** change; the form said "These points go to the player only, not to their team's total" | phone |
| [ ] | F7 | Tap Add with nothing filled in; then Points `0`, `2.5`, `-4`; then Multiplier `0` and `101`; then a 201-character reason | Each mistake gets a message next to its box, nothing is sent, nothing changes on the board | phone |
| [ ] | F7 | Tap "Add" twice quickly | Only one entry appears in "Recent changes" | phone |
| [ ] | F7 | Turn the network off, tap Add, turn it on, tap Add again | A "could not reach the server" message while off, what you typed stays; the second tap saves once | phone |
| [ ] | F7 | Tap Undo on an addition | The total goes back; a new row says "Undoes an earlier change"; the original now says "Undone"; neither has an Undo button | phone |
| [ ] | F7 | Two admins: admin A taps Undo on a row; admin B (list not yet refreshed, or offline for a moment) taps Undo on the same row | B sees a polite sentence from the server and the list refreshes with the row marked "Undone"; nothing breaks and nothing is undone twice | 2 admins |
| [ ] | F7 | Two admins add points to the same team at the same moment | Both screens end with the same total and both entries in the recent list | 2 admins |
| [ ] | F7 | In "Players" choose "Sort by Team", then "Sort by Score" | Team: the teams in the order of the Teams screen, names A–Z within a team, players with no team last. Score: highest first, equal scores A–Z, negatives last | phone |
| [ ] | F7 | Rename a team (or add one) on the Teams screen, then look at the "Team or player" picker | The picker has the new name; it lists teams first, then players as "Name (Team)"; if the chosen team was deleted, nothing is chosen any more | 2 admins |
| [ ] | F7 | As a player type `/admin/scores` in the address bar | You are sent back to `/play` | phone |
| [ ] | F7 | Look at Scores in the arcade pack at 360 px: the form's buttons, the picker and the rows with the longest names | Text fits and wraps instead of clipping; buttons are finger-sized; every state (error, saved, undone) is shown in words, not only colour | phone |

## 6. Host screen and event admin (added by F8)

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| | | *(F8 adds its rows here)* | | |

## 7. Whole-evening run (assembled by F9)

F9 writes the start-to-finish session here: a short script that plays an entire games night once on real phones, in the order you would do it on the day.

| | Step | Do this | Expect | Needs |
|---|---|---|---|---|
| | | *(F9 fills this in)* | | |
