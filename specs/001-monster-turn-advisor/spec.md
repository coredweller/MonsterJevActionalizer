# Feature Specification: Monster Turn Advisor (v1)

**Feature Branch**: `001-monster-turn-advisor`
**Created**: 2026-10-03
**Status**: Draft
**Input**: User description: "the specification I want you to use is in docs/PLAN.md"

> Source of truth: [docs/PLAN.md](../../docs/PLAN.md). This spec restates the plan as user-facing
> requirements. Where they differ, the plan wins and this spec is updated.

## User Scenarios & Testing *(mandatory)*

A Dungeon Master (DM) running a 5e fight at the table wants fast, rules-legal help deciding what one
monster does on its turn: where it moves, which Action and Bonus Action it takes, and whom it
targets. The DM stays in control: every suggestion can be overridden before it is applied.

### User Story 1 - Load and verify a monster (Priority: P1)

The DM pastes or uploads a monster statblock file. The app detects common formatting drift, fixes
what it safely can, shows every fix so the DM can accept or revert it, and lets the DM edit any
remaining errors inline. It then shows a review screen listing every ability it understood
(category, uses, attack/save, range, area, damage, spell slots, unknown spells) for the DM to
confirm or correct. The confirmed monster becomes a new tracker.

**Why this priority**: Nothing else works without a correct monster. A wrong statblock produces
confidently wrong recommendations, so this is the foundation.

**Independent Test**: Upload a deliberately broken monster file; confirm the fix screen lists each
change, that reverting one works, that the DM can only continue once the monster is valid, and that
the review screen shows the extracted abilities. Delivers value alone as a statblock validator/fixer
with downloadable corrected file.

**Acceptance Scenarios**:

1. **Given** a monster file with an empty equipment block, a text-valued level, a `"Legendary Actions"`
   key with a space, and `Weapon` instead of `Weapons`, **When** the DM uploads it, **Then** each
   problem is fixed automatically and listed as a separate human-readable change.
2. **Given** the fix screen lists a change, **When** the DM reverts it, **Then** the monster returns
   to its pre-fix value for that field and any resulting validation error is shown inline.
3. **Given** a general monster that has a legendary-actions block, **When** it is uploaded, **Then** it
   is upgraded to the legendary format, its Challenge Rating is taken from the filename (or asked for),
   its proficiency bonus is derived from CR, and trait entries that say "as a bonus action" are moved
   into bonus actions — all listed as changes.
4. **Given** the monster still has validation errors, **When** the DM tries to continue, **Then**
   continuing is blocked until the errors are resolved.
5. **Given** a monster with unknown keys, **When** it is normalized, **Then** the keys are kept and
   flagged, and moved into notes only if the DM chooses that.
6. **Given** a validated monster, **When** the review screen loads, **Then** every ability is listed
   with its category and uses, spells not in the reference table are marked unknown for the DM to
   fill in, and unparsed text is retained.
7. **Given** a fixed monster, **When** the DM asks to download it, **Then** they receive the corrected
   file to update their source.
8. **Given** an already-valid monster, **When** it is normalized, **Then** zero changes are reported.

---

### User Story 2 - Get a turn recommendation and apply it (Priority: P1)

With a tracker selected, the DM starts the monster's turn, fills in a quick battlefield description
(players' zones, apparent HP, conditions, cover, who hit the monster, who is clustered together,
allies, terrain, notes), and requests a recommendation. The app shows the top pick for move before →
Action (with target, cluster or spell slot) → Bonus Action → move after, a short explanation with
probabilities, a confidence level, and a collapsed list of runners-up. The DM overrides any part with
any legal option, then applies it; the app spends resources and logs the turn.

**Why this priority**: This is the product's core value — fast, legal turn decisions at the table.

**Independent Test**: With a reviewed monster and a lone player engaged in melee, request a
recommendation, override the target, apply, and confirm the tracker spent exactly what was chosen
and logged the turn.

**Acceptance Scenarios**:

