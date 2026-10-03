# MonsterJevActionalizer: plan

## Context
A DM running a 5e fight wants help deciding what a monster does on its turn. The app does four things:
- loads the monster's stat-block JSON
- tracks that monster's encounter state across rounds
- takes a quick per-turn description of the battlefield
- asks **Jev** for this turn's **movement intent**, **Action**, **Bonus Action** and **target(s)**

The DM can override any part before applying it.

Jev is TypeSafe AI's System One model (`jev-latest`, `POST https://api.typesafe.ai/v1/systemone`). It **does not generate text**. It takes `{state, model, questions}` and returns calibrated answers to typed `choice`, `noul` or `score` questions. This shapes the whole design:
- Code works out the legal options. Jev only picks between them.
- Jev judges each question on its own, so code enforces rules consistency afterwards.
- Explanations are templates filled with Jev's probabilities.

Reference implementation for calling Jev: `F:\Projects\AI\typesafe-assist\smart-assistant\prototype\`.

## Scope (v1)
- Runs **locally** on the DM's laptop (`npm run dev`). The layout must still work on a tablet. No auth and no deployment.
- **One monster per tracker.** For five goblins, use five trackers (Duplicate makes this quick).
- The app **decides** only the monster's own turn. **Legendary actions, reactions and lair actions** (initiative 20) appear as reminder cards and are not decided.
- **No second LLM.** Low confidence shows the alternatives. We'll revisit this if the output isn't good enough.
- **Out of scope for now:**
  - loading monsters from the DandDTemplateParser database (it needs a new JSON endpoint there, since `GET /monsters/:id` returns only HTML)
  - a condition rules engine
  - maps or grids
  - exporting a session

## Stack
Next.js (App Router), TypeScript, npm, Tailwind and hand-rolled components. The API key is used only in a server route. All state is kept in `localStorage`, with no database. Tests use Vitest.

**Why this stack:** the app is mostly UI, and its backend is one route (`/api/decide`) that exists to keep `TYPESAFE_API_KEY` out of the browser. Next.js puts the UI and that route in one project, with one `npm run dev`, and the UI and server share types and zod schemas without a separate package. A standalone API server such as Fastify would only pay off with several clients or a real backend, and v1 has neither. If that changes (for example, the DandDTemplateParser integration grows), the fallback is Vite + React with a small separate API.

## Structure
```
app/
  page.tsx                  – layout: tracker sidebar | monster + tracker | situation form | recommendation
  useTrackers.ts            – the only localStorage access (try/catch, empty default)
  api/decide/route.ts       – server: build request → call Jev → interpret → Recommendation
lib/jev/
  types.ts                  – copy of prototype/src/types.ts lines 10–76 (wire types, MAX_CHOICE_OPTIONS, OPTION_NONE);
                              response types inferred from zod
  client.ts                 – port of prototype/server.ts proxy(): Bearer auth, 30s timeout, one retry on 408/429/5xx/529 (as api.py)
lib/monster/
  schema.ts                 – zod schemas copied from DandDTemplateParserTypeScript/src/routes/monsters.ts (Modifier optional)
  types.ts                  – zod schemas + inferred types for extracted abilities and the reviewed monster
  normalize.ts              – template-drift detection + auto-fixes → { fixed, changes[], errors[] } (pure, shared with the script)
  extract.ts                – text extraction, 2014 + 2024 wording (see "Reading the statblock")
  spells.ts                 – SRD spell table lookup
  options.ts                – legal candidates for this turn
lib/encounter/
  types.ts                  – zod schemas + inferred types for Tracker, EncounterState, Situation, TurnLog…
  state.ts                  – reducers: create, duplicate, startTurn, apply, recordResult, manual edits
  storage.ts                – pure serialize/parse of saved trackers (zod-validated, empty default on bad data);
                              the localStorage calls themselves live in app/useTrackers.ts, wrapped in try/catch
  reminders.ts              – reminder cards: legendary actions left, reactions, lair actions
