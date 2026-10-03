---
description: "Task list for Monster Turn Advisor (v1)"
---

# Tasks: Monster Turn Advisor (v1)

**Input**: Design documents from `specs/001-monster-turn-advisor/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
**Design source of truth**: [docs/PLAN.md](../../docs/PLAN.md). Read the PLAN.md section named in a task before starting it.

**Tests**: Per Constitution Principle V, Vitest tests are REQUIRED for every task touching `lib/monster`,
`lib/encounter` or `lib/decide`. Write them first and confirm they fail. UI is verified manually via quickstart.md.

**Facts every task can rely on**:
- All 9 fixtures in `fixtures/monsters/` are drift-free (checked against the source zod schemas and template keys
  on 2026-10-03). `AbilityScores.*.Modifier` is stored as a **signed string** (`"+3"`, `"-4"`), so the schema must
  accept a number or a signed string, or no value.
- `MaestroDrazzuk`, `Zarielith` and `BriarthornHag` are legendary (recharge, legendary actions; Maestro has
  slot-based Spellcasting as a trait). `TieflingEnforcer` has a recharge ability.
- `AshenWarpriest.CR5.2014.json` (authored): slot spells with leveled **bonus-action** spells (Healing Word, Spiritual
  Weapon, Shield of Faith, Mass Healing Word) and leveled action spells; "War Priest" = a Mace attack as a bonus action
  **when it takes the Attack action**; "Ash Step" = Disengage as a bonus action; concentration spells.
- `BriarthornHag.CR7.2024.json` (authored) is the **only 2024-wording fixture**: `Melee/Ranged Attack Roll: +7`,
  `Dexterity Saving Throw: DC 15 … Failure/Success`, a 30-foot Cone, `Recharge 5–6` (en dash), Spellcasting as an
  **action** with `At Will` and `1/Day Each` lists and no slots, `Misty Step (2/Day)` bonus action, a Trigger/Response
  reaction, `Legendary Resistance (3/Day, or 4/Day in Lair)`, and the non-SRD spell "Thornward Hex".
- `Fiddlebits` mentions "uses your bonus action to command" (a companion), which is **not** the "as a bonus action"
  pattern. It must not be extracted as a bonus action.
- Jev wire types: `F:\Projects\AI\typesafe-assist\smart-assistant\prototype\src\types.ts` lines 10–76.
- Monster zod schemas: `F:\Projects\AI\DandDTemplateParserTypeScript\src\routes\monsters.ts` lines 24–76.
- `lib/monster`, `lib/encounter` and `lib/decide` MUST NOT import React, call `fetch` or touch `localStorage`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization (research R1–R3, R12)

- [X] T001 Scaffold a Next.js 15 App Router project at the repo root (TypeScript, no `src/` dir, npm), pinning `next@^15`, `react@^19`, `react-dom@^19`, keeping the existing `.gitignore`, `README.md`, `LICENSE`, `docs/`, `fixtures/`, `specs/`; produce `package.json`, `tsconfig.json` (`"strict": true`, path alias `@/*` → `./*`), `next.config.ts`, `app/layout.tsx`, `app/page.tsx` placeholder
- [X] T002 Install and configure Tailwind CSS v4 via `@tailwindcss/postcss` in `postcss.config.mjs` and `app/globals.css` (`@import "tailwindcss";`), imported from `app/layout.tsx`
- [X] T003 [P] Add `zod@^3.25` dependency and dev deps `vitest`, `tsx`, `@types/node`; create `vitest.config.ts` (environment `node`, include `tests/**/*.test.ts`, resolve `@/*` alias)
- [X] T004 Add npm scripts to `package.json`: `dev`, `build`, `start`, `test` (`vitest run --passWithNoTests`), `test:watch`, `typecheck` (`tsc --noEmit`), `check:monsters` (`tsx scripts/check-monsters.ts`), `build:spells` (`tsx scripts/build-srd-spells.ts`), `record:jev` (`tsx --env-file=.env.local scripts/record-jev.ts`; Node ≥ 20.6 loads the key from `.env.local`)
- [X] T005 [P] Create `.env.example` with `TYPESAFE_API_KEY=`, `TYPESAFE_BASE_URL=https://api.typesafe.ai`, `JEV_MODEL=jev-latest` and a comment that `.env.local` holds the real key (do not touch the existing `.env.local`)
- [X] T006 [P] Copy Claude tooling per docs/PLAN.md "Claude tooling" from `F:\Projects\AI\ClaudeCore\.claude\` into `.claude/`: `agents/typescript-expert.md`, `agents/react-expert.md` (remove its PropTypes/defaultProps bullet), `skills/code-reviewer/`, `agents/code-reviewer.md`, `rules/*.md`, the four hooks and their `settings.json` entries, trimming `permissions.allow` to npm, npx and git
- [X] T007 Verify `npm run dev` serves the placeholder page, and that `npm test` (no tests yet) and `npm run typecheck` both pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Monster schema, core types, tracker creation and persistence that every story uses

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 [P] Write `tests/monster/schema.test.ts`: every `fixtures/monsters/*.json` parses with the general or legendary schema chosen by `classify`; Modifier accepts `"+3"`, `3` or missing and is normalised to a number computed as `floor((Score-10)/2)` when missing; a general body with `BonusActions` is not legendary; `Level: "5"` fails strict parse
- [X] T009 Implement `lib/monster/schema.ts`: copy `AbilityScoresSchema`, `EquipmentSchema`, `GeneralMonsterBodySchema`, `LegendaryActionsSchema`, `MythicTraitSchema`, `LegendaryMonsterBodySchema` from the DandDTemplateParser source (zod v3); make `Modifier` optional accepting number or signed string; export inferred types `GeneralMonster`, `LegendaryMonster`, the union `Monster = {kind:"general",body}|{kind:"legendary",body}`, `abilityModifier(score)`, and `classify(raw)` (legendary if `LegendaryActions` or any of `LegendaryTraits`, `LairActions`, `MythicTrait` present)
- [X] T010 [P] Create `tests/helpers/fixtures.ts`: `loadMonsterFixtures()` returning `{ file, name, cr, edition, raw }[]` parsed from `<Name>.CR<n>.<edition>.json` filenames, and `loadJevFixture(name)` for `fixtures/jev/`
- [X] T011 [P] Create `lib/monster/types.ts` with the extraction types from data-model.md: `Ability`, `AbilityUses`, `Spellcasting`, `SrdSpell`, `ReviewedMonster`, `SpeedMap`, each defined **only** as a zod schema with its type inferred via `z.infer` (no hand-written interfaces), because `ReviewedMonster` is read back from storage (constitution: Technical Constraints)
- [X] T012 [P] Create `lib/encounter/types.ts` with zod schemas and inferred types from data-model.md: `EncounterState`, `Settings`, `Player`, `PlayerTurn` (zone enum, `ZONE_DEFAULT_FT = { engaged: 5, near: 30, far: 60, veryFar: 61 }`), `Situation`, `TurnLogEntry`, `Tracker`
- [X] T013 Write `tests/encounter/state.create.test.ts`: `createTracker(reviewed, id, now)` yields full slots, per-day and recharge maxima, `hp = hpMax`, round 1, empty roster and log, default settings (`morale: 50`, `rechargeMode: "auto"`, temperament from INT ≤3/4–7/8–13/14+ → mindless/feral/cunning/genius); `legendaryActionsLeft` from `"Legendary Action Uses"`; `legendaryResistanceLeft` parsed from a "Legendary Resistance (N/Day)" trait (BriarthornHag's 2024 "(3/Day, or 4/Day in Lair)" → 3) or 0 when there's no such trait (never invented)
- [X] T014 Implement `createTracker`, `freshState(reviewed)` and `suggestTemperament(int)` in `lib/encounter/state.ts` (pure, no Date/random calls inside; id and timestamp are parameters)
- [X] T015 [P] Write `tests/encounter/storage.test.ts`: `serialize`/`parse` round-trip; `parse` of invalid JSON, wrong `version`, or schema-invalid data returns `{ ok: false, empty, raw }` where `empty = { version: 1, selectedId: null, trackers: [] }`
- [X] T016 Implement pure `serialize(store)` and `parse(text)` in `lib/encounter/storage.ts` using the zod schema for `{ version: 1, selectedId, trackers }` (contracts/cli-and-storage.md)
- [X] T017 Implement `app/useTrackers.ts` (client hook): the ONLY `localStorage` access; key `mja.v1.trackers`; every `getItem`/`setItem` in try/catch; on bad data saves the raw blob to `mja.v1.trackers.corrupt` and starts from empty; exposes `trackers`, `selected`, `select(id)`, `upsert(tracker)`, `remove(id)`, `storageWarning`
- [X] T018 Build the shell layout in `app/page.tsx`: four regions (tracker sidebar | monster + tracker | situation form | recommendation), stacking to one column under the `md` breakpoint for tablets, wired to `useTrackers`

**Checkpoint**: `npm test` passes; fixtures parse; trackers persist across reloads.

---

## Phase 3: User Story 1 - Load and verify a monster (Priority: P1) 🎯 MVP

**Goal**: Paste/upload a monster, see and revert auto-fixes, fix remaining errors inline, review extracted abilities, create a tracker.

**Independent Test**: Upload a broken copy of a fixture (empty `Equipment`, string `Level`, `"Legendary Actions"` key, `Weapon` key): four changes listed, revert works, continue blocked until valid, download returns fixed JSON, review screen lists abilities.

### Tests for User Story 1 ⚠️ (write first, must fail)

- [X] T019 [P] [US1] Write `tests/monster/normalize.test.ts` with one case per drift from docs/PLAN.md "Validation and fixing": `Equipment: {}` → filled blanks; `Level: "5"` → 5 (also `AC`, `Score`); missing `Modifier` computed; `"Legendary Actions"` and `Legendary_Actions` → `LegendaryActions`; `Equipment.Weapon` → `Weapons`; `"Saving Throws"` → `SavingThrows`; general monster with a flat legendary-actions map → legendary template with `{ "Legendary Action Uses": "3", Options }`, `ChallengeRating` from filename CR, `ProficiencyBonus` from the CR table, empty `BonusActions`/`Reactions`/`LairActions`/`RegionalEffects`/`MythicTrait` added, and "as a bonus action" `SpecialTraits` moved into `BonusActions`; missing CR with no filename → `needsCr: true`; unknown key kept and listed in `unknownKeys`; `moveUnknownToNotes(result, path)` appends `"<key>: <value>"` to `Notes`, removes the key, records a revertible `move-to-notes` change, and is never applied without being called; each change has `kind`, `path`, `before`, `after`, `message`; the fixed result passes strict zod
- [X] T020 [P] [US1] Add to `tests/monster/normalize.test.ts`: every fixture normalizes with zero changes; `normalize(normalize(x).fixed)` has zero changes; `revert(result, changeId)` restores that field and leaves other changes applied; no change of an unlisted kind is ever produced, and no Legendary Resistance, resistance, immunity or action is ever added
- [X] T021 [P] [US1] Write `tests/monster/extract.test.ts` against fixtures (2014): TunnelWasp Multiattack = Mandibles + Sting with to-hit and reach parsed; TieflingEnforcer recharge ability `{ kind: "recharge", min }`; MaestroDrazzuk spellcasting slots per level; AshenWarpriest: slots 4/3/2, Healing Word, Spiritual Weapon, Shield of Faith and Mass Healing Word categorised `bonus` (from the SRD table's casting time), Guiding Bolt, Hold Person and Spirit Guardians categorised `action`, "Ash Step" (Disengage) a trait-granted `bonus` ability, "War Priest" a `bonus` ability with `dependsOnAttackAction: true`, and Light Crossbow `range { normal: 80, long: 320 }`; Fiddlebits has **no** bonus-action ability (its "uses your bonus action to command" text is not the pattern); `parseHp("135 (18d10 + 36)") === 135`; `parseSpeed("30 ft., fly 60 ft.")` → `{ walk: 30, fly: 60 }`; ranged `range 80/320 ft.`; damage dice with average and type; `60-foot cone` area; `(3/Day)` uses; unparseable text kept with `parsed: "none"` and `raw`
- [X] T022 [P] [US1] Add 2024-wording cases to `tests/monster/extract.test.ts` against `BriarthornHag.CR7.2024.json`: Thorn Lash `Melee Attack Roll: +7, reach 10 ft.` with 2d6+4 Piercing plus 2d6 Poison; Thorn Dart `Ranged Attack Roll: +7, range 60/240 ft.`; Bramble Burst save `{ ability: "Dexterity", dc: 15 }`, area 30-foot cone, `{ kind: "recharge", min: 5 }` from `Recharge 5–6` (en dash); Spellcasting as an **action** with at-will cantrips, `1/Day Each` spells as `per-day` max 1, and no slots; `Misty Step (2/Day)` a `bonus` ability with `per-day` max 2; Bramble Shield a `reaction`; Thornward Hex `known: false`. Keep a few inline-string cases for variants the fixture doesn't use (e.g. `Melee Attack Roll: +4, reach 5 ft.`)
- [X] T023 [P] [US1] Write `tests/monster/spells.test.ts`: case-insensitive lookup by name finds an SRD spell with level, casting time, concentration; an unknown name (e.g. "Thornward Hex") returns `{ known: false }`; Healing Word and Spiritual Weapon have `castingTime: "bonus"`

### Implementation for User Story 1

- [X] T024 [P] [US1] Write `scripts/build-srd-spells.ts` to generate `data/srd-spells.json` from the SRD 5.1 spell list (CC BY 4.0) with fields `name, level, castingTime ("action"|"bonus"|"reaction"|"other"), range, area?, save?, attack?, damage?, concentration`; commit the generated JSON and add `data/README.md` with the CC BY 4.0 attribution (research R9)
- [X] T025 [US1] Implement `lib/monster/normalize.ts` exporting `normalize(raw, { filename? })` → `NormalizeResult`, `revert(original, result, changeId)`, `moveUnknownToNotes(result, path)`, an `ALIASES` table (spacing, case, singular/plural) and a `PB_BY_CR` table; pure, no I/O; make T019–T020 pass
- [X] T026 [US1] Implement `scripts/check-monsters.ts` per contracts/cli-and-storage.md (`OK` / `CHANGED` / `INVALID` lines, exit codes, `--fix` rewrites with 2-space indent and trailing newline, never rewrites INVALID); run `npm run check:monsters` and confirm all fixtures report `OK`
- [X] T027 [US1] Implement `lib/monster/spells.ts` (`lookupSpell(name)` over `data/srd-spells.json`) to pass T023
- [X] T028 [US1] Implement `lib/monster/extract.ts`: `extractAbilities(monster)` → `ReviewedMonster` draft (abilities, spellcasting, `hpMax` via `parseHp`, `speed` via `parseSpeed`, `intScore`), handling both wordings from docs/PLAN.md "Reading the statblock", Multiattack composition, recharge, X/Day, areas, ranges, damage, "as a bonus action" in trait text, and setting `dependsOnAttackAction` for "when you take the Attack action" bonus actions; pass T021–T022
- [X] T029 [P] [US1] Build `components/MonsterLoader.tsx`: paste textarea and file upload; shows a JSON parse error inline; passes the filename to `normalize`; prompts for CR when `needsCr`
- [X] T030 [US1] Build `components/FixScreen.tsx`: lists each change with Accept/Revert (calls `revert`), lists zod errors per field with inline editors for the offending value, lists unknown keys with a "move to Notes" option (calls `moveUnknownToNotes`), disables Continue until valid, and offers "Download fixed JSON" (Blob download of the fixed object)
- [X] T031 [US1] Build `components/ReviewScreen.tsx`: a row per extracted ability with category, uses, attack/save, range, area, damage; spell slots per level; unknown spells flagged with fields to fill in; unparsed abilities shown as raw text; each row editable; "Confirm" produces a `ReviewedMonster`
- [X] T032 [US1] Wire the load flow in `app/page.tsx`: MonsterLoader → FixScreen → ReviewScreen → `createTracker` → `useTrackers.upsert` and select the new tracker

**Checkpoint**: US1 is fully functional. A broken monster can be fixed, reviewed and saved as a tracker.

---

## Phase 4: User Story 2 - Get a turn recommendation and apply it (Priority: P1)

**Goal**: Situation input → legal options → one Jev request → interpreted recommendation → override → Apply.

**Independent Test**: With a reviewed monster and one engaged player, request a recommendation, override the target, Apply, and confirm exactly the chosen resources were spent and a log entry was written.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [ ] T033 [P] [US2] Write `tests/monster/options.test.ts`: incapacitated/stunned/paralyzed/petrified/unconscious → `blocked` with reason and no actions or bonus actions; stunned/paralyzed/petrified/unconscious → `blocked.movementBy: "code"` and movements `["hold"]`; incapacitated alone → `blocked.movementBy: "dm"` with the full movement list; speed 0 (grappled/restrained) → movements `["hold"]`; spent recharge, exhausted X/day, and a leveled spell with no slot ≥ its level are excluded; upcast `availableLevels` lists only levels with slots; basic actions Dash/Dodge/Disengage/Hide/Help always present; bonus actions include `BonusActions`, trait-granted, bonus-action spells and `none`; `flyUp` only with fly speed; range flags use the exact distance or `ZONE_DEFAULT_FT` and movement speed for `inRangeAfterMove`; out-of-range options still present; every list ≤ 255
- [ ] T034 [P] [US2] Write `tests/decide/clusters.test.ts`: union-find over `clusteredWith` gives connected groups plus singletons; downed players are still included and counted
- [ ] T035 [P] [US2] Write `tests/decide/questions.test.ts`: builds exactly the keys in contracts/jev-questions.md; every criterion key exists in the legal options; questions with < 2 keys are not asked; `target__<i>` for the top 4 single-target candidates and `cluster__<i>` for the top 3 area candidates ranked per research R5; `slot_level__<i>` only for leveled candidates; `multiattack_fallback` only when Multiattack is legal; `spend_resource` only when a limited option exists; state includes only the last 3 log entries; state includes the `rawUnparsed` text of abilities the extractor couldn't parse; a candidate table maps indexes back
- [ ] T036 [P] [US2] Write `tests/jev/client.test.ts` with an injected `fetch` stub: Bearer header set; 30 s timeout signal passed; one retry on 408/429/500/529 and none on 400; response validated with zod; throws `JevError` (data-model.md) with `kind: "config"` when `TYPESAFE_API_KEY` is missing (and `fetch` is never called), `kind: "upstream"` for a non-2xx after the retry or a zod-invalid body, and `kind: "timeout"` when the abort fires on the final attempt; the key never appears in thrown error messages
- [ ] T037 [P] [US2] Write `tests/decide/explain.test.ts`: the explanation is a template naming the tactic, the target reason and rounded probabilities, with no text beyond the template
- [ ] T038 [P] [US2] Write `tests/encounter/state.apply.test.ts`: `apply(tracker, choice)` spends the slot level, per-day use or recharge the DM actually chose (not the recommendation); sets concentration on a concentration spell and replaces an existing one; pushes a `TurnLogEntry` with `recommended` true/false; keeps the situation for the next turn; HP and slots never go below 0
- [ ] T039 [P] [US2] Write `tests/api/decide.route.test.ts`: call the route's `POST` handler with `vi.mock("@/lib/jev/client")`; a monster that can act → `callJev` called exactly once and `200 { ok: true }`; a stunned monster → `callJev` not called, `meta.jevCalled: false`, movement `"hold"`; an incapacitated-only monster → not called, movement `null` (DM picks); invalid body → 400; the mock throwing `JevError` with `kind` `"config"` / `"upstream"` / `"timeout"` → 500 / 502 / 504 with matching `error.kind`; the response body never contains the key

### Implementation for User Story 2

- [ ] T040 [P] [US2] Create `lib/jev/types.ts`: copy the **request** types from `prototype/src/types.ts` lines 10–76 (`ChoiceQuestion`, `NoulQuestion`, `ScoreQuestion`, `Question`, `SystemOneRequest`, `MAX_CHOICE_OPTIONS`, `OPTION_NONE`); define the **response** side (`ChoiceAnswer`, `NoulAnswer`, `ScoreAnswer`, `Answer`, `SystemOneResponse`) only as zod schemas with `z.infer` types; add a compile-time check (e.g. `const _check: PrototypeSystemOneResponse = {} as SystemOneResponse` using a type-only copy of the prototype interfaces in the same file) so drift from the prototype fails `npm run typecheck`
- [ ] T041 [US2] Implement `lib/jev/client.ts`: `callJev(req, { fetch = globalThis.fetch, env })` reading `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL` (default `https://api.typesafe.ai`) and `JEV_MODEL` (default `jev-latest`); `POST /v1/systemone`; Bearer auth; `AbortSignal.timeout(30_000)`; one retry on 408/429/5xx/529 honouring `Retry-After` up to 5 s; returns `{ response, latencyMs }`; exports and throws `JevError { kind: "config" | "upstream" | "timeout", message, status? }`, checking the key before any fetch; pass T036
- [ ] T042 [US2] Implement `lib/monster/options.ts`: `buildLegalOptions(reviewed, state, situation)` → `LegalOptions` per data-model.md and docs/PLAN.md "Legal options"; one-line `summary` per option; pass T033
- [ ] T043 [P] [US2] Implement `lib/decide/constants.ts`: `CONFIDENCE_HIGH = 0.85`, `CONFIDENCE_MEDIUM = 0.60`, `RETREAT_THRESHOLD = 0.60`, `SPEND_RESOURCE_LOW = 0.40`, `TARGET_CANDIDATES = 4`, `CLUSTER_CANDIDATES = 3`, `HISTORY_TURNS = 3`
- [ ] T044 [US2] Implement `buildClusters(situation)` in `lib/decide/clusters.ts`; pass T034
- [ ] T045 [US2] Implement `lib/decide/questions.ts`: `buildJevRequest(tracker, situation, options)` → `{ request: SystemOneRequest, candidates }` with `choice()`/`noul()` helpers as in `prototype/src/questions.ts`; pass T035
- [ ] T046 [US2] Write `scripts/record-jev.ts` and `fixtures/jev/scenarios.ts` defining the five docs/PLAN.md scenarios: `lone-melee` (TunnelWasp); `spread-party` (MaestroDrazzuk, a downed caster and two clustered players); `low-hp-retreat` (TieflingEnforcer, low HP, cowardly morale, escape route); `concentrating-caster` (MaestroDrazzuk, already concentrating); `warpriest-dual-spells` (AshenWarpriest at full slots, two players engaged and one near, so Guiding Bolt/Hold Person/Spirit Guardians as actions and Spiritual Weapon/Shield of Faith as bonus actions are all legal, and War Priest is offered). For each, build options and questions and call `callJev` once, then write `fixtures/jev/<scenario>.json` = `{ request, response }`. **Needs the DM's `TYPESAFE_API_KEY` in `.env.local`. Run once with `npm run record:jev` (which passes `--env-file=.env.local`).** Depends on T028, T042–T045
- [ ] T047 [US2] Create derived fixtures in `fixtures/jev/derived/<rule>.json`, each a copy of a recorded `fixtures/jev/<scenario>.json` with only `response.answers[*].probabilities`/`choice`/`noul` edited and a top-level `"derivedFrom": "<scenario>.json"` plus a one-line `"purpose"`. The `request` is never edited; `unknown-answer-keys` is the one fixture that may also **add** an answer key or probability key the request didn't ask for. `two-leveled-spells` and `attack-dependent-bonus` derive from `warpriest-dual-spells.json`. One fixture per rule the recordings don't already trigger: `choice-not-argmax`, `attack-dependent-bonus`, `two-leveled-spells`, `out-of-range-no-close`, `retreat-high`, `concentration-swap`, `spend-resource-low`, `confidence-buckets`, `non-candidate-action`, `unknown-answer-keys`. Add a test in `tests/helpers/fixtures.test.ts` that every derived fixture's `request` is byte-identical to its source's. Depends on the recording task above
- [ ] T048 [US2] Write `tests/decide/interpret.test.ts` using recorded responses from `fixtures/jev/` and derived fixtures from `fixtures/jev/derived/`: reads `probabilities`, not `choice` (include a case where they disagree); drops an attack-dependent bonus action when the action isn't an attack; one leveled spell per turn (the lower-probability one is replaced by its best alternative); out-of-range action with non-closing `move_before` → next-best in-range option; `should_retreat ≥ RETREAT_THRESHOLD` → Disengage or Dash with retreat movement; concentrating plus a new concentration spell → pick stands with a warning naming the dropped spell; low `spend_resource` boosts the best no-resource option; confidence buckets at `CONFIDENCE_HIGH`/`CONFIDENCE_MEDIUM`; non-candidate action gets the code-picked target (lowest apparent HP in range) marked as a code pick; unknown answer keys are ignored
- [ ] T049 [US2] Implement `lib/decide/interpret.ts`: `interpret(response, options, candidates, tracker, situation)` → `Recommendation` applying the consistency rules in docs/PLAN.md "Interpretation" in a fixed order, recording each in `adjustments`; pass T048
- [ ] T050 [US2] Implement `lib/decide/explain.ts` (template explanation and runners-up list); pass T037
- [ ] T051 [US2] Implement `apply(tracker, choice)` in `lib/encounter/state.ts`; pass T038
- [ ] T052 [US2] Implement `app/api/decide/route.ts` per contracts/decide-api.md: zod-validate the body; recompute options; when `options.blocked`, return the blocked recommendation without calling Jev (movement `"hold"` when `movementBy: "code"`, `null` when `"dm"`); build the request; `callJev`; validate; interpret; log one line `jev model=… latencyMs=… usage=… questions=…` via `console.info` (never the state or key); return 400 for an invalid body and map `JevError.kind` `config`/`upstream`/`timeout` to 500/502/504 `{ ok: false, error: { kind, message } }`; the route never reads `TYPESAFE_API_KEY` itself; pass T039
- [ ] T053 [P] [US2] Build `components/PartyRoster.tsx`: add, edit and remove players (name, role, class, optional AC), saved on the tracker
- [ ] T054 [P] [US2] Build `components/PlayerRow.tsx`: zone select plus optional exact feet, apparent HP, conditions, cover, hit-last-round, clustered-with multi-select of other players
- [ ] T055 [US2] Build `components/SituationForm.tsx`: one PlayerRow per roster player, pre-filled from the tracker's carried-over `situation`; allies present and count; terrain checkboxes (difficult, chokepoint, escape route, flying possible); DM notes; a "Recommend" button
- [ ] T056 [US2] Build `components/RecommendationCard.tsx`: move before → action (target/cluster/slot) → bonus action → move after; confidence badge ("DM's call" below medium); explanation; warnings; collapsed runners-up with probabilities; a separate override control for **each** of: move before, action, action target(s), cluster (area actions), slot level (leveled spells), bonus action, bonus-action target(s), move after, each listing every legal option computed client-side with `buildLegalOptions` (Principle III); an Apply button that calls `apply` with the DM's final choices; a blocked state that shows the reason, fixes movement to "hold" when `movementBy: "code"`, and shows movement selects for the DM when `movementBy: "dm"`
- [ ] T057 [US2] Wire the decide flow in `app/page.tsx`: POST `/api/decide` with `{ tracker, situation }`; on `ok: false` or a network error, show `error.message` and render RecommendationCard in manual mode from local options; on Apply, `upsert` the updated tracker; show `meta.latencyMs` and usage in a small debug footer
- [ ] T058 [US2] Verify secret safety: `TYPESAFE_API_KEY` is referenced only in `lib/jev/client.ts` (plus `.env.example`, `.env.local` and docs); `lib/jev` is never imported from a `"use client"` file; after `npm run build`, grep `.next/static` for the key name and confirm no match

**Checkpoint**: US1 + US2 are the full MVP loop. Load a monster, get a recommendation, override it, apply it.

---

## Phase 5: User Story 3 - Track encounter state across rounds (Priority: P2)

**Goal**: Start turn (round and recharge rolls), manual state edits, recording turn results, history feeding the next request, persistence.

**Independent Test**: Spend a slot and a recharge ability, start the next turn: the slot stays spent, the recharge roll is shown and applied, the round advances, and the log shows the previous turn with its result.

### Tests for User Story 3 ⚠️

- [ ] T059 [P] [US3] Write `tests/encounter/state.turn.test.ts`: `startTurn(tracker, rng)` increments the round; in auto mode it rolls `1 + floor(rng()*6)` per spent recharge ability and marks it available when the roll ≥ `min`, returning `{ tracker, rolls }`; in manual mode it makes no rolls; `recordResult(tracker, i, result, note?)` sets the result; manual edits (`setHp`, `setSlots`, `setPerDay`, `setRecharge`, `setConditions`, `setConcentration`, `setLegendary`) clamp to [0, max]; `log.slice(-HISTORY_TURNS)` is what questions use

### Implementation for User Story 3

- [ ] T060 [US3] Implement `startTurn`, `recordResult` and the manual-edit reducers in `lib/encounter/state.ts`; pass T059
- [ ] T061 [P] [US3] Build `components/EncounterTracker.tsx`: HP current/max, slots per level, X/day uses, recharge available/spent toggles, legendary actions and Legendary Resistance counters, conditions, concentration, round; a "Start turn" button that calls `startTurn(tracker, Math.random)` and shows the rolls
- [ ] T062 [P] [US3] Build `components/TurnLog.tsx`: entries newest first, showing action, target, move, slot and a recommended/overridden marker; a hit/miss/downed/effect result picker and an optional note per entry
- [ ] T063 [US3] Wire EncounterTracker and TurnLog into `app/page.tsx`; confirm the state survives a page reload and that a corrupt stored blob shows the storage warning and an empty app

**Checkpoint**: Multi-round play works with accurate resources and history.

---

## Phase 6: User Story 4 - Manage multiple monsters with trackers (Priority: P2)

**Goal**: Sidebar listing, switching, Duplicate and Delete.

**Independent Test**: Duplicate a damaged tracker with spent resources. The copy has the same statblock, roster and settings, full HP and resources, round 1, a blank situation, an empty log and a distinct name. Deleting a tracker after confirming removes it; cancelling keeps it.

### Tests for User Story 4 ⚠️

- [ ] T064 [P] [US4] Write `tests/encounter/state.duplicate.test.ts`: `duplicate(tracker, existingNames, id, now)` keeps `reviewed`, `roster` and `settings`, and resets state, log and situation; names it `"<base> 2"`, `"<base> 3"`, … avoiding names in `existingNames` (base strips a trailing number)

### Implementation for User Story 4

- [ ] T065 [US4] Implement `duplicate` in `lib/encounter/state.ts`; pass T064
- [ ] T066 [US4] Build `components/TrackerSidebar.tsx`: lists trackers (name, HP, round), selects, adds a new monster (opens MonsterLoader), and offers Duplicate and Delete (with confirm); collapses to a drawer on tablet width; wire it in `app/page.tsx`

**Checkpoint**: Several monsters can be run side by side.

---

## Phase 7: User Story 5 - Tune behaviour and see reminders (Priority: P3)

**Goal**: Temperament, morale and recharge-mode settings, plus reminder cards for legendary actions, reactions and lair actions.

**Independent Test**: An INT 2 monster suggests "mindless". A legendary monster shows reminder cards for legendary actions left and their options, reactions and lair actions, and none of them is decided.

### Tests for User Story 5 ⚠️

- [ ] T067 [P] [US5] Write `tests/encounter/reminders.test.ts`: `buildReminders(tracker)` returns legendary actions left with options from `LegendaryActions.Options`, reactions from `Reactions` and reaction-category abilities, and lair actions flagged "initiative 20"; it returns an empty list for a general monster with no reactions; settings temperament and morale appear in the Jev state built by `buildJevRequest` (extend `tests/decide/questions.test.ts`)

### Implementation for User Story 5

- [ ] T068 [US5] Implement `buildReminders` in `lib/encounter/reminders.ts`; pass T067
- [ ] T069 [P] [US5] Build the settings panel in `components/EncounterTracker.tsx`: temperament select showing the INT-based suggestion, a morale slider (cowardly ↔ fanatical, 0–100, default 50), and an auto/manual recharge-mode toggle
- [ ] T070 [P] [US5] Build `components/ReminderCards.tsx` showing the `buildReminders` output after Start turn, read-only with no decide buttons; wire it in `app/page.tsx`

**Checkpoint**: All user stories are functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T071 [P] Update `README.md` with setup (`.env.local`, `npm run dev`), the checks to run, and a link to quickstart.md
- [ ] T072 [P] Tablet pass: check every screen at 768 px and 1024 px widths, with no horizontal scroll and touch targets ≥ 44 px; fix the Tailwind classes in `components/*.tsx`
- [ ] T073 Confirm `lib/monster`, `lib/encounter` and `lib/decide` contain no `react`, `fetch(` or `localStorage` (grep), and that every `localStorage` call is in `app/useTrackers.ts` inside try/catch
- [ ] T074 Run the quality gates: `npm test`, `npm run typecheck`, `npm run check:monsters` (zero changes); report any failure verbatim
- [ ] T075 Run the quickstart.md manual validation (steps 1–7), including the five scenarios: confirm exactly one `jev …` log line per recommended turn and none for a stunned monster, and time one turn from Start turn to Apply (under 60 s, SC-001)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)**, which blocks every story
- **US1 (Phase 3)** can start after Phase 2
- **US2 (Phase 4)** depends on Phase 2 **and on US1's T027 (`spells.ts`) and T028 (`extract.ts`)**: options, questions and the Jev recordings all need a `ReviewedMonster` from the extractor. US2's tests and the lib/jev tasks (T036, T040, T041) can start before T028; the rest waits for it. US2's end-to-end UI check also needs US1's loader, or a tracker built from a fixture in dev
- **US3, US4 and US5** depend on Phase 2, and on US2 only where they share `state.ts` and `app/page.tsx` (edit sequentially)
- **Polish** comes after the stories you intend to ship

### Within User Story 2

T028 (extract, US1) → T042 (options) → T044/T045 (questions) · T040 → T041 (client) → **T046 (record fixtures, needs the API key in `.env.local`)** → T047 (derived fixtures) → T048 test → T049 interpret → T050 explain → T039 route test → T052 route → T056/T057 UI

Derived fixtures copy a recorded response, so the interpret work (T048–T049) can't start until one recording run has succeeded.

### Shared-file sequencing (no [P] across these)

- `lib/encounter/state.ts`: T014 → T051 → T060 → T065
- `app/page.tsx`: T018 → T032 → T057 → T063 → T066 → T070
- `tests/monster/normalize.test.ts`: T019 → T020 · `tests/monster/extract.test.ts`: T021 → T022
- `tests/decide/questions.test.ts`: T035 → T067 (T067 extends the file; run it after T045 passes)

---

## Parallel Examples

```text
# Phase 2, after T009:
T010 tests/helpers/fixtures.ts · T011 lib/monster/types.ts · T012 lib/encounter/types.ts · T015 storage test

# US1 tests together:
T019/T020 normalize tests · T021/T022 extract tests · T023 spells test · T024 SRD spell data

# US2 tests together:
T033 options · T034 clusters · T035 questions · T036 jev client · T037 explain · T038 apply · T039 route
# US2 UI pieces together:
T053 PartyRoster · T054 PlayerRow

# US3 UI:
T061 EncounterTracker · T062 TurnLog
```

---

## Implementation Strategy

### MVP (US1 + US2)

US1 alone is a usable statblock validator and fixer. The product's value is the turn decision, so treat **Phases 1–4** as the MVP: Setup → Foundational → US1 → US2. Then **stop and validate** with the quickstart scenarios (state is single-turn at that point).

### Incremental delivery

1. Setup + Foundational → the shell persists trackers
2. US1 → load, fix and review monsters (demo)
3. US2 → recommend, override and apply (MVP)
4. US3 → multi-round tracking · US4 → multiple monsters · US5 → settings and reminders
5. Polish → gates and manual validation

## Notes

- Commit after each task or logical group. Every lib/ change needs a passing test first (Principle V).
- T046 is the only task that calls live Jev, and it needs the DM's key (already in `.env.local`). Every test uses its recorded output or a derived copy with `derivedFrom` (constitution v1.0.1).
- `.env.local` already exists. T005 creates only `.env.example` and must not overwrite `.env.local`.
- Don't build anything listed under "Out of Scope (v1)" in spec.md.