1. **Given** a monster that is incapacitated, stunned, paralyzed, petrified or unconscious, **When**
   a recommendation is requested, **Then** no Action or Bonus Action is offered, the
   recommendation says why, and the decision service is not called. Movement is "hold" when stunned,
   paralyzed, petrified or unconscious; when only incapacitated, the DM picks the movement by hand.
2. **Given** a monster whose speed is 0 (grappled or restrained), **When** options are built,
   **Then** the only movement intent offered is "hold".
3. **Given** a recharge ability that is spent, an X/day ability with no uses left, or a leveled spell
   with no slot at or above its level, **When** options are built, **Then** that option is not offered.
4. **Given** the monster has no fly speed, **When** options are built, **Then** "fly up" is not offered.
5. **Given** a spread-out party with a downed caster and two clustered players, **When** the monster
   has an area effect, **Then** the recommendation picks a cluster and shows how many players it catches.
6. **Given** the monster is at low HP, morale is cowardly and an escape route exists, **When** a
   recommendation is requested, **Then** it recommends retreating (Disengage or Dash with retreat movement).
7. **Given** the monster is concentrating and the recommendation picks another concentration spell,
   **Then** the pick stands with a warning naming the spell that would be dropped, and a slot level is shown.
8. **Given** both the Action and Bonus Action would be leveled spells, **Then** only one leveled spell
   is recommended; the less likely one is replaced by its best alternative.
9. **Given** the recommended Action is out of range and the movement before it doesn't bring a target
   into reach, **Then** the next-best in-range option is recommended instead.
10. **Given** a recommendation, **When** the DM overrides any part and applies, **Then** the app spends
    the slot/recharge/use the DM actually chose, updates concentration, writes a turn-log entry, and
    carries the battlefield description forward to the next turn.
11. **Given** the decision service fails or is unreachable, **When** a recommendation is requested,
    **Then** the error is shown, the legal options remain available, and the DM can pick by hand and apply.
12. **Given** a turn where the monster can act, **When** a recommendation is requested, **Then** exactly
    one request is made to the decision service (none when the monster is hard-blocked).

---

### User Story 3 - Track encounter state across rounds (Priority: P2)

The app keeps each monster's encounter state between turns and sessions on the same device: current
and max HP, spell slots per level, X/day uses, recharge abilities (available/spent), legendary
actions left, Legendary Resistance uses, conditions, concentration, and round number. Starting a turn
advances the round, rolls a d6 for each spent recharge ability (in auto mode) and shows the roll.
After applying, the DM records the result (hit / miss / downed / effect); the last 3 turns feed the
next recommendation.

**Why this priority**: Recommendations depend on accurate resources and history, but the DM can
manage state by hand for a single turn, so this follows the core decision flow.

**Independent Test**: Spend a slot and a recharge ability, start the next turn, and confirm the slot
stays spent, the recharge roll is shown and applied, the round advances, and the log shows the
previous turn with its result.

**Acceptance Scenarios**:

1. **Given** a spent recharge ability in auto mode, **When** the DM starts a turn, **Then** a d6 is
   rolled, shown, and the ability recharges on the listed values.
2. **Given** manual recharge mode, **When** the DM starts a turn, **Then** no roll is made and the DM
   sets availability by hand.
3. **Given** more than 3 logged turns, **When** a recommendation is requested, **Then** only the last 3
   are used as history.
4. **Given** the app is closed and reopened, **When** the DM returns, **Then** all trackers and their
   state are restored; if saved data is unreadable, the app still opens with an empty default.

---

### User Story 4 - Manage multiple monsters with trackers (Priority: P2)

The sidebar lists trackers, one per monster. The DM can switch between them, duplicate a tracker
(e.g., "Goblin 2") to get the same statblock, party roster and settings with fresh encounter state,
situation and log, and delete a tracker after confirming.

**Why this priority**: Fights usually have several monsters; Duplicate makes five goblins quick.

