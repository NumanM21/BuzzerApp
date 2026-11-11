# Manual test checklist — the hands-on pass before deployment

> **Audience:** the developer, who does this pass once every B and F step is done (decided 11 Nov 2026, `docs/DecisionLog.md`), and the AI workers who feed it.
> **Why it exists:** a step is "done" when lint, build and tests pass, which proves nothing about a real phone, a real server or how the app feels. Everything those checks can't prove is collected here as one ordered walkthrough.
> Assembled by F9 on 11 Nov 2026 from the rows every step (F0–F8) added, plus F9's own findings.

## How to use this file

1. Do **Setup** once.
2. Do **section 1, the whole-evening run**, first. It plays one games night from the host arriving to the export, in about half an hour. If it goes through, the core of the app works.
3. Then go through **sections 2 to 12**: the detailed checks by area, in the order an evening meets them. Skim the rows marked as seen live; spend the time on the rest.

**The "Seen live" column.** F9 drove the finished app in real browsers on 11 Nov 2026: the real API in Production mode serving the built app, a real PostgreSQL, Edge at phone size (360 px wide), six people at once. It ran the same script four times: arcade pack with six teams, the plain `default` pack with three teams, arcade pack with eight teams (one with a 24-character name), and once through the Vite dev server. Each run passed all 106 of its checks.

- **✔** F9 saw exactly this happen.
- **part** F9 saw the main behaviour; the row says what it did not see.
- *(empty)* Nobody has seen it in a browser. Usually only a person can: a finger on a touch screen, a phone that sleeps, real Wi-Fi, the on-screen keyboard, how it looks and reads at arm's length.

**What F9 could not judge at all, so look hardest here:** the feel and speed of the buzzer on a real touch screen, a phone that locks or loses Wi-Fi, the on-screen keyboard covering a field, readability and tap sizes in the hand, the wording, thirteen teams at once, a real screen reader, and "reduce motion".

Tick **[ ]** when a row behaved as described. If it didn't, write what you saw next to it and give the row to the next worker.

## For AI workers: how to feed this file

Every step that adds or changes something a person sees or does **adds its manual checks here, in the same commit series as the step** (before "Mark … done"). This is part of "done", like the DONE note.

- **One row per thing to try**, written for someone who did **not** read the code: what to do, in order, and exactly what should happen. "Works" is not an expectation; "the card shows the new name on the second phone within a second, without a refresh" is.
- Put each row in the section where a person would meet it, not in a section named after your step. Tag the row with your step (`F6`, `R1`). If the change belongs in the evening's story, add or change a row in section 1 too.
- *Needs* says what the row needs: `phone`, `2 devices`, `2 admins`, `real backend`, `API restart`, or `browser` for anything a desktop browser does.
- *Seen live* stays empty unless you ran exactly that in a real browser against the real server; then say `✔` or `part` as defined above.
- Include the failure cases a person would try (wrong PIN, no network, a name already taken), not only the happy path.
- When you change a flow, **update or delete** the rows you made wrong. Never leave a row describing behaviour that no longer exists.
- Tick nothing: only the developer does. Don't ask the developer to run anything now.
- Automated end-to-end tests are a separate, later backlog: `docs/FrontendSteps.md` Appendix B.

## Setup (once)

Everything the pass needs. Nothing below assumes more than this.

1. **Tools:** `node -v` shows 24 or newer; Docker Desktop is running.
2. **Database:** in the repo root, `docker compose up -d` (the dev PostgreSQL, port 5434).
3. **Know the join code and the admin's sign-in.** They are in the API project's User Secrets: `dotnet user-secrets list --project backend/src/BuzzerApp.Api`. (B2 set the code `DEV-2026`, real name `Dev Admin`, PIN `1234`, unless you changed them.)
4. **Start with an empty event,** so old test players are not in the way: give the event a join code the database has not seen, for example `dotnet user-secrets set "Event:JoinCode" "TEST-01" --project backend/src/BuzzerApp.Api`. On its next start the API creates a new, empty event with the teams from `appsettings.json` and the same admin. The old event and its data are kept; setting the old code again brings it back.
5. **API:** Visual Studio with the **http** profile, or `dotnet run --project backend/src/BuzzerApp.Api --launch-profile http`. `http://localhost:5283/healthz` shows `Healthy`.
6. **Frontend:** in `frontend/`, `npm install` once, then `npm run dev -- --host`. The app opens at `http://localhost:5173` on the PC. Vite also prints a `Network:` address such as `http://192.168.1.20:5173`: that is the address for phones on the same Wi-Fi. The first time, Windows asks whether Node may accept connections: allow it for **Private networks**.
7. **Devices:** one phone for the host, and three players: other phones, or on the PC a second browser **profile or private window** each (windows of one profile share the sign-in cookie, so they are one person).
8. **The join link** to open on each device: `http://<network address>:5173/join?code=<your code>`.

