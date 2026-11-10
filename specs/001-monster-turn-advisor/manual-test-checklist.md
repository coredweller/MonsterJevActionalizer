# Manual Test Checklist: Monster Turn Advisor (v1)

Everything a DM can do in the app, as checkboxes. It extends [quickstart.md](quickstart.md) (the T075
run) to every feature in [spec.md](spec.md). Tick items as you go and write anything odd under
[Findings](#findings).

**Items marked 🎲 make one live Jev call.** Everything else is free. Running every 🎲 item once costs
about 15–20 calls.

## Before you start

- [ ] `.env.local` has a real `TYPESAFE_API_KEY`
- [ ] `npm run dev` is running and http://localhost:3000 loads
- [ ] Keep the server terminal visible. Every 🎲 turn should print exactly one `jev model=… latencyMs=… usage=…` line.
- [ ] To start from nothing: DevTools → Application → Local Storage → delete `mja.v1.trackers`, then reload

### Fixtures and what they exercise

All in `fixtures/monsters/`.

| Fixture | Use it for |
|---|---|
| `TunnelWasp.CR5.2014.json` | General monster, no reactions or legendary content. Burrow and climb, no fly. Lone-melee scenario. |
| `MaestroDrazzuk.CR10.2014.json` | Legendary. Spell slots 1–5, a daily-use ability (Conduct), a recharge ability (Discordant Strike 5–6), concentration spells, area spells. |
| `BriarthornHag.CR7.2024.json` | 2024 wording. At-will and 1/Day spells with no slots. Legendary Resistance (3/Day). One reaction. "Thornward Hex" is an unknown spell, so a spell level must be filled in before Confirm. |
| `AshenWarpriest.CR5.2014.json` | Leveled spells as both action and bonus action. War Priest bonus attack needs the Attack action. |
| `TieflingEnforcer.CR6.2014.json` | Plain melee bruiser. Low-HP retreat scenario. |
| `HollowWailcap.CR3.2014.json` | Fly 20 ft. (hover). Use for "fly up". |
| `TollOfForgottenWatcher.CR10.2014.json` | Walking speed 0, fly 40 ft. |
| `Zarielith.CR10.2014.json` | Legendary with a fly speed. |
| `Fiddlebits.CR11.2014.json` | Another 2014 monster for general coverage. |
| `MirewardenKethra.CR9.2014.json` | Legendary with lair actions (the only one). Three lair actions, legendary actions, a recharge breath (Bog Breath 5–6). Swim speed, no fly. |

---

## 1. Loading a monster

- [ ] With no trackers, the app opens straight on **Load a monster**.
- [ ] **Upload**: choose a fixture. The page shows "File: <name>". **Check monster** opens the fix screen.
- [ ] **Paste**: paste a fixture's JSON into the textarea. **Check monster** works the same way.
- [ ] Typing in the textarea after an upload clears the "File:" line. The filename is only used for uploads.
- [ ] **Check monster** is disabled while the textarea is empty.
- [ ] **Invalid JSON** (e.g. delete a closing brace): a red "That isn't valid JSON: …" message appears and nothing proceeds.
- [ ] **CR prompt**: paste a *general* monster that has a `"Legendary Actions"` block and no `ChallengeRating`, so there's no filename to read it from.
  - [ ] **Challenge rating needed** appears.
  - [ ] **Continue** is disabled until the value looks like `5` or `1/2`.
  - [ ] **Back** returns to the loader.
  - [ ] A valid CR goes on to the fix screen.
- [ ] With trackers already saved, **Add monster** in the sidebar opens the loader with a **Cancel** button. Cancel returns to the selected tracker.

## 2. Fix screen

Upload `fixtures/monsters/broken/ZarielithBroken.CR10.2014.json`. It's a copy of `Zarielith.CR10.2014.json` with
three breakages: `"Level": "10"` (a string), `"LegendaryActions"` renamed to `"Legendary Actions"` (with the space),
and `"Equipment": { "Weapon": "Cursed Scepter of Binding" }` (singular, with Armor and Other missing). Expect exactly
four fixes: two rename-key, one fill-default, one coerce-number. Reverting the Level fix gives the clearest inline error.

- [ ] The header shows **Check <name>**, a template badge (general or legendary), and **valid** or **N error(s)**.
- [ ] **Automatic fixes (N)** lists one readable line per fix, each with its kind.
- [ ] **Accept** turns into a green d20 showing 20 with "Accepted" beside it. The d20 rolls in (no animation with reduced motion on), and Revert doesn't move.
- [ ] **Revert** removes the fix from the list, shows it struck through as "Reverted: …", and puts back the original value.
- [ ] A revert that makes the monster invalid shows the error under **Errors to fix**, and **Continue to review** becomes disabled with the tooltip "Fix the errors below first".
- [ ] **Re-apply** on a reverted fix brings it back and clears the error.
- [ ] **Errors to fix**: type a new value into an error's box and press **Set**. The error clears once the value is valid.
- [ ] **Unknown keys (kept as-is)**: add a made-up key (e.g. `"Mood": "grumpy"`). It's listed with its value.
  - [ ] **Move to Notes** moves it into the monster's Notes, and it disappears from the list.
  - [ ] If you leave it, it's still in the downloaded file.
- [ ] **Download fixed JSON** saves a file. An upload keeps its filename; a paste is named after the monster. The file opens and contains the fixes.
- [ ] **Cancel** goes back to the loader, or to the selected tracker if one exists.
- [ ] **Clean fixture**: upload any unmodified fixture. You get **Automatic fixes (0)**, "None needed.", and a **valid** badge.
- [ ] **General → legendary upgrade**: a general monster with legendary actions, CR in the filename (e.g. `Test.CR8.2014.json`) and a trait saying "as a bonus action" gets:
  - [ ] the legendary template
  - [ ] CR taken from the filename
  - [ ] a proficiency bonus derived from CR
  - [ ] the bonus-action trait moved into bonus actions

  Each of these is listed as a separate change.
- [ ] **Nothing invented**: no fix adds an action, resistance, immunity or Legendary Resistance that wasn't in the file.

## 3. Review screen

- [ ] The monster shows as a parchment statblock: name and type line, Armor Class / Hit Points / Speed, the six ability scores, then Saving Throws through Challenge, Class, Level, Equipment and Notes (empty lines are left out), then traits and the Actions, Bonus Actions, Reactions, Legendary Actions and Lair Actions sections that have entries.
- [ ] Each entry shows its original text, with chips under it for what was parsed (category, uses, attack or save, range, damage) and an **Edit** button. Check them against `TieflingEnforcer`.
- [ ] **Hit Points** has an editable Max HP box. **Speed** has a chip with the parsed speeds (amber "speed not parsed" if none).
- [ ] **Banners above the card**: red for errors (a spell with no level, a failed Confirm), yellow for warnings (unknown spells, raw text only, partly parsed). Clicking a line scrolls to that ability and opens its editor.
- [ ] `BriarthornHag` (2024 wording):
  - [ ] Attacks and saves are parsed.
  - [ ] Under the Spellcasting entry: "No spell slots (at-will and per-day spells only)", then each spell with its own chips and Edit.
  - [ ] "Thornward Hex" has **unknown spell** and **no level** chips, and the yellow banner names it.
  - [ ] **Confirm and create tracker** is disabled, and the red banner says "Thornward Hex has no spell level".
  - [ ] **Edit** on the unknown spell, then give it a level. The red banner disappears and Confirm turns on once every spell has a level.
- [ ] `MaestroDrazzuk`: spellcasting shows the save DC and attack bonus, plus one "Level N slots" box per level. Slot counts can be edited.
- [ ] Badges: **raw text only** (unparsed; shows the original text), **partly parsed**, and **after Attack action** (`AshenWarpriest`'s War Priest).
- [ ] **Edit / Done** opens the ability editor and shows the raw rule text. Try each field:
  - [ ] category
  - [ ] uses
  - [ ] attack bonus, or save ability and DC
  - [ ] area shape and size
  - [ ] range (0 = self)
  - [ ] damage text (e.g. `2d6 + 3 slashing, 1d8 fire`; it's re-read when the field loses focus)
  - [ ] Targets one player
  - [ ] Concentration
  - [ ] Needs the Attack action (bonus actions only)
- [ ] Edits made here show up later in the tracker and its options. For example, mark a spell as concentration, then check it appears under **Concentrating on**.
- [ ] **Back** returns to the fix screen with the earlier fix decisions intact.
- [ ] **Confirm and create tracker** creates the tracker, selects it, and adds it to the sidebar.

## 4. Trackers sidebar

- [ ] Each row shows the name, `HP x/y` and the round. The selected row is highlighted.
- [ ] **Switching**: load two monsters, then change HP or slots on one. Switching back and forth, each keeps its own state.
- [ ] **Duplicate** a tracker that has damage, spent slots and a log. The copy:
  - [ ] gets a distinct name ("… 2") and is selected
  - [ ] has full HP and resources and is on round 1
  - [ ] has a blank situation and an empty log
  - [ ] keeps the same statblock, roster and settings

  The original is unchanged.
- [ ] **Delete** asks first. Cancel keeps the tracker. Confirm removes it, and it stays gone after a reload.
- [ ] Deleting the last tracker returns you to **Load a monster**.
- [ ] Below 1280 px wide:
  - [ ] the sidebar is hidden and a **Trackers** button appears in the header
  - [ ] the button opens a drawer
  - [ ] the drawer closes on **×**, **Escape**, a click on the backdrop, or choosing a tracker

## 5. Encounter tracker (monster panel)

Use `MaestroDrazzuk` unless noted.

- [ ] **HP**: type a new value. The sidebar row updates.
- [ ] **Spell slots**: each level shows `left / max`. **−** spends one and **+** restores one. − is disabled at 0 and + is disabled at max.
- [ ] **Daily uses** (Conduct): same counter behaviour.
- [ ] **Recharge** (Discordant Strike, recharge 5–6): the chip toggles between **Available** and **Spent**.
- [ ] **Legendary actions**: counter works.
- [ ] **Legendary Resistance** counter (`BriarthornHag`): counter works.
- [ ] **Concentrating on**: lists the monster's concentration spells. Pick one, then set it back to "Nothing".
- [ ] **Conditions**: expand the row, toggle a few chips, and check the summary text matches.
- [ ] **Start turn**:
  - [ ] The round badge goes up by one.
  - [ ] A "Round N started." box appears.
  - [ ] Legendary actions go back to max, and the box says so.
  - [ ] Auto recharge: each spent recharge ability shows "rolled X (needs 5+), recharged / still spent", and the chip matches.
  - [ ] Auto recharge with nothing spent shows "Nothing to recharge."
  - [ ] Manual recharge: "Recharge is manual: set each ability below." No roll happens, and the chips don't change.
- [ ] Start turn clears the recommendation on screen, since it was for the previous turn.

## 6. Settings

- [ ] The collapsed summary reads "Settings: <temperament> · morale N · recharge auto|manual".
- [ ] **Temperament** is suggested from INT: ≤3 mindless, 4–7 feral, 8–13 cunning, 14+ tactical genius. The suggested option is marked "(suggested for INT n)" and is the default on a new tracker. Check at least two bands.
- [ ] **Morale** slider: starts at 50, runs from 0 (Cowardly) to 100 (Fanatical), and the number follows the slider.
- [ ] **Recharge mode**: exactly one of Auto / Manual is pressed at a time. Pressing the one already pressed does nothing.
- [ ] All three settings survive a reload.

## 7. Reminders

- [ ] `MaestroDrazzuk` shows a Reminders panel from round 1, before Start turn. **Legendary actions** shows "x / y left" and each option with its full rule text.
- [ ] Spend a legendary action in the monster panel. The reminder count follows. It still shows at 0 left.
- [ ] `BriarthornHag` also shows a **Reactions** card with its reaction's full text.
- [ ] `TunnelWasp` has no Reminders panel at all.
- [ ] **Lair actions** (`MirewardenKethra`): the **Lair actions** card says "On initiative count 20 (losing ties)" and lists all three entries in order, each with its full text: Sucking Mud, Rising Waters, Will-o'-Wisps.
- [ ] Nothing in Reminders is recommended or decided. It's reference text only.

## 8. Party roster

- [ ] **Add player** adds "Player N" (Melee, no class).
- [ ] Name, Role (Melee / Ranged / Caster / Healer), Class and AC can all be edited. AC can be left blank ("?").
- [ ] Each new player gets a row in the Situation panel.
- [ ] Renaming a player updates their Situation row, target chips and turn-log entries.
- [ ] **Remove** asks first. Cancel keeps the player. Confirm removes them and their Situation row.
- [ ] A removed player who appears in an old log entry shows as "removed player".
- [ ] The roster survives a reload and is copied by Duplicate.

## 9. Situation

For each player row:

- [ ] **Zone**: Engaged / Near / Far / Very far.
- [ ] **Exact ft.**: optional. The placeholder shows the zone's default distance (5 / 30 / 60 / 61).
- [ ] **Apparent HP**: Healthy / Bloodied / Near down / Down.
- [ ] **Cover**: None / Half / Three-quarters / Total.
- [ ] **Hit the monster last round** checkbox.
- [ ] **Conditions**: expandable chips. The summary text matches the chips you picked.
- [ ] **Clustered with**: a chip for each other player.

For the whole situation:

- [ ] **Allies**: "Allies present" checkbox and a "How many" count.
- [ ] **Terrain**: Difficult terrain, Chokepoint, Escape route, Flying not possible. Flying is assumed possible unless ticked.
- [ ] **DM notes** text box.
- [ ] Every field carries over to the next turn after Apply and Start turn.
- [ ] Every field survives a reload.

## 10. Recommendation card

All 🎲 unless noted.

- [ ] 🎲 **Recommend**: the card shows "Recommending…", then the result. The server prints one `jev …` line.
- [ ] The confidence badge reads **High confidence** (≥ 85%), **Medium confidence** (≥ 60%) or **DM's call**.
- [ ] The steps show in order: **Move before → Action → Bonus action → Move after**. Each shows "Recommended: …" under it.
- [ ] Action details: a one-line summary, then **Action targets** (player chips), **Group** (area effects, "… (catches N)"), or **Slot level** (leveled spells), whichever fit the action.
- [ ] **Why** explains the tactic, the target reason and the probabilities. It's built from templates, not free prose.
- [ ] **Runners-up (N)** is collapsed, with a percentage on each. It starts **open** when the badge is DM's call.
- [ ] Warnings, if any, show in an amber box. For example, the concentration warning names the spell that would be dropped.
- [ ] **Overrides**:
  - [ ] Changing any step shows an **Overridden** badge on it, and the button becomes **Apply** instead of **Apply as recommended**.
  - [ ] Setting it back to the recommended value removes the badge.
- [ ] Target chips list every player in the situation, downed ones included, with no warning.
- [ ] Switching the action resets its targets, group and slot to match the new option.
- [ ] **Still to pick: …** lists what's missing, and Apply stays disabled until nothing is.
- [ ] **Stale situation**: after Recommend, edit the Situation. A blue note says the options still use the earlier situation. Press Recommend again (🎲) to refresh.
- [ ] **Debug footer** at the bottom of the page: `Model … · N ms · usage: …`. It only shows for a real recommendation.
- [ ] No "Jev" appears anywhere in the UI text.

## 11. Legal options and hard blocks

Check these through the Action, Bonus action and Move drop-downs. They work on the pick-by-hand card too, which is free: pull the network cable or blank the key ([§14](#14-errors-and-recovery)), then press Recommend.

- [ ] **Stunned**, **paralyzed**, **petrified** or **unconscious** (set on the monster):
  - [ ] Recommend makes **no** Jev call and prints no `jev` line.
  - [ ] The card says why.
  - [ ] It shows "No action or bonus action this turn".
  - [ ] Both moves are fixed to **Hold** ("it can't move").
  - [ ] **Apply as recommended** works.
- [ ] **Incapacitated** only: no action or bonus action and no Jev call. You pick both moves by hand.
- [ ] **Grappled** or **restrained** (speed 0): **Hold** is the only movement offered. Actions are still offered.
- [ ] A **spent** recharge ability is not in the Action list. Mark it Available and it comes back.
- [ ] A daily-use ability at **0 left** is not offered.
- [ ] A leveled spell with **no slot at or above its level** is not offered. Spend Maestro's high slots to see this.
- [ ] Slot level choices only list levels that have a slot left.
- [ ] **Fly up** only appears for a monster with a fly speed (`HollowWailcap`, `Zarielith`), and disappears when "Flying not possible" is ticked.
- [ ] The standard actions are always present: Dash, Dodge, Disengage, Hide, Help. The bonus action list always has **None**.
- [ ] `TunnelWasp` and other general monsters: bonus actions written in trait text are still offered.
- [ ] Other conditions (e.g. poisoned, frightened) are context only. They don't remove options.

## 12. The scenarios (🎲 each)

Set these up by hand. The rosters match `fixtures/jev/scenarios.ts`. For each one, check the pick looks sensible and the server prints exactly one `jev` line.

- [ ] 🎲 **Lone melee** (`TunnelWasp`): Brakka (Fighter, AC 18) Engaged. Expect a sensible melee pick on Brakka.
- [ ] 🎲 **Spread party** (`MaestroDrazzuk`):
  - Wren (Wizard): Far, Down
  - Kell (Paladin): Near, 25 ft, hit last round, clustered with Iso
  - Iso (Ranger): Near, clustered with Kell
  - Bree (Cleric): Far, 50 ft, half cover

  Expect an area option aimed at the Kell + Iso group, showing "catches 2".
- [ ] 🎲 **Low HP retreat** (`TieflingEnforcer`):
  - HP 14, morale 10, Escape route ticked
  - Brakka and Sefa Engaged, both hit last round
  - Lio Near

  Expect Disengage or Dash with Retreat movement.
- [ ] 🎲 **Concentrating caster** (`MaestroDrazzuk`):
  - Already concentrating on Suggestion
  - Brakka Engaged
  - Lio Near, clustered with Sefa
  - Sefa Near, Bloodied

  If a concentration spell is picked, expect a warning naming Suggestion and a slot level.
- [ ] 🎲 **Warpriest** (`AshenWarpriest`): Brakka and Sefa Engaged, Lio Near. Expect at most one leveled spell across action and bonus action. War Priest's bonus attack only appears when the action is an attack.
  - [ ] Overrides aren't policed (G06, the DM has final say). War Priest stays in the Bonus action list whatever the action, and its summary notes "only when it takes the Attack action".
- [ ] 🎲 **Out of range** (`MaestroDrazzuk`): Brakka 70 ft, Lio 80 ft, Sefa 90 ft, all Very far. If a 60 ft. option is recommended, the move before it must close in. Otherwise an in-range option is picked instead.
- [ ] 🎲 **Downed in a cluster** (`MaestroDrazzuk`):
  - Sefa Near
  - Lio Near, clustered with Brakka
  - Brakka Near, Down

  An area effect's Lio + Brakka group shows "catches 2".

## 13. Apply and the turn log

- [ ] **Apply** spends exactly what was chosen:
  - [ ] the chosen slot level
  - [ ] the daily use
  - [ ] the recharge, which turns Spent
- [ ] Applying a concentration spell sets **Concentrating on** to it. A second concentration spell replaces the first.
- [ ] After Apply the card resets, and a **Turn log** entry appears at the top (newest first). It shows:
  - [ ] Round N
  - [ ] a **Recommended** or **Overridden** badge
  - [ ] Action with slot and targets ("→ group: …" for an area pick)
  - [ ] Bonus, if one was taken
  - [ ] Move ("…, then …")
- [ ] **Result**: Hit / Miss / Downed / Effect. Exactly one can be picked, and pressing it again clears it.
- [ ] **Note**: free text that's saved as you type.
- [ ] Results and notes survive a reload.
- [ ] Play 4+ turns. Old entries stay in the log. Only the last 3 go to Jev, but the browser sends the whole log to the server and the cut happens there. So you can't check this from the browser. It's covered by the Vitest test "includes only the last 3 log entries".
- [ ] The full loop works: Start turn → edit the situation → Recommend (🎲) → override → Apply → record a result → Start turn. The situation carries over each time.

## 14. Errors and recovery

- [ ] **Blank key**: empty `TYPESAFE_API_KEY` and restart `npm run dev`. Press Recommend:
  - [ ] A red message says the decision service isn't set up.
  - [ ] The card switches to **Pick by hand**, with every legal option listed.
  - [ ] Picking by hand and pressing **Apply** works, and the log entry says **Overridden**.
- [ ] **Network down** (DevTools → Network → Offline): Recommend shows "Couldn't get a recommendation from the server: …". Picking by hand still works.
- [ ] **Corrupt save**: in DevTools set `mja.v1.trackers` to `{not json` and reload.
  - [ ] An amber banner says the data was unreadable and was kept under `mja.v1.trackers.corrupt`.
  - [ ] The app starts empty.
  - [ ] **Dismiss** hides the banner.
- [ ] **Storage blocked** (block site data for localhost, or use a strict private window): the app still loads and works for the session, with a warning that changes won't be kept.
- [ ] No error ever leaves the screen blank or frozen.

## 15. Persistence

- [ ] Reload mid-encounter. Everything comes back:
  - [ ] all trackers and which one is selected
  - [ ] HP and every resource counter
  - [ ] conditions and concentration
  - [ ] the round
  - [ ] settings and roster
  - [ ] the situation
  - [ ] the turn log, with results and notes
- [ ] Close the tab and reopen it. Same result.

## 16. Logging and security

- [ ] Server: exactly one `jev …latencyMs=… usage=…` line per 🎲 Recommend. Lines for a hard-blocked turn: none.
- [ ] The key never shows up in the browser:
  - [ ] DevTools → Network: open the `/api/decide` request and response
  - [ ] DevTools → Sources: search for the first few characters of your key

  Neither place should contain it.
- [ ] The key never shows up in the server log or the browser console.
- [ ] Browser console: no errors during normal use. The only expected ones are from the error tests in [§14](#14-errors-and-recovery).

## 17. Tablet and accessibility

- [ ] At **768 px** and **1024 px** (DevTools device toolbar), every screen fits with no sideways scroll.
- [ ] Every button, chip and field is comfortable to tap.
- [ ] The recommendation card's position below 1280 px wide is workable at the table. It sits under Party in the left column.
- [ ] Keyboard: Tab reaches every control, the focus ring is visible, and Escape closes the tracker drawer.
- [ ] Text, placeholders and field borders are easy to read, including small grey text such as "Recommended: …" and the debug footer.

## 18. Speed (SC-001)

- [ ] 🎲 Time one turn from **Start turn** to **Apply**, changing only a couple of situation fields. Under **60 s**.
- [ ] Note the `latencyMs` from the server line for that turn: ______ ms

---

## Findings

| # | Section | What happened | Expected |
|---|---|---|---|
| 1 | | | |