**Independent Test**: Duplicate a tracker with spent resources and confirm the copy has the same
statblock and roster, fresh state, and a distinct name.

**Acceptance Scenarios**:

1. **Given** a tracker with spent slots and damage, **When** the DM duplicates it, **Then** the copy has
   the same statblock, roster and settings, full resources and HP, round 1, a blank situation and an
   empty log.
2. **Given** several trackers, **When** the DM switches between them, **Then** each shows its own state.
3. **Given** a tracker, **When** the DM deletes it and confirms, **Then** it is removed from the sidebar
   and from saved data; cancelling the confirmation keeps it.

---

### User Story 5 - Tune monster behaviour and see reminders (Priority: P3)

Each tracker has settings: temperament (mindless / feral / cunning / tactical genius, suggested from
Intelligence: ≤3 / 4–7 / 8–13 / 14+), morale (a cowardly-to-fanatical slider starting in the middle),
and recharge mode (auto by default). At the start of a turn the app shows reminder cards for
legendary actions left and their options, reactions, and lair actions (initiative 20). These are
reminders only; the app does not decide them.

**Why this priority**: Improves recommendation quality and table flow, but the core works with defaults.

**Independent Test**: Load a monster with INT 2 and a legendary monster; confirm the temperament
suggestion is "mindless" and the reminder cards list the legendary/lair options without recommending any.

**Acceptance Scenarios**:

1. **Given** a monster with INT 10, **When** the tracker is created, **Then** temperament defaults to "cunning".
2. **Given** a legendary monster, **When** the turn starts, **Then** reminder cards show legendary actions
   left with their options, reactions, and lair actions.

---

### Edge Cases

- Monster file is not valid JSON: show a parse error and do not proceed.
- Filename lacks a CR and the monster needs one: ask the DM for the CR.
- A general monster's bonus actions exist only in trait text (e.g., "Nimble Escape"): they are still
  offered as bonus actions.
- A spell name is not in the reference spell table: it is marked unknown and the DM can fill it in.
- More legal options than the decision service accepts in one question (255): options are capped.
- No player is in range of any option even after moving: out-of-range options are flagged but still
  offered, and the DM decides.
- Recommendation confidence is low (below 0.60): shown as "DM's call" with alternatives visible.
- A bonus action that depends on the Attack action (e.g., an off-hand attack) is chosen while the
  Action is not an attack: the bonus action is dropped.
- The "should retreat" signal is high (≥ 0.60): Disengage or Dash is preferred, with retreat movement.
- The "spend a limited resource" signal is low: the best option using no resource is favoured.
- Exact distance not given for a player: the zone's default distance is used (engaged ≤ 5 ft,
  near ≤ 30 ft, far ≤ 60 ft, very far > 60 ft).
- Local storage is unavailable or corrupt: the app runs with an empty default and does not crash.

## Requirements *(mandatory)*

### Functional Requirements

**Monster loading, fixing and review**

- **FR-001**: Users MUST be able to paste or upload a monster statblock in the DandDTemplateParser
  general or legendary template format.
- **FR-002**: System MUST classify a monster as legendary if it has legendary actions (under the
  canonical key or a known alias) or any of legendary traits, lair actions or a mythic trait; otherwise general.
- **FR-003**: System MUST auto-fix known drift — fill missing template keys with blank defaults, coerce
  numeric text for level, AC and ability scores, compute missing ability modifiers, rename near-miss
  keys from an alias table, and upgrade general monsters with legendary content (wrap legendary actions,
  fill CR from the filename or by asking, derive proficiency bonus from CR, move "as a bonus action"
  traits into bonus actions).
- **FR-004**: System MUST record every auto-fix as a human-readable change that the DM can accept or revert individually.
- **FR-005**: System MUST NOT invent mechanics absent from the source (actions, resistances,
  immunities, Legendary Resistance).
- **FR-006**: System MUST keep and flag unknown keys, moving them to notes only on DM request.
- **FR-007**: System MUST show remaining validation errors per field, allow inline editing, and block
  continuing until the monster validates.