Two things to know while testing:

- This pass uses the dev server. The deployed app is served by the API itself; F9's live run tested it that way (and once through the dev server). The pages under `/dev/` exist only in the dev server.
- **A stopped API reads differently from a phone with no network.** Through the dev server a stopped API answers "Something went wrong on the server. Please try again."; a phone whose network is off says "Could not reach the server. Check your connection and try again." Rows below say which one to expect.

## 1. The whole-evening run

One games night, start to finish. Three players: **P1 and P2 on the same team, P3 on another team.** The host is the admin from Setup.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F9 | **Before the guests.** On the host phone open the join link, choose the "Sign in" tab, enter the admin's real name and PIN | The Host screen: the event's name in the header, the event's theme, "No question in play", **Begin** enabled, **Next team** and **Reset** greyed. Bottom navigation: Host, Teams, Scores, Event | phone | ✔ |
| [ ] | F9 | Host: open Teams | Every team from the configuration with its colour and icon and no members yet; "Add team" at the top | phone | ✔ |
| [ ] | F9 | **Guests arrive.** P1 opens the join link and registers: real name, display name, a 4-digit PIN, a team | The code is already filled in and the teams are listed without pressing anything. After Join: the Buzz screen with the buzzer waiting for the host | phone | ✔ |
| [ ] | F9 | P2 registers on P1's team, P3 on another team | Each lands on the Buzz screen | 3 devices | ✔ |
| [ ] | F9 | **The lobby.** While the others register, keep P1 on Teams | **Known gap (finding H3):** P2 and P3 do **not** appear on P1's screen by themselves. They show after P1 leaves the screen and comes back, refreshes, or anything else changes (a rename, a move, points). The fix is on the server and waits for a decision | 2 devices | ✔ (the gap) |
| [ ] | F9 | Each player opens Teams (refresh once because of the gap above) | Every team; under each the members' display names; a player sees only their **own** real name; ✎ on their own row only; no "Add team", no ⋮ menus | 3 devices | ✔ |
| [ ] | F9 | P1 fixes their display name: ✎, type a new name, Save | The dialog closes; the new name is in P1's header and on everyone else's Teams screen within a second, without a refresh | 2 devices | ✔ |
| [ ] | F9 | Host: open Teams, then move P2 to P3's team and back (⋮ on the member, "Move to…") | The host sees every real name under the display names. "Move to…" offers only the other teams; after Move the player is under the new team on every phone | 2 devices | ✔ |
| [ ] | F9 | **Round 1.** Players on Buzz. Host taps **Begin** | Host: "Waiting for buzzes". Every player's buzzer turns ready at once | 3 devices | ✔ |
| [ ] | F9 | P1 and P3 buzz as close together as they can; P2 buzzes right after P1 | About two seconds after the first buzz the host shows "Locked" and a box "Answering now" with the first team, who buzzed and a stopwatch from about `0:00.0`. "Team order" is the same on every phone. The first team's phones say their team is up; the other team's say "In line, Number 2". On the host, "Every buzz" lists each press with its delay (`+0.00s`, `+0.12s`) | 3 devices | ✔ |
| [ ] | F9 | Look at P2's line in "Every buzz" | If P2 pressed before their phone showed the team in the queue, the line ends "· not counted". If the phone already showed it, the buzzer was no longer pressable and there is no line. Both are right | 3 devices | ✔ |
| [ ] | F9 | The first team answers wrong: host taps **Next team** | The first team's phones show they are out; the second team's show it is their turn; the stopwatch restarts from about `0:00.0` | 3 devices | ✔ |
| [ ] | F9 | The second team answers right: host opens Scores, picks that team, Points `10`, taps "Add +10". A player keeps Scores open | Host: "Saved: +10 for <team>". The player's Scores shows that team first with 10 (arcade: `00010`) within a second, no refresh; their own team is marked "(You)" | 2 devices | ✔ |
| [ ] | F9 | Host goes back to Host and taps **Reset** | Host still showed the round as it was left. After Reset: "No question in play"; every buzzer back to waiting | 3 devices | ✔ |
| [ ] | F9 | **Round 2.** Begin; only one player buzzes; nobody touches the host phone | The round locks by itself about two seconds later with that team "Answering now" | 2 devices | ✔ |
| [ ] | F9 | **A phone sleeps.** During a round lock a player's phone for a minute, then unlock it | The round on that phone is current within a second or two, without a reload | phone | |
| [ ] | F9 | **A latecomer.** While a round is open, a new player registers and presses the buzzer | "You're in from the next round" under the buzzer. In the next round their buzz counts | 3 devices | part: the message was seen; the next round was not tried with them |
| [ ] | F9 | **A scoring mistake.** Host adds 50 to the wrong team, then taps **Undo** on that row under "Recent changes" | The team's total goes back on every phone. The row now says "Undone"; a new row says "Undoes an earlier change"; neither has an Undo button | 2 devices | ✔ |
| [ ] | F9 | **A second host.** Host: Teams, ⋮ on P3, "Make admin", confirm | The dialog says plainly that it can't be undone. P3's phone moves to the Host screen by itself, with the admin navigation and the buttons, without signing in again; P3 is no longer on a team | 2 devices | ✔ |
| [ ] | F9 | Both hosts on Host; both tap **Begin** at the same moment | Exactly one round starts and both screens show "Waiting for buzzes". Either host can then use Next team and Reset | 2 admins | ✔ |
| [ ] | F9 | **Trouble.** During a locked round stop the API, wait a few seconds, start it again | Every phone shows "Connection lost. Reconnecting…"; the host's three buttons are greyed and the buzzers can't be pressed; the last picture stays. Within a few seconds of the API being back every phone reconnects by itself, the round is "No question in play" (a restart loses the round in play, never the scores), everyone is still signed in and nobody had to reload | API restart | ✔ |
| [ ] | F9 | Play one more round | It works as before | 3 devices | ✔ |
| [ ] | F9 | **The end.** Host: Event, "Finalize the event", then Finalize | "Finalized at hh:mm" (your local time) and a button "Download buzzer-archive-<year>.json" | phone | ✔ |
| [ ] | F9 | Tap Download | A file `buzzer-archive-<year>.json` is saved and the app stays on the Event screen. It holds the teams, the members with their real names, the scores and ranks; the hosts are not in it. **Don't commit or share it** | browser | ✔ |
| [ ] | F9 | A player taps Sign out, then the browser's Back button | The join screen both times; never a signed-in screen, not even for a moment | phone | ✔ |
| [ ] | F9 | **Judge the evening as a whole:** how fast the buzzer feels, whether everything reads at arm's length, the size of the buttons, the wording | Your call. Note what to change | phone | |