lib/decide/
  constants.ts              – confidence and consistency thresholds as named constants
  clusters.ts               – groups players from "clustered with"
  questions.ts              – builds the question set (noul()/choice() helpers, as in prototype/src/questions.ts)
  interpret.ts              – probabilities → Recommendation, consistency rules, confidence buckets
  explain.ts                – template explanation text
data/
  srd-spells.json           – SRD spells: level, casting time, range, area, save/attack, damage/effect, concentration
scripts/
  check-monsters.ts         – `npm run check:monsters [--fix]`: runs normalize.ts over fixtures/monsters/*.json
  build-srd-spells.ts       – generates data/srd-spells.json from the SRD 5.1 (CC BY 4.0)
  record-jev.ts             – `npm run record:jev`: records one live Jev response per scenario into fixtures/jev/
components/                 – TrackerSidebar, MonsterLoader, FixScreen, ReviewScreen, EncounterTracker, PartyRoster,
                              SituationForm, PlayerRow, RecommendationCard, ReminderCards, TurnLog
fixtures/
  monsters/                 – real monster JSONs supplied by the DM
  jev/                      – recorded Jev responses for interpret tests; scenarios.ts defines the recorded scenarios;
                              derived/ holds edited copies (with `derivedFrom`) that exercise each consistency rule
```

## Monster input
The format is the template from `F:\Projects\AI\DandDTemplateParserTypeScript`:
- Templates: `src/templates/blankGeneralTemplate.json` and `blankLegendaryTemplate.json`.
- Zod: `GeneralMonsterBodySchema` and `LegendaryMonsterBodySchema`, in `src/routes/monsters.ts` lines 24–76.

The monster is pasted or uploaded, then goes through **validation and fixing** (below) before the review screen. A monster counts as legendary if `LegendaryActions` is present (after alias fixing). `Modifier` is optional, and the app computes it if it's missing.

Every ability section is a `Record<name, freeTextDescription>`: `Actions`, `BonusActions`, `Reactions`, `SpecialTraits`, `LegendaryTraits`, `LegendaryActions.Options` and `LairActions`. `HP` and `Speed` are strings, e.g. `"135 (18d10 + 36)"` and `"30 ft., fly 60 ft."`. **General monsters have no `BonusActions` field.** Their bonus actions sit in trait text instead, as with the goblin's *Nimble Escape: "…can take the Disengage or Hide action as a bonus action."*

### Validation and fixing (new uploads)
Real monster JSONs drift from the templates in predictable ways. Auditing the first fixtures turned up:
- an empty `Equipment: {}`
- `Level` as a string
- `"Legendary Actions"` written with a space
- `Equipment.Weapon` instead of `Weapons`
- general monsters with a legendary-actions block tacked on

So every upload goes through **parse JSON → `normalize.ts` → zod validate → fix screen → review screen**.

- **Classify:** a monster is legendary if it has `LegendaryActions` or a known alias (`"Legendary Actions"`, `Legendary_Actions`), or any of `LegendaryTraits`, `LairActions` or `MythicTrait`. Otherwise it's general.
- **Auto-fixes**, each one recorded as a human-readable change:
  - Fill missing template keys with blank defaults, e.g. `Equipment: {}` → `{ Armor: "", Weapons: "", Other: "" }`. On legendary monsters, also add empty `BonusActions`, `Reactions`, `LairActions`, `RegionalEffects` and `MythicTrait`.
  - Coerce numeric strings to numbers for `Level`, `AC` and `Score`. Compute a missing `Modifier` from `Score`.
  - Rename near-miss keys from an alias table (spacing, case, singular/plural): `Legendary Actions` → `LegendaryActions`, `Weapon` → `Weapons`, `Saving Throws` → `SavingThrows`, and so on.
  - Upgrade a general monster with legendary content to the legendary template:
    - Wrap a flat legendary-actions map as `{ "Legendary Action Uses": "3", Options: {...} }`, keeping the real action names as the `Options` keys.
    - Fill `ChallengeRating` from the filename (`*.CR<n>.*`), or ask the DM for it.
    - Derive `ProficiencyBonus` from CR using the standard table.
    - Move `SpecialTraits` entries whose text says "as a bonus action" into `BonusActions`. General monsters keep these in their traits, as described above.
- **Never invented:** mechanics that aren't in the source, i.e. no Legendary Resistance, no resistances or immunities, and no actions. Unknown keys are kept and flagged. They move into `Notes` only if the DM chooses that.
- **Fix screen:**
  - Lists every auto-fix. The DM can accept or revert each one.
  - Shows the remaining zod errors per field, which the DM edits inline.
  - Lets the DM continue only once the monster validates.
  - Offers the fixed JSON for download, so the DM can update their source file.
- **Fixtures:** `npm run check:monsters` runs the same normalizer over `fixtures/monsters/`, and `--fix` rewrites the files. New fixtures must pass it with zero changes, and `fixtures/monsters/README.md` should say so.

## Reading the statblock (`extract.ts`)
The extractor handles both 2014 and 2024 wording:

| Thing | 2014 | 2024 |
|---|---|---|
| Attack | `Melee Weapon Attack: +4 to hit, reach 5 ft.` | `Melee Attack Roll: +4, reach 5 ft.` |
| Save | `must make a DC 15 Dexterity saving throw` | `Dexterity Saving Throw: DC 15` |
| Spellcasting | trait with slots per level | action with at-will / X/day, no slots |

It also extracts:
- ranged attack ranges (`range 80/320 ft.`)
- damage dice and type
- area (`60-foot cone`)
- `Recharge 5–6` and `(X/Day)`
- the Multiattack composition
- `"as a bonus action"` in trait text
- `parseHp`, which takes the leading integer
- `parseSpeed`, which builds a map of movement modes

Spells are looked up by name in `data/srd-spells.json`. A spell that isn't in the table is marked **unknown**.

**Review screen, shown after loading.** Every extracted entry is listed with:
- its category (action / bonus action / reaction / passive)
- its uses (at will / X per day / recharge N–6)
- its attack or save, range, area and damage
- the spell slots per level
- any spells marked unknown, for the DM to fill in

The DM confirms or fixes each one, and the result is saved with the tracker. Anything left unparsed stays as raw text in Jev's state.

## Trackers (sidebar, localStorage)
A tracker belongs to one monster. It holds:
- the reviewed monster
- the encounter state
- the party roster
- the turn log
- its settings

**Duplicate** creates a copy ("Goblin 2") with the same statblock, roster and settings, and fresh state, situation and log.

**Delete** removes a tracker, after the DM confirms.

**Encounter state:**
- current and max HP
- slots remaining per level
- X/day uses remaining
- recharge abilities: available or spent
- legendary actions left
- Legendary Resistance uses
- the monster's conditions
- whether it's concentrating, and on what
- the round number

**Settings:**
- **Temperament:** mindless / feral / cunning / tactical genius. Suggested from INT (≤3 / 4–7 / 8–13 / 14+).
- **Morale:** a slider from cowardly to fanatical, starting in the middle.
- **Recharge mode:** auto or manual, defaulting to auto.

**Start turn** moves the round on, rolls a d6 for each spent recharge ability (auto mode) and shows the roll, and shows the reminder cards.

**Turn log:** each turn records the action, target, move and slot actually used, plus a result the DM notes (hit / miss / downed / effect). The **last 3 turns** go into Jev's state.

## Situation form
**Party roster** (saved per tracker): name, role (melee / ranged / caster / healer), class, and AC if known.

**Per-turn player fields**, which **carry over** from the last turn so the DM edits only what changed:
- **zone:** engaged / near / far / very far, with an optional exact distance in feet
- apparent HP: healthy / bloodied / near down / down
- conditions
- cover
- whether they hit the monster last round
- **clustered with** (other players standing close together)

**Also on the form:**
- allies present, and how many
- terrain checkboxes: difficult terrain, chokepoint, escape route, flying possible
- free-text DM notes

Each zone has a default distance, used only when no exact distance is given: engaged = within 5 ft, near = within 30 ft, far = within 60 ft, very far = more than 60 ft. Code uses these distances for range checks.

## Legal options (`options.ts`, deterministic)
- **Hard blocks (Q11):**
  - If the monster is incapacitated, stunned, paralyzed, petrified or unconscious, it gets no action and no bonus action. The recommendation says so, and Jev isn't called that turn.
    - Stunned, paralyzed, petrified or unconscious: movement is "hold" only.
    - Incapacitated alone: the monster can still move, so the DM picks the movement by hand.
  - If its speed is 0 (grappled or restrained), it gets no movement intents except "hold".
  - All other conditions go to Jev as context only.
- **Actions:** the monster's actions (including Multiattack), limited to what's still available: recharge abilities must be charged, X/day abilities must have uses left, and slot spells need a slot at or above their level. At-will and X/day spells come from the Spellcasting entry. Dash, Dodge, Disengage, Hide and Help are always offered.
- **Bonus actions:** `BonusActions` entries, trait-granted bonus actions and bonus-action spells, plus `none`.
- **Movement intents:** hold / close in on the target / reach another target / retreat / take cover / fly up. Fly up is offered only if the monster has a fly speed.
- **Range:** for each option, code works out whether some target is in range now, or in range after moving, from the zones and speed. Out-of-range options are flagged in the state but still offered.
- **Limit:** options are capped at `MAX_CHOICE_OPTIONS` (255).

## Questions to Jev (one batched request per turn)
The state sent to Jev includes:
- the reviewed monster
- the encounter state
- the temperament and morale
- the situation
- the computed legal options, flagged for range
- the last 3 log entries

Questions use index keys (e.g. `target__3`), as in the prototype's `material__3`.

| Key | Type | Question |
|---|---|---|
| `tactic` | choice | aggressive / focus weakest / focus biggest threat / control / defensive / flee |
| `move_before` | choice | the movement intents |
| `action` | choice | the legal actions. Each criterion is a one-line summary: to-hit/DC, damage, range, area |
| `bonus_action` | choice | the legal bonus actions plus `none` |
| `move_after` | choice | the movement intents |
| `target__<i>` | choice | the players, for each of the top candidate single-target actions and bonus actions |
| `cluster__<i>` | choice | the clusters, for each of the top candidate area-effect options (the number caught is shown) |
| `multiattack_fallback` | noul | switch the remaining attacks to another adjacent target if the primary drops? |
| `slot_level__<i>` | choice | the slot levels still available at or above the spell's base level, for each candidate leveled spell |
| `should_retreat` | noul | break off now, given HP, morale and temperament? |
| `spend_resource` | noul | is this worth a limited resource now (slot, recharge or daily use)? |

"Top candidates" means the 3–4 options most likely to be picked. Code chooses them before the request, based on range and availability, because Jev answers all questions in parallel.

## Interpretation (`interpret.ts`)
Code reads the `probabilities` distributions, not just `choice`, because the prototype found that `choice` isn't always the highest-probability option.

**Consistency rules:**
- A bonus action that depends on the Attack action (e.g. an off-hand attack) is dropped if the chosen action isn't an attack.
- **One leveled spell per turn.** If the action and the bonus action are both leveled spells, the one with the lower probability is replaced by its best alternative.
- If the chosen action is out of range and `move_before` doesn't bring a target into reach, the app picks the next-best option that is in range.
- If `should_retreat` is high (≥ 0.60), Disengage or Dash is preferred, with retreat as the movement.
- **Concentration:** if the monster is already concentrating and picks another concentration spell, the pick stands, with a warning saying which spell it drops.
- If `spend_resource` is low, the best option that uses no resource gets a boost.

**Confidence:** high ≥ 0.85, medium ≥ 0.60, otherwise "DM's call".

## Recommendation card
- **Shows:**
  - the top pick for move before → action (with target, cluster or slot) → bonus action → move after
  - a template explanation (tactic, why this target, the probabilities)
  - a collapsed list of runners-up with their probabilities
- **Override:** every part can be switched to any legal option.
- **Apply** takes what the DM *actually* chose. It:
  - spends the slot, recharge or use
  - updates concentration
  - writes a turn-log entry (the DM then records the result)
  - carries the situation forward
- **If the Jev call fails:** the app shows the error, keeps the legal options, and lets the DM pick by hand and apply.
- **Reminder cards:** legendary actions left and their options, reactions, and lair actions (initiative 20).

## Env
- `TYPESAFE_API_KEY`: required. The DM puts it in `.env.local` themselves.
- `TYPESAFE_BASE_URL`: defaults to `https://api.typesafe.ai`.
- `JEV_MODEL`: defaults to `jev-latest`.

`.env.example` is committed. `.env.local` is gitignored.

## Claude tooling (from ClaudeCore)
Copy these from `F:\Projects\AI\ClaudeCore\.claude\` into this repo's `.claude/`:

| Bring in | Why |
|---|---|
| `agents/typescript-expert.md` | The core language: strict types, zod-inferred types, the async Jev client |
| `agents/react-expert.md` | The components (TrackerSidebar, FixScreen, ReviewScreen…). Remove its outdated PropTypes/defaultProps bullet. |
| `skills/code-reviewer/` + `agents/code-reviewer.md` | Reviews diffs against a checklist and a fixed output format, and already comes with evals |
| `rules/*.md` (4 files) | Core behaviors, code standards and the verification and reporting rules |
| `hooks/pre-edit-protect-sensitive.sh`, `stop-secret-scan.sh`, `pre-bash-guard.sh`, `post-edit-format.sh` + their `settings.json` entries | Protect `.env.local` (which holds `TYPESAFE_API_KEY`), scan for leaked keys, block destructive commands and run Prettier after edits. Trim `permissions.allow` to npm, npx and git. |

**Not brought in:**
- `skills/typescript-api`: it's built on Fastify and Drizzle. Next.js route handlers replace Fastify's server model, and the app has no database. Its zod-first and Vitest conventions still apply.
- `security-reviewer`: the app is local-only with one server route, and ClaudeCore's own latest commit questions whether this agent is useful.
- `css-expert`: we use Tailwind.
- `agentic-ai-*`: these cover Python and LangChain, and Jev isn't an LLM agent.
- `ui-standards-*` and `accessibility-auditor`: these are Flutter-specific.
- Everything else targets another language, a database or infrastructure.

## Verification
1. **Unit tests (Vitest):**
   - `extract.ts`: 2014 and 2024 wording, and trait-granted bonus actions, against the monsters in `fixtures/monsters/` (supplied by the DM).
   - `options.ts`: recharge spent, slots used up, incapacitated, speed 0, range from zones, fly speed.
   - `interpret.ts`: the consistency rules, using recorded responses in `fixtures/jev/`.
   - `state.ts`: Apply spends what was chosen, Duplicate resets state, the log keeps the last 3 turns, and recharge rolls work.
   - `normalize.ts`: one case per known drift. That covers an empty Equipment block, a string `Level`, the `"Legendary Actions"` alias, `Weapon` → `Weapons`, and a general-to-legendary upgrade with CR and proficiency bonus filled in. A fixed monster must then pass zod, and normalizing an already-valid monster must produce zero changes.
   - Fixtures: every `fixtures/monsters/*.json` passes strict zod validation with zero normalizer changes.
2. **Manual test:** run `npm run dev` and upload a deliberately broken monster. Check that the fix screen lists the changes, that reverting a change works, and that the review screen loads. Then load a fixture monster and go through the review screen. Then play these scenarios:
   - a lone player engaged in melee
   - a spread-out party with a downed caster and two clustered players (expect a cluster pick for an area effect)
   - the monster at low HP with a cowardly morale and an escape route (expect a retreat)
   - a caster that's concentrating, casting a leveled spell (check the concentration warning and the slot level)

   In each, check that the recommendations make sense, that an override followed by Apply updates the tracker, and that the log feeds the next turn.
3. **Cost and speed:** log token usage and latency from each response, and confirm there's exactly one Jev request per recommended turn, and none when the monster is hard-blocked.

## Follow-ups
- Load monsters from the DandDTemplateParser database. This needs a `GET /monsters/:id/json` endpoint added there.
- A one-time Jev classification call when a monster loads, to back up the regex extraction.
- An LLM narration or tiebreak step, if showing the alternatives turns out not to be enough.
- Deciding legendary actions.
- Exporting and importing a session.