- **FR-008**: Users MUST be able to download the fixed monster file.
- **FR-009**: System MUST extract abilities in both 2014 and 2024 statblock wording: attacks, saves,
  spellcasting (slots, at-will, X/day), ranges, damage dice and type, areas, recharge, X/day,
  Multiattack composition, trait-granted bonus actions, HP and movement speeds.
- **FR-010**: System MUST look up spells in a reference spell table and mark unmatched spells as unknown.
- **FR-011**: System MUST present a review screen listing each extracted ability's category, uses,
  attack/save, range, area, damage, spell slots and unknown spells; the DM confirms or corrects each,
  and unparsed text is retained as raw context.
- **FR-012**: A repository check MUST run the same normalization over the bundled fixture monsters and
  report zero changes for valid fixtures, with an option to rewrite files.

**Trackers and encounter state**

- **FR-013**: System MUST support one monster per tracker, list trackers in a sidebar, and allow
  switching, duplicating (same statblock, roster and settings; fresh state, situation and log;
  distinct name) and deleting with confirmation.
- **FR-014**: System MUST track per tracker: current/max HP, slots per level, X/day uses, recharge
  availability, legendary actions left, Legendary Resistance uses, conditions, concentration (and on
  what), and round number.
- **FR-015**: System MUST persist trackers on the DM's device across restarts and fall back to an
  empty default if stored data cannot be read.
- **FR-016**: Each tracker MUST have settings for temperament (suggested from INT), morale (slider,
  default middle) and recharge mode (auto default).
- **FR-017**: Starting a turn MUST advance the round, roll and show a d6 for each spent recharge
  ability in auto mode, and show reminder cards for legendary actions, reactions and lair actions.

**Situation input**

- **FR-018**: Users MUST be able to maintain a party roster per tracker (name, role, class, optional AC).
- **FR-019**: Users MUST be able to enter per-player turn details — zone with optional exact
  distance, apparent HP, conditions, cover, hit-the-monster-last-round, clustered-with — which carry
  over from the previous turn.
- **FR-020**: Users MUST be able to enter allies present and count, terrain flags (difficult terrain,
  chokepoint, escape route, flying possible) and free-text notes.

**Legal options and decision**

- **FR-021**: System MUST deterministically compute legal options before consulting the decision
  service: available Actions (incl. Multiattack and spells with resources remaining, plus Dash, Dodge,
  Disengage, Hide, Help), Bonus Actions (incl. trait-granted and bonus-action spells, plus none),
  and movement intents (hold, close in, reach another target, retreat, take cover, fly up if it can fly).
- **FR-022**: System MUST apply hard blocks: no Action/Bonus Action when incapacitated, stunned,
  paralyzed, petrified or unconscious (the decision service is not called); movement "hold" only when
  stunned, paralyzed, petrified or unconscious, or when speed is 0; when only incapacitated, the DM
  picks movement by hand. Other conditions are context only.
- **FR-023**: System MUST compute, for each option, whether a target is in range now or after moving,
  flag out-of-range options, and still offer them.
- **FR-024**: System MUST make at most one batched request to the decision service per turn (exactly
  one when the monster can act, none when it is hard-blocked), asking it
  only to choose among code-computed options (tactic, movement before/after, action, bonus action,
  targets, clusters, slot levels, multiattack fallback, retreat, resource spending).
- **FR-025**: System MUST interpret full probability distributions (not only the reported choice) and
  enforce consistency rules: attack-dependent bonus actions, one leveled spell per turn, range vs.
  movement, retreat threshold (≥ 0.60), concentration warning, and low resource-spend preference.
- **FR-026**: System MUST bucket confidence as high (≥ 0.85), medium (≥ 0.60) or "DM's call".

**Recommendation and apply**

- **FR-027**: System MUST show the top pick (move before → action with target/cluster/slot → bonus
  action → move after), a template-based explanation (tactic, target reason, probabilities), and
  collapsed runners-up with probabilities. No free-generated prose.