## 2. Look and theme

Things mostly only eyes can judge. `/dev/theme` shows every control, buzzer state and team card of a pack on one page.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F0 | Open `/dev/theme`. Resize to phone width (360 px). Step the team count from 1 to 13 | Cards reflow with no horizontal scroll; long names wrap; every Fluent control, buzzer state and team card is shown | browser | |
| [ ] | F0 | On `/dev/theme`, open the dialog and the menu | They use the selected pack's look (not Fluent's default blue) | browser | part: the app's real dialogs and menus had the pack's look in both packs |
| [ ] | F1 | `/dev/theme` with `arcade-2026`, on your phone | Six team colours plus the spares and the fallback; every buzzer state; text is readable at arm's length; longest names (24 characters) wrap, not clip; no glow or gradients | phone | |
| [ ] | F1 | Judge the look and **decide whether the spare colours** (orange, teal, white) look right beside the six | Your call. Note what to change | phone | |
| [ ] | F1 | Switch the pack back to `default` | Everything restyles; nothing keeps an arcade look | browser | ✔ (the whole app ran in the `default` pack; nothing arcade in any screenshot) |
| [ ] | F5 | In the arcade pack look at the buzzer labels "WAITING FOR HOST", "Sent", "Number 2" | They fit inside the round buzzer at 360 px | phone | part: "WAITING FOR HOST", "BUZZ!" and "IN LINE / Number 2" fitted in the screenshots |
| [ ] | F6 | Teams, the join screen and a dialog in the arcade pack at 360 px | The heading font doesn't overflow or overlap in titles, picker labels and buttons; tap targets feel at least finger-sized | phone | part: nothing overflowed in the screenshots; the feel needs a finger |
| [ ] | F9 | The join screen on a phone, and in a wide desktop window | On the phone the text and boxes keep a margin from both edges of the screen. On the desktop the form is a centred column, not stretched across the window (finding M7) | phone, browser | part: seen at 360 px in both packs |
| [ ] | F9 | **Your call:** in the arcade pack at 360 px, long team names on the team cards and score rows break inside a word ("Rage Quitter / s") | Nothing is clipped or hidden. Decide whether it should be a smaller size on narrow screens, or break only between words | phone | ✔ (seen; left as it is) |
| [ ] | F9 | **Your call:** the header on a phone when the event's name is long | In the arcade pack the name wraps to three lines next to the person's name and "Sign out", about a quarter of the screen. Decide whether that is fine | phone | ✔ (seen; left as it is) |
| [ ] | F9 | **Your call:** on the join screen the "Continue" button sits level with the "Join code" label, a little above the box | Decide whether it should line up with the box | phone | ✔ (seen; left as it is) |