- **FR-028**: Users MUST be able to override every part of the recommendation with any legal option.
- **FR-029**: Apply MUST spend the resources the DM actually chose, update concentration, write a
  turn-log entry, and carry the situation forward.
- **FR-030**: Users MUST be able to record a result (hit / miss / downed / effect) on each log entry;
  the last 3 entries are included in the next decision request.
- **FR-031**: If the decision service fails, System MUST show the error, keep the legal options, and
  allow manual pick and apply.
- **FR-032**: System MUST log token usage and latency of each decision response.

**Security and environment**

- **FR-033**: The decision-service API key MUST be read only on the server side and MUST never reach
  the browser, logs or commits.
- **FR-034**: The app MUST run locally with no sign-in or deployment, and its layout MUST work on a tablet.

### Out of Scope (v1)

- Loading monsters from the DandDTemplateParser database.
- Deciding legendary actions, reactions or lair actions (reminders only).
- A condition rules engine, maps or grids, session export/import.
- A second language model for narration or tiebreaks.

### Key Entities

- **Monster**: a reviewed statblock (general or legendary) with abilities, each tagged with category,
  uses, attack/save, range, area, damage; plus spell slots and unknown-spell markers.
- **Normalization Result**: the fixed monster, the list of recorded changes (each revertible), and
  remaining validation errors.
- **Tracker**: one monster plus its encounter state, party roster, turn log and settings.
- **Encounter State**: HP, resources (slots, X/day, recharge, legendary actions, Legendary
  Resistance), conditions, concentration, round.
- **Party Roster / Player**: name, role, class, optional AC; per-turn zone, distance, apparent HP,
  conditions, cover, hit-last-round, clustered-with.
- **Situation**: player rows plus allies, terrain flags and DM notes for the current turn.
- **Legal Options**: the code-computed actions, bonus actions and movement intents for this turn, each
  with availability and range flags.
- **Recommendation**: chosen move-before, action (with target/cluster/slot), bonus action, move-after,
  confidence bucket, explanation, runners-up, warnings.
- **Turn Log Entry**: what was actually done (action, target, move, slot) and the DM's recorded result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From starting a turn to applying a recommendation takes the DM under 60 seconds when
  only a few situation fields changed since the last turn.
- **SC-002**: 100% of recommended options are legal for the monster's current state (resources,
  conditions, hard blocks); no recommendation includes an option the app did not compute.
- **SC-003**: Exactly one decision-service request is made per recommended turn, and none for a turn
  where the monster is hard-blocked.
- **SC-004**: Every bundled fixture monster validates with zero normalization changes, and every known
  drift case is fixed and then validates.
- **SC-005**: In each of the four plan scenarios (lone melee player; spread party with clustered
  players; low-HP cowardly monster with escape route; concentrating caster), the recommendation
  matches the expected behaviour (sensible pick; cluster pick; retreat; concentration warning and slot level).
- **SC-006**: When the decision service is unavailable, the DM can still complete and apply a turn
  manually 100% of the time.
- **SC-007**: After any override and apply, the tracker's resources and log reflect what the DM chose
  in 100% of cases, and that log feeds the next turn.
- **SC-008**: The app remains fully usable on a tablet-sized screen.

## Assumptions

- Single user (the DM) on their own laptop; no accounts, sharing or multi-device sync.
- Monster files follow the DandDTemplateParser templates; drift beyond the known cases surfaces as
  validation errors for the DM to fix by hand.
- The DM supplies the decision-service API key locally; the service (TypeSafe Jev) only answers typed
  choice / yes-no / score questions and does not generate text.
- The reference spell table covers SRD spells only; others are marked unknown.
- "Top candidates" for target, cluster and slot questions are the 3–4 options code judges most likely,
  chosen before the request because all questions are answered in parallel.
- Interpretation behaviour is verified with recorded decision-service responses, not live calls.