## 3. Start-up, join and sign-in

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F2 | Open the app with the backend running | A short splash, then the app in the event's theme. It must never show in the plain default theme first and then switch. (Known: the splash itself is unstyled, so a dark theme is preceded by a moment of white. Noted for Milestone R) | real backend | |
| [ ] | F3 | Open the join link on your phone. Register: real name, display name, 4-digit PIN, pick a team | The code is prefilled, teams show without pressing anything, and you land on the Buzz screen | phone | ✔ |
| [ ] | F9 | On the "New player" tab tap Join with everything empty | Each box gets its own message ("Use 2 to 20 characters", "The PIN is exactly 4 digits", "Pick your team"); nothing is sent | phone | ✔ |
| [ ] | F3 | Use an unknown join code (typed, or in the link) | "That join code is not recognised" on the code box | real backend | ✔ |
| [ ] | F3 | Register with a display name someone already uses | The server's sentence on the form, and **no** "Sign in instead" button | 2 devices | ✔ |
| [ ] | F3 | Register with a real name that is already registered | The server's sentence and a "Sign in instead" button; pressing it switches to the Sign in tab and keeps the name you typed | 2 devices | ✔ |
| [ ] | F3 | Sign out, then sign in again with real name and PIN (try the name in another letter case) | You land on your start page: Buzz for a player | phone | ✔ |
| [ ] | F3 | Sign in as the admin | You land on the Host screen | real backend | ✔ |
| [ ] | F3 | Sign in with a wrong PIN | "Real name or PIN is incorrect." on the form; you stay on the form | real backend | ✔ |
| [ ] | F3 | Six wrong PINs in a row for one name | The sixth is refused: "Too many attempts. Try again in N seconds", counting down, with the button held. The button comes back when it reaches zero | real backend | part: the refusal, the countdown and the held button were seen; nobody waited for zero |
| [ ] | F3 | Refresh the page while signed in | You stay signed in on the same screen | phone | ✔ |
| [ ] | F3 | Two phones register the same display name at the same moment | One lands on the Buzz screen; the other sees the server's "taken" sentence under the form | 2 devices | |
| [ ] | F2 | Sign out, then a different person signs in on the same phone | None of the first person's teams, names or scores show, not even for a moment | phone | |
| [ ] | F3 | The join screen at 360 px with a 24-character team name, and with the on-screen keyboard open | No horizontal scroll; boxes full width and at least finger-height; the last box and the Join button can be scrolled into view above the keyboard | phone | part: no horizontal scroll with 3, 6 and 8 teams and a 24-character name; the keyboard needs a phone |

## 4. Buzzing (the player's screen)

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F5 | Two phones on different teams, a host on Host. Begin; both buzz | The order on both phones matches the host's; each phone shows its own place ("Number 2") | 3 devices | ✔ |
| [ ] | F5 | Host taps Next team (enabled once the round has locked), then Reset | The turn moves on both phones; Reset returns both to waiting | 3 devices | ✔ |
| [ ] | F5 | One tap, and a fast double tap, on the buzzer | One buzz is sent; the button reads "Sent" at once; the page doesn't zoom | phone | part: one tap and the instant change were seen; a double tap and the zoom need a finger |
| [ ] | F9 | After a teammate has buzzed, look at your own buzzer | It shows the team's state (up, in line, out) and can't be pressed again | 2 devices | ✔ |
| [ ] | F9 | Look at a player's Buzz screen during a locked round | The team order only: no list of individual presses or delays (that is for hosts) | 2 devices | ✔ |
| [ ] | F5 | A new player registers while a round is running and presses the buzzer | "You're in from the next round" | 3 devices | ✔ |
| [ ] | F5 | The Buzz screen at 360 px with many teams in the queue and the longest names | The buzzer stays large; the queue scrolls under it; no horizontal scroll | phone | part: seen with a two-team queue |

## 5. Teams

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F6 | As a player open Teams | Every team is shown; only your own real name appears; ✎ on your row only; no "Add team", no ⋮ menus | phone | ✔ |
| [ ] | F6 | Edit your display name; keep a second phone on Teams | The new name shows on both phones with no refresh | 2 devices | ✔ |
| [ ] | F6 | Edit a name to one someone else has | The server's sentence appears under the right box (display name or real name); the dialog stays open | 2 devices | part: seen for the display name |
| [ ] | F6 | Open "Edit your names" and press Save without changing anything | The dialog closes; nothing is sent | phone | |
| [ ] | F6 | As the admin: ⋮ on a team, Rename | The new name shows on every phone. Done in the middle of a round, the dialog notes that a round is running | 2 devices | part: the rename was seen; the mid-round note was not |
| [ ] | F6 | As the admin: Add team | Only colours no team uses are offered; the first free colour and icon are preselected; the new team shows on other phones and in the join screen's team list with that colour | 2 devices | ✔ |
| [ ] | F6 | Add teams until the theme has no free colour, then open Add team again | The dialog says every colour in the theme is used, and offers only Cancel | real backend | |
| [ ] | F6 | Delete a team that has players | Refused in the dialog: "This team has players, scores or buzz history, so it can't be deleted."; the team stays | real backend | ✔ |
| [ ] | F6 | Delete the empty team you created | It disappears on every phone | 2 devices | ✔ |
| [ ] | F6 | ⋮ on a member, "Move to…" | Only the other teams are offered; after Move the player shows in the new team on every phone. Mid-round the note says it applies from the next round | 2 devices | part: the move was seen; the mid-round note was not |
| [ ] | F6 | ⋮ on a member, "Make admin"; watch that person's phone | The dialog says plainly it can't be undone; they leave their team; their phone moves to the Host screen without signing in again and fills in (a spinner for a moment, never an empty screen pretending nothing happened) | 2 devices | ✔ |
| [ ] | F6 | As a player type `/admin`, `/admin/scores` and `/admin/event` in the address bar | Each time you are sent back to the Buzz screen | phone | ✔ (and the server answered a player 403 on every admin request) |

## 6. Scores

The admin's scoring screen is **Scores** in the admin's bottom navigation. A player's **Scores** is the leaderboard.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F7 | As a player open Scores | Every team in the server's order with its rank and total; your own team says "(You)" in words; no form, no player list, nothing to tap | phone | ✔ |
| [ ] | F7 | In the arcade pack look at a total of 0 and of 120 | Padded to five digits (`00000`, `00120`) in the number font | phone | ✔ (`00000`, `00030`) |
| [ ] | F7 | As the admin give the same points to two teams that are first on the board | Both rows show the same rank (for example 1, 1, 3), not 1, 2, 3 | 2 devices | part: with every team on 0, every row showed rank 1 |
| [ ] | F7 | Keep the player's Scores open; the admin adds points to a team | The total and the order change on the player's phone within a second, with no refresh | 2 devices | ✔ |
| [ ] | F7 | As the admin open Scores | Top to bottom: team standings, "Add or remove points", "Recent changes", "Players" | phone | ✔ |
| [ ] | F9 | The admin's Scores on a 360 px phone when one team has a 24-character name | The page does not move sideways when you drag it; "Points" and "Multiplier" sit side by side inside the screen; the "Team or player" box is no wider than the screen; the bottom navigation is fully on screen (finding M5: this page was up to 415 px wide) | phone | ✔ (measured: exactly 360 px with 3, 6 and 8 teams) |
| [ ] | F7 | Pick a team, Points `10`, Multiplier `3` (don't tap anything yet) | The buttons read "Add +30" and "Remove −30", and a line says "3 × 10 = 30 points for <team>" | phone | ✔ |
| [ ] | F7 | Tap "Add +30" | "Saved: +30 for <team>"; the team's total rises by 30 and may move up; the top of "Recent changes" shows +30, the team, who did it and the time (your local time); Points, Multiplier and Reason reset, the team stays chosen | phone | part: the message and the total were seen |
| [ ] | F7 | Pick a team, Points `5`, Reason `Wrong answer`, tap "Remove −5" | The total falls by 5; the recent list shows −5 with the reason | phone | part: the total was seen |
| [ ] | F7 | Remove more points than a team has | The total shows a minus sign and no zero padding (`-15`, not `-00015`), in both packs | phone | ✔ (both packs) |
| [ ] | F7 | Add points to a **player** | The player's total in "Players" rises; the team's total does **not** change; the form said the points go to the player only, not to their team's total | phone | ✔ |
| [ ] | F7 | Tap Add with nothing filled in; then Points `0`, `2.5`, `-4`; then Multiplier `0` and `101`; then a 201-character reason | Each mistake gets a message next to its box, nothing is sent, nothing changes on the board | phone | part: Points `0` was seen |
| [ ] | F7 | Tap "Add" twice quickly | Only one entry appears in "Recent changes" | phone | |
| [ ] | F7 | Turn the phone's network off, tap Add, turn it on, tap Add again | "Could not reach the server. Check your connection and try again." while off, and what you typed stays; the second tap saves once | phone | |
| [ ] | F7 | Tap Undo on an addition | The total goes back; a new row says "Undoes an earlier change"; the original now says "Undone"; neither has an Undo button | phone | ✔ |
| [ ] | F7 | Two admins: admin A taps Undo on a row; admin B (list not yet refreshed, or offline for a moment) taps Undo on the same row | B sees a polite sentence from the server, or the row already marked "Undone"; nothing breaks and nothing is undone twice | 2 admins | ✔ |
| [ ] | F7 | Two admins add points to the same team at the same moment | Both screens end with the same total and both entries in the recent list | 2 admins | |
| [ ] | F7 | In "Players" choose "Sort by Team", then "Sort by Score" | Team: the teams in the order of the Teams screen, names A–Z within a team, players with no team last. Score: highest first, equal scores A–Z, negatives last | phone | |
| [ ] | F7 | Rename a team (or add one) on the Teams screen, then look at the "Team or player" box | It has the new name; it lists teams first, then players as "Name (Team)"; if the chosen team was deleted, nothing is chosen any more | 2 admins | |
| [ ] | F7 | Look at the admin's Scores in the arcade pack at 360 px: the buttons, the boxes and the rows with the longest names | Text fits and wraps instead of clipping; buttons are finger-sized; every state (error, saved, undone) is shown in words, not only colour | phone | part: nothing clipped in the screenshots |

## 7. Host screen

Needs at least three teams with a player each, and you signed in as the admin.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F8 | Open Host while no round is running | Title "Host"; "No question in play"; three big full-width buttons, **Begin** enabled, **Next team** and **Reset** greyed; "No team has buzzed yet." and "No buzzes yet." under them | phone | ✔ |
| [ ] | F8 | In an event where no player is on a team yet (a new join code, only the admin signed in), tap Begin | A sentence under the buttons: "No players have joined a team yet". The round does not start and Begin stays tappable | real backend | |
| [ ] | F8 | Tap Begin with players on teams | "Waiting for buzzes"; Begin greyed, Reset enabled, Next team still greyed; the players' buzzers are ready | 2 devices | ✔ |
| [ ] | F8 | Two players on different teams buzz, one after the other | "Team order" lists both teams in the order of the buzzes, with who buzzed for each; "Every buzz" lists `#1 <player> (<team>) +0.00s` and `#2 <player> (<team>) +0.xxs`; the order matches the players' phones | 3 devices | ✔ |
| [ ] | F8 | About two seconds after the first buzz | "Locked"; a box "Answering now" names the first team and who buzzed for it; the stopwatch counts up in tenths of a second from about `0:00.0`; in "Team order" that team says "Answering" in words, the others "Waiting"; **Next team** is now enabled | 3 devices | ✔ |
| [ ] | F8 | Two players of the **same** team buzz at almost the same moment | The later one's line says "· not counted", in words; the queue still has one row for the team | 3 devices | ✔ |
| [ ] | F8 | Tap Next team | "Answering now" moves to the next team and the stopwatch restarts from about `0:00.0`; the first team shows it is out; the players' phones follow | 3 devices | ✔ |
| [ ] | F8 | Keep tapping Next team until every team has had its turn | "Every team has passed"; the "Answering now" box goes; Next team greys out; Reset stays enabled | 3 devices | ✔ |
| [ ] | F8 | Tap Reset; in the next round tap Reset twice very fast | Back to "No question in play", the queue and buzz list empty, the players' buzzers waiting; the double tap does nothing extra and shows no error | 3 devices | ✔ |
| [ ] | F8 | Run a round in which only one team buzzes and nobody touches the host buttons | It locks by itself about two seconds after that buzz, with the team "Answering now" | 2 devices | ✔ |
| [ ] | F8 | Set the host phone's clock several minutes wrong (turn off automatic time), run a round to "Locked" | The stopwatch still starts near `0:00.0` (it follows the server's clock, not the phone's). Switch automatic time back on afterwards | phone | |
| [ ] | F8 | During a locked round open Scores, add points, then go back to Host | Host still shows the round as it is (not reset); Reset then clears it. This is the normal order: award points, then Reset | phone | |
| [ ] | F8 | Two admins: one taps Reset while the other taps Next team at the same moment | One wins and both screens end in the same state. The other may show a short sentence from the server; it goes away by itself when the phase changes. Nothing crashes | 2 admins | part: seen for two hosts pressing Begin together |
| [ ] | F8 | Host with many teams in the queue and the longest names, in both packs, at 360 px | No horizontal scroll; the three buttons are at least 64 px tall and full width; the queue and buzz lines wrap instead of clipping; the stopwatch fits on one line in the arcade font; "Answering" and "not counted" are words, not only colour | phone | part: seen with a two-team queue and a 24-character name, both packs |
| [ ] | F8 | In the browser's network panel, sign in as a **player** and use the app | No file called `AdminPage…`, `AdminScoresPage…` or `AdminEventPage…` is downloaded. As an admin, the first visit to Host, Scores or Event fetches a small file for it, with a brief "Loading" spinner while the header stays. (Look at this in a built app, `npm run build` then `npm run preview`: the dev server serves every file separately) | browser | |

## 8. Event screen: finalize and export

Do this after the games, or at any time on test data: finalizing changes nothing in the live event.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F8 | As the admin open Event | "Finalize" with a big **Finalize the event** button; under "Export" only the hint "Finalize the event first, then the file can be downloaded here." and no download link | phone | ✔ |
| [ ] | F8 | Tap "Finalize the event", then Cancel | A confirmation explains it freezes teams, members and scores into the archive and can be repeated; Cancel closes it and nothing else changes (still no download link) | phone | ✔ |
| [ ] | F8 | Tap "Finalize the event", then Finalize | The dialog closes; "Finalized at hh:mm" shows (your local time); a button "Download buzzer-archive-<year>.json" appears with a note that the file contains real names | real backend | ✔ |
| [ ] | F8 | Tap the Download button | The browser saves `buzzer-archive-<year>.json` and the app stays on the Event screen (it does not navigate away or show the JSON). The file has the teams, members (real names), scores and ranks, and no hosts. **Don't commit or share it** | browser | ✔ |
| [ ] | F8 | Add points on Scores, then Finalize again and download again | The new file has the new scores (each finalize replaces the archive); no error | 2 devices | |
| [ ] | F8 | After finalizing, reload the Event screen | The download link is gone again and the hint is back: Export needs a Finalize in the same visit (finding M4, waiting for a decision; finalizing again is harmless) | browser | |
| [ ] | F8 | Stop the API, tap "Finalize the event" then Finalize | The dialog stays open with "Something went wrong on the server. Please try again." (with the phone's network off instead: "Could not reach the server. Check your connection and try again."); no download link appears. After the API is back, Finalize works | API restart | |
| [ ] | F8 | As a player (signed in, in another browser profile) open `/api/archive/1/export` in the address bar | No file is downloaded; the server refuses (an error page, not the archive) | browser | ✔ (the server answered 403) |

## 9. When things go wrong

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F9 | Stop the API. Open the app in a new tab | An error message with a **Try again** button, in the plain default look: no event name, no arcade look. No crash, no blank page | API restart | ✔ |
| [ ] | F9 | Start the API, then tap Try again | The join screen with the event's name above "Join the game" and the event's theme, without reloading the page (finding M1: before, the name and theme never arrived) | API restart | ✔ |
| [ ] | F4 | With players on Buzz and a host on Host, stop the API and start it again | Everyone sees "Connection lost. Reconnecting…", the host's buttons grey out and the buzzers can't be pressed. After the API is back every screen reconnects by itself, shows the idle round, and nobody had to reload or sign in again | API restart | ✔ |
| [ ] | F4 | Lock a phone for a minute (or airplane mode for two), unlock | The round state is current within a second or two | phone | |
| [ ] | F5 | Cut the network while the buzzer is ready and press; restore it | A notice shows, nothing is sent, and after reconnecting the buzzer is pressable again without a reload | phone | |
| [ ] | F8 | Turn the host phone's network off during a round | "Connection lost. Reconnecting…", the picture stays, all three buttons are greyed (nothing can be sent). When the network is back the notice goes and the buttons match the round again | phone | part: seen with the API stopped instead |
| [ ] | F2 | Signed in on the PC, delete the session cookie (DevTools, Application, Cookies), then open Teams | The app returns to the join screen | browser | |
| [ ] | F9 | Signed in as a player and sitting on Buzz, delete the session cookie, then stop and start the API (or switch DevTools to offline and back) | Within about half a minute the app goes to the join screen by itself. It must not sit on "Reconnecting…" for ever (finding M2) | browser | ✔ |
| [ ] | F9 | As the admin, before opening Event for the first time: in DevTools, Network, block request URLs containing `AdminEventPage`. Then tap Event | "Something went wrong. This screen could not be shown. Check your connection, then reload." with a **Reload** button. The header and the bottom navigation are still there and still work. No blank page, no stack trace (finding H1) | browser | ✔ |
| [ ] | F9 | Remove the block and tap Reload | The Event screen appears and you are still signed in | browser | ✔ |

## 10. Keyboard, screen readers and motion

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F9 | On a desktop, with the keyboard only: Tab to ✎ on your row in Teams, Enter, change the name, Enter | The dialog closes and the focus ring is back on ✎; Enter opens it again. The same after Cancel and after Escape (findings H2 and M6: the focus used to fall to nowhere) | browser | part: the focus was back on the opening button after Save, Rename, Add team and Cancel; it was driven by taps, not keys |
| [ ] | F6 | Keyboard only, as the admin: open a ⋮ menu, choose "Move to…", pick a team, confirm | It works without a mouse; when the dialog closes, focus is back on the ⋮ button | browser | |
| [ ] | F9 | Turn on the phone's screen reader (TalkBack or VoiceOver). Open and close a dialog (✎ then Cancel; as the admin, Add team then Cancel), then swipe through the page | Everything on the page is still read out. (Finding H2: after a dialog the whole page used to stay hidden from screen readers until a reload) | phone | part: the page was no longer marked hidden after each dialog; no real screen reader was used |
| [ ] | F8 | Keyboard only (desktop): Tab to Begin, press Enter | The round begins; the focus ring is visible on every button | browser | |
| [ ] | F5 | Turn on "reduce motion" in the phone's accessibility settings | The ready and your-team-up buzzer don't pulse or blink (the state is still shown in text) | phone | |

## 11. Another year: a different team count and the plain theme

Teams, names and the theme change every year. To try another set-up, edit the `Event` section of `backend/src/BuzzerApp.Api/appsettings.json` **locally** (`ThemeKey`, `Teams`), give the event a new join code (Setup, step 4) and restart the API. Put the file back afterwards with `git restore backend/src/BuzzerApp.Api/appsettings.json`; never commit this change. If your User Secrets also set `Event:Teams`, change it there instead.

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F9 | `ThemeKey` `default`, three teams with colour keys `c1`, `c2`, `c3` and icon keys `circle`, `square`, `triangle`. Go through section 1 | Everything works the same in the plain look; nothing arcade remains (fonts, colours, zero-padded scores, wording on the buzzer) | 3 devices | ✔ (all 106 checks, and the screenshots) |
| [ ] | F9 | The arcade pack with eight teams: the six, plus two with colour keys `orange` and `teal` and icon keys the pack doesn't know; one name 24 characters long | The two extra teams get their colour and the pack's fallback face, never an error. No screen scrolls sideways at 360 px. "Add team" offers only the one colour left | 3 devices | ✔ |
| [ ] | F3 | Thirteen teams, 24-character team names, 20-character display names, forty or more players (colour keys the pack doesn't know show the fallback grey). Look at every screen at 360 px in both packs: join, Buzz with a long queue, Teams, both Scores screens, Host | No horizontal scroll anywhere; names wrap instead of clipping; menus and dialogs fit the screen; the bottom navigation never covers the last thing on a page | phone | part: measured with 3, 6 and 8 teams and up to 28 players |

## 12. Developer pages (dev server only)

| | Step | Do this | Expect | Needs | Seen live |
|---|---|---|---|---|---|
| [ ] | F4 | Open `/dev/realtime` as a player in one browser and as the admin in a private window (the admin also has Host open in another tab). The admin presses Begin on Host | The player's page shows `open` at once and "None yet" for the admin snapshot; the admin's shows `open` and an admin snapshot with a `buzzes` list. The admin's page has no round buttons (the Host screen runs the round); the player's has a Buzz button | 2 devices | |
| [ ] | F4 | In the browser's network panel after load, sign-in and sign-out | At most one open WebSocket to `/hubs/game` | browser | |
