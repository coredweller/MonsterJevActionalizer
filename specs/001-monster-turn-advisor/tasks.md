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
- `Fiddlebits` mentions "uses your bonus action to command" (a companion). Since G11 (2026-10-12) that wording counts,
  so its Steel Defender trait is extracted as a bonus action.
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

- [X] T033 [P] [US2] Write `tests/monster/options.test.ts`: incapacitated/stunned/paralyzed/petrified/unconscious → `blocked` with reason and no actions or bonus actions; stunned/paralyzed/petrified/unconscious → `blocked.movementBy: "code"` and movements `["hold"]`; incapacitated alone → `blocked.movementBy: "dm"` with the full movement list; speed 0 (grappled/restrained) → movements `["hold"]`; spent recharge, exhausted X/day, and a leveled spell with no slot ≥ its level are excluded; upcast `availableLevels` lists only levels with slots; basic actions Dash/Dodge/Disengage/Hide/Help always present; bonus actions include `BonusActions`, trait-granted, bonus-action spells and `none`; `flyUp` only with fly speed; range flags use the exact distance or `ZONE_DEFAULT_FT` and movement speed for `inRangeAfterMove`; out-of-range options still present; every list ≤ 255
- [X] T034 [P] [US2] Write `tests/decide/clusters.test.ts`: union-find over `clusteredWith` gives connected groups plus singletons; downed players are still included and counted
- [X] T035 [P] [US2] Write `tests/decide/questions.test.ts`: builds exactly the keys in contracts/jev-questions.md; every criterion key exists in the legal options; questions with < 2 keys are not asked; `target__<i>` for the top 4 single-target candidates and `cluster__<i>` for the top 3 area candidates ranked per research R5; `slot_level__<i>` only for leveled candidates; `multiattack_fallback` only when Multiattack is legal; `spend_resource` only when a limited option exists; state includes only the last 3 log entries; state includes the `rawUnparsed` text of abilities the extractor couldn't parse; a candidate table maps indexes back
- [X] T036 [P] [US2] Write `tests/jev/client.test.ts` with an injected `fetch` stub: Bearer header set; 20 s timeout signal passed; one retry on 408/429/500/529 and none on 400; response validated with zod; throws `JevError` (data-model.md) with `kind: "config"` when `TYPESAFE_API_KEY` is missing (and `fetch` is never called), `kind: "upstream"` for a non-2xx after the retry or a zod-invalid body, and `kind: "timeout"` when the abort fires on the final attempt; the key never appears in thrown error messages
- [X] T037 [P] [US2] Write `tests/decide/explain.test.ts`: the explanation is a template naming the tactic, the target reason and rounded probabilities, with no text beyond the template
- [X] T038 [P] [US2] Write `tests/encounter/state.apply.test.ts`: `apply(tracker, choice)` spends the slot level, per-day use or recharge the DM actually chose (not the recommendation); sets concentration on a concentration spell and replaces an existing one; pushes a `TurnLogEntry` with `recommended` true/false; keeps the situation for the next turn; HP and slots never go below 0
- [X] T039 [P] [US2] Write `tests/api/decide.route.test.ts`: call the route's `POST` handler with `vi.mock("@/lib/jev/client")`; a monster that can act → `callJev` called exactly once and `200 { ok: true }`; a stunned monster → `callJev` not called, `meta.jevCalled: false`, movement `"hold"`; an incapacitated-only monster → not called, movement `null` (DM picks); invalid body → 400; the mock throwing `JevError` with `kind` `"config"` / `"upstream"` / `"timeout"` → 500 / 502 / 504 with matching `error.kind`; the response body never contains the key

### Implementation for User Story 2

- [X] T040 [P] [US2] Create `lib/jev/types.ts`: copy the **request** types from `prototype/src/types.ts` lines 10–76 (`ChoiceQuestion`, `NoulQuestion`, `ScoreQuestion`, `Question`, `SystemOneRequest`, `MAX_CHOICE_OPTIONS`, `OPTION_NONE`); define the **response** side (`ChoiceAnswer`, `NoulAnswer`, `ScoreAnswer`, `Answer`, `SystemOneResponse`) only as zod schemas with `z.infer` types; add a compile-time check (e.g. `const _check: PrototypeSystemOneResponse = {} as SystemOneResponse` using a type-only copy of the prototype interfaces in the same file) so drift from the prototype fails `npm run typecheck`
- [X] T041 [US2] Implement `lib/jev/client.ts`: `callJev(req, { fetch = globalThis.fetch, env })` reading `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL` (default `https://api.typesafe.ai`) and `JEV_MODEL` (default `jev-latest`); `POST /v1/systemone`; Bearer auth; `AbortSignal.timeout(20_000)`; one retry on 408/429/5xx/529 honouring `Retry-After` up to 5 s; returns `{ response, latencyMs }`; exports and throws `JevError { kind: "config" | "upstream" | "timeout", message, status? }`, checking the key before any fetch; pass T036
- [X] T042 [US2] Implement `lib/monster/options.ts`: `buildLegalOptions(reviewed, state, situation)` → `LegalOptions` per data-model.md and docs/PLAN.md "Legal options"; one-line `summary` per option; pass T033
- [X] T043 [P] [US2] Implement `lib/decide/constants.ts`: `CONFIDENCE_HIGH = 0.85`, `CONFIDENCE_MEDIUM = 0.60`, `RETREAT_THRESHOLD = 0.60`, `SPEND_RESOURCE_LOW = 0.40`, `TARGET_CANDIDATES = 4`, `CLUSTER_CANDIDATES = 3`, `HISTORY_TURNS = 3`
- [X] T044 [US2] Implement `buildClusters(situation)` in `lib/decide/clusters.ts`; pass T034
- [X] T045 [US2] Implement `lib/decide/questions.ts`: `buildJevRequest(tracker: DecideTracker, situation, options)` → `{ request: JevRequest (no `model`; the client fills it from `JEV_MODEL`), candidates }` with `choice()`/`noul()` helpers as in `prototype/src/questions.ts`; pass T035
- [X] T046 [US2] Write `scripts/record-jev.ts` and `fixtures/jev/scenarios.ts` defining the five docs/PLAN.md scenarios: `lone-melee` (TunnelWasp); `spread-party` (MaestroDrazzuk, a downed caster and two clustered players); `low-hp-retreat` (TieflingEnforcer, low HP, cowardly morale, escape route); `concentrating-caster` (MaestroDrazzuk, already concentrating); `warpriest-dual-spells` (AshenWarpriest at full slots, two players engaged and one near, so Guiding Bolt/Hold Person/Spirit Guardians as actions and Spiritual Weapon/Shield of Faith as bonus actions are all legal, and War Priest is offered). For each, build options and questions and call `callJev` once, then write `fixtures/jev/<scenario>.json` = `{ request, response }`. **Needs the DM's `TYPESAFE_API_KEY` in `.env.local`. Run once with `npm run record:jev` (which passes `--env-file=.env.local`).** Depends on T028, T042–T045
- [X] T047 [US2] Create derived fixtures in `fixtures/jev/derived/<rule>.json`, each a copy of a recorded `fixtures/jev/<scenario>.json` with only `response.answers[*].probabilities`/`choice`/`noul` edited and a top-level `"derivedFrom": "<scenario>.json"` plus a one-line `"purpose"`. The `request` is never edited; `unknown-answer-keys` is the one fixture that may also **add** an answer key or probability key the request didn't ask for. `two-leveled-spells` and `attack-dependent-bonus` derive from `warpriest-dual-spells.json`. One fixture per rule the recordings don't already trigger: `choice-not-argmax`, `attack-dependent-bonus`, `two-leveled-spells`, `out-of-range-no-close`, `retreat-high`, `concentration-swap`, `spend-resource-low`, `confidence-buckets`, `non-candidate-action`, `unknown-answer-keys`. Add a test in `tests/helpers/fixtures.test.ts` that every derived fixture's `request` is byte-identical to its source's. Depends on the recording task above
- [X] T048 [US2] Write `tests/decide/interpret.test.ts` using recorded responses from `fixtures/jev/` and derived fixtures from `fixtures/jev/derived/`: reads `probabilities`, not `choice` (include a case where they disagree); drops an attack-dependent bonus action when the action isn't an attack; one leveled spell per turn (the lower-probability one is replaced by its best alternative); out-of-range action with non-closing `move_before` → next-best in-range option; `should_retreat ≥ RETREAT_THRESHOLD` → Disengage or Dash with retreat movement; concentrating plus a new concentration spell → pick stands with a warning naming the dropped spell; low `spend_resource` boosts the best no-resource option; confidence buckets at `CONFIDENCE_HIGH`/`CONFIDENCE_MEDIUM`; non-candidate action gets the code-picked target (lowest apparent HP in range) marked as a code pick; unknown answer keys are ignored
- [X] T049 [US2] Implement `lib/decide/interpret.ts`: `interpret(response, options, candidates, tracker, situation)` → `Recommendation` applying the consistency rules in docs/PLAN.md "Interpretation" in a fixed order, recording each in `adjustments`; pass T048
- [X] T050 [US2] Implement `lib/decide/explain.ts` (template explanation and runners-up list); pass T037
- [X] T051 [US2] Implement `apply(tracker, choice)` in `lib/encounter/state.ts`; pass T038
- [X] T052 [US2] Implement `app/api/decide/route.ts` per contracts/decide-api.md: zod-validate the body; recompute options; when `options.blocked`, return the blocked recommendation without calling Jev (movement `"hold"` when `movementBy: "code"`, `null` when `"dm"`); build the request; `callJev`; validate; interpret; log one line `jev model=… latencyMs=… usage=… questions=…` via `console.info` (never the state or key); return 400 for an invalid body and map `JevError.kind` `config`/`upstream`/`timeout` to 500/502/504 `{ ok: false, error: { kind, message } }`; the route never reads `TYPESAFE_API_KEY` itself; pass T039
- [X] T053 [P] [US2] Build `components/PartyRoster.tsx`: add, edit and remove players (name, role, class, optional AC), saved on the tracker
- [X] T054 [P] [US2] Build `components/PlayerRow.tsx`: zone select plus optional exact feet, apparent HP, conditions, cover, hit-last-round, clustered-with multi-select of other players
- [X] T055 [US2] Build `components/SituationForm.tsx`: one PlayerRow per roster player, pre-filled from the tracker's carried-over `situation`; allies present and count; terrain checkboxes (difficult, chokepoint, escape route, flying possible); DM notes; a "Recommend" button
- [X] T056 [US2] *(2026-10-11; draft logic in `lib/decide/draft.ts`, tested in `tests/decide/draft.test.ts`; gaps G01–G04, G06 below)* Build `components/RecommendationCard.tsx`: move before → action (target/cluster/slot) → bonus action → move after; confidence badge ("DM's call" below medium); explanation; warnings; runners-up with probabilities, collapsed except open on "DM's call" (G03); a separate override control for **each** of: move before, action, action target(s), cluster (area actions), slot level (leveled spells), bonus action, bonus-action target(s), bonus-action slot level (G01), move after, each listing every legal option computed client-side with `buildLegalOptions` (Principle III), and the target overrides listing every player, downed ones included, with no warning (F18); an Apply button that calls `apply` with the DM's final choices; a blocked state that shows the reason, fixes movement to "hold" when `movementBy: "code"`, and shows movement selects for the DM when `movementBy: "dm"`
- [X] T057 [US2] *(2026-10-11; also put PartyRoster and SituationForm on the page (G09); gaps G07, G08 below)* Wire the decide flow in `app/page.tsx`: POST `/api/decide` with `{ tracker, situation }`; on `ok: false` or a network error, show `error.message` and render RecommendationCard in manual mode from local options; on Apply, `upsert` the updated tracker; show `meta.latencyMs` and usage in a small debug footer
- [X] T058 [US2] *(2026-10-11, all clean. Key name in code only in `lib/jev/client.ts`; elsewhere only `.env.example`, `.env.local`, docs, specs and the tests that stub it (`tests/jev/client.test.ts`, `tests/api/decide.route.test.ts`). No `"use client"` file imports `lib/jev`; the route passes `process.env` and is the only `lib/jev/client` importer. After a clean `npm run build`, `.next/static` has 0 matches for the key name, `TYPESAFE_BASE_URL`, `JEV_MODEL`, `v1/systemone`, `Bearer ` and `callJev`, and all of `.next` has 0 matches for the key value. `.env.local` is git-ignored and untracked. See G05)* Verify secret safety: `TYPESAFE_API_KEY` is referenced only in `lib/jev/client.ts` (plus `.env.example`, `.env.local` and docs); `lib/jev` is never imported from a `"use client"` file; after `npm run build`, grep `.next/static` for the key name and confirm no match

### Gaps found while building the US2 UI (revisit after T058)

Filled or noticed during T056–T058, so they aren't in the task lines above. Add new ones here as they come up. After T058, check whether each still applies; the DM confirms or overrules, and any lib change is built test-first.

*Assessed 2026-10-11 against the code; the DM decided each item the same day.*

- [X] G01 *(T056, as built)* **Bonus-action slot level.** *Kept 2026-10-11; added to T056's list.* T056 didn't list a slot-level override for the bonus action, but the card has one. It's needed: Ashen Warpriest's bonus actions include leveled spells (Healing Word, Shield of Faith, Spiritual Weapon), and without the select, overriding to one makes `apply` throw (data-model `bonusSlotLevel`)
- [X] G02 *(T056, as built)* **Area bonus action targets players, not a group.** *Kept 2026-10-11.* `ApplyChoice.bonusAction` is a `ChosenOption` with no `clusterId`, so the card lists player chips for an area bonus action (`targetMode` in `lib/decide/draft.ts`). None of the 9 monster fixtures has one today. Add `clusterId` to the bonus action only if such a monster shows up
- [X] G03 *(T056, as built)* **Runners-up open on "DM's call".** *Kept 2026-10-11; T056 and docs/PLAN.md "Recommendation card" reworded.* Collapsed normally, open when confidence is `dmsCall`. The constitution (Principle III) says low confidence MUST surface the alternatives, which a collapsed list didn't
- [X] G04 *(T056, as built)* **Recommendation that doesn't fit the local options.** *Kept as the safety net 2026-10-11; closed with G08 2026-10-12.* `recommendationProblem` finds an action, slot, group, target or movement the locally computed options don't allow; the card shows a red alert, logs `recommendation.mismatch`, and falls back to picking by hand. It can't happen today, since nothing changes the monster's state while a card is shown. It will once T061 lets the DM edit slots and conditions (spending the recommended slot mid-card, say). **To build with G08:** nothing more for G04 itself; G08's notice covers situation edits, so this alert stays for state changes
- [X] G05 *(T058)* **Indirect `lib/jev` import from client code.** *Left as is 2026-10-11.* `buildLegalOptions` (`lib/monster/options.ts`) imports `MAX_CHOICE_OPTIONS` and `OPTION_NONE` from `lib/jev/types.ts`, which client code then bundles. T058 found nothing leaks: it's the only value import from `lib/jev` that client code reaches, and `lib/jev/types.ts` imports only zod. Not moved, because `MAX_CHOICE_OPTIONS` (255) really is the model's wire limit and caps the legal options; moving it would hide a real dependency
- [X] G06 *(T056, as built)* **Overrides aren't checked against interpret's consistency rules.** *Kept 2026-10-11.* The DM can override into two leveled spells, or an attack-dependent bonus action without an attack (Principle III, the DM has final say). A non-blocking hint is possible later
- [X] G07 *(T057)* **"Jev" reaches the UI through lib text.** *Decided 2026-10-11: neutral wording everywhere. Built 2026-10-12: `explain.ts` shows the probability alone; the route's `DM_MESSAGE` gives one message per error kind (tests in `tests/decide/explain.test.ts` and `tests/api/decide.route.test.ts`, seen failing first). Still says Jev, but the DM never sees it: the blocked answer's `meta.jevCalled` field in the shared response schema.* The page and card don't name it, but text they show does. **To build (test-first, no re-record, since this text isn't sent to Jev):**
  - `lib/decide/explain.ts`: a pick source drops the name: "(catches 2; 91%)", not "(catches 2; Jev 91%)". Update `tests/decide/explain.test.ts` first.
  - `app/api/decide/route.ts`: map each error kind to a DM-facing message that doesn't name Jev (e.g. "The decision service didn't answer within 20 s."; config: the API key is missing from `.env.local`). The detailed `JevError` message stays in the server log. Update `tests/api/decide.route.test.ts` first.
  - Interpret's `adjustments` also say "Jev" but aren't shown; leave them.
- [X] G08 *(T057, as built)* **Situation edited after Recommend.** *Decided 2026-10-11: keep the DM's edits, and show a notice. Built 2026-10-12: `sameSituation` in `lib/encounter/state.ts` (tests in `tests/encounter/state.situation.test.ts`, seen failing first); the card passes `tracker.situation` to `buildChoice` and shows the notice when it differs from the decided one.* As built, Apply saves the situation sent with Recommend as the tracker's situation, so edits typed after pressing Recommend are lost. That buys nothing: the turn log doesn't store the situation, which only becomes next turn's starting form. **To build:**
  - Apply keeps the tracker's latest situation instead of overwriting it. The card still computes options from the situation it was decided on.
  - When the tracker's situation differs from that one, the card says "The situation changed since you pressed Recommend", so the DM can press it again.
  - Any `lib/` change is test-first.
- [X] G09 *(T057, as built)* **Party and situation shown on the page.** *Kept 2026-10-11; noted on T057.* T053–T055 built `PartyRoster` and `SituationForm`, but no task put them on the page; T057 did (party under the monster summary, situation in its own column). Removing a player also re-syncs the saved situation (`syncSituation`)
- [X] G10 *(DM request)* **A more lively, fun colour scheme.** *Decided 2026-10-11: bright and colour-coded. Built 2026-10-12: `--accent*` CSS variables per column in `app/globals.css` (`accent-monster` is also the root default, so the trackers list and load screens are crimson); `Panel` takes an `accent`, and `Button`, `ToggleChip` and the Panel frame read the variables; solid badges; a crimson-violet-blue gradient header. Every new text/background pair is AA (lowest 4.94:1, white on green-700); alerts are unchanged. Checked in the browser by the DM 2026-10-12.* Today the page is stone grey with amber and red alerts. **To build:**
  - Each column gets its own saturated accent: monster crimson, party blue, situation green, recommendation violet.
  - The background is a warm off-white, with bolder badges and buttons.
  - Keep text and alert contrast readable (WCAG AA).
  - UI only, so no tests; check in the browser.
- [X] G11 *(found 2026-10-11, US1)* **A trait's bonus action isn't detected from "uses your bonus action".** Fiddlebits' Steel Defender trait says it "uses your bonus action to command", but `BONUS_ACTION` in `lib/monster/extract.ts` only matches "as a bonus action", so the monster gets no bonus actions. The DM can recategorise it in review, so nothing is blocked. *Decided 2026-10-11: yes. Built 2026-10-12: `BONUS_ACTION` also matches "use/uses/using a/its/your/their bonus action", but not after "can't"/"cannot"/"can not" (tests in `tests/monster/extract.test.ts` and `tests/monster/options.test.ts`, seen failing first). No recorded scenario uses Fiddlebits, so the fixture guards pass and nothing was re-recorded. The normalizer's legendary-upgrade move (`lib/monster/normalize.ts` step 6) still matches only "as a bonus action".* **To build: widen the pattern to "uses (your|its) bonus action" and similar, test-first.** This changes extraction, and so the legal options, for any recorded scenario whose monster uses that wording; check the fixture guards

### Review fixes (2026-10-08, before T056)

From the Phase 4 review. Judgment calls on options and range rules are deferred to the end. Each lib change is test-first.

- [X] F01 Update docs/PLAN.md, data-model.md, plan.md, research.md and this file: 20 s timeout, downed players by temperament, tie epsilon, bonus-action range rule, innate leveled spells, unknown spell levels, and the API shapes as built (Option, Recommendation, ApplyChoice, `bonusSlotLevel`, `JevRequest`). T047 also gained an 11th derived fixture, `tie-break-choice`
- [X] F02 [US2] `lib/decide/questions.ts`: ability summaries in Jev's state no longer repeat the uses ("recharge 5–6 (recharge 5–6)")
- [X] F03 [US1] Spell lookup ignores a trailing uses suffix: "Misty Step (2/Day)" is known, level 2 *(agent stopped before reporting; behaviour verified by hand 2026-10-08, test-first record not available)*
- [X] F04 [US1] An unknown spell's level is left empty, never 0 (Thornward Hex); `SpellEntry.level` optional; ReviewScreen requires a level before Confirm *(agent stopped before reporting; behaviour verified by hand 2026-10-08, test-first record not available)*
- [X] F05 [US1] `scripts/build-srd-spells.ts` captures save and area (Spirit Guardians); regenerate `data/srd-spells.json`; report other spells that gained data *(agent stopped before reporting; behaviour verified by hand 2026-10-08, test-first record not available)*
- [X] F06 [US2] Downed players are left out of target choices and the code-picked target unless temperament is feral or genius
- [X] F07 [US2] interpret: the out-of-range rule also covers the bonus action *(tested via the new `out-of-range-bonus` scenario and derived fixture)*
- [X] F08 [US2] interpret: ties within `TIE_EPSILON = 1e-9`
- [X] F09 [US2] interpret: innate spells of level ≥ 1 count for the one-leveled-spell rule
- [X] F10 [US2] `lib/jev/client.ts`: `TIMEOUT_MS = 20_000`
- [X] F11 Shared logger `lib/log.ts` (levels, `key=value` lines, never secrets); route `console.*` calls in `lib/jev/client.ts`, `app/api/decide/route.ts` and `components/SituationForm.tsx` through it
- [X] F12 `"use client"` at the top of `components/ui.tsx`
- [X] F13 `components/ReviewScreen.tsx`: replace `as` casts and `!` assertions with schema checks *(agent stopped before reporting; behaviour verified by hand 2026-10-08, test-first record not available)*
- [X] F14 Re-record the 6 `fixtures/jev/` scenarios (`npm run record:jev`; `out-of-range-bonus` added for F07), re-derive the 14 derived fixtures, update tests that named recorded picks
- [X] F15 Gates: `npm test`, `npm run typecheck`, `npm run check:monsters`
- [X] F16 Logging exempted from tests (constitution 1.1.1, CLAUDE.md "Test-first"): removed `tests/log.test.ts` and the log-line assertions in `tests/jev/client.test.ts` and `tests/api/decide.route.test.ts`, including the check that the API key never reaches a log line. `lib/log.ts` still drops context keys named like secrets

### Review fixes: open decisions (carry over to the next session)

Each item states the **current behaviour**, the **recommendation** and what a change would touch. The DM decides; then the item is built test-first like the ones above.

**Re-recording rule:** anything that changes the legal options, range lists or question text changes the Jev request. The guards in `tests/helpers/fixtures.test.ts` then fail for the affected scenarios, which must be re-recorded (`npm run record:jev`, live calls with the DM's key, so ask first) and their derived fixtures re-derived (same edits, request byte-identical to source).

**Unanswered questions (decide before T056):**

- [X] F17 **Clusters with a downed member.** *Decided 2026-10-09: downed players count toward a cluster like anyone else, no special rule. The code pick now ranks clusters with a member in reach by their whole size. Tested via the new `downed-in-cluster` scenario (recorded alone) and derived fixture `cluster-counts-downed`.* Was: the code-picked cluster (an area option with no `cluster__<i>` question) is ranked by how many members are in reach, so a downed player the monster may not target doesn't add to the count (`lib/decide/interpret.ts`). PLAN.md says downed players "still count toward clusters", and research R6 says the count is the whole cluster. **Recommendation: count the whole cluster**, since an area effect hits everyone in it. Code-pick only, so no re-record. No current scenario has a partly reachable cluster, so the test needs a derived fixture or a new scenario
- [X] F18 **DM override onto a downed player.** *Decided 2026-10-09: the target override lists every player, downed ones included, with no warning and no special rule. Built in T056.* Was: none yet; T056 builds the override controls. `LegalOptions.targetableIds` lists the players the temperament allows. **Recommendation: list every player in the target override, and show a warning when the DM picks one outside `targetableIds`** (Principle III, the DM has final say). Folds into T056

**Judgment calls the spec left open: recommend keeping as is (confirm or overrule):**

- [X] F19 *Kept 2026-10-09.* Interpret fallbacks: with no usable Jev answer, the cluster catching the most players and the lowest available slot level are picked (`PickSource { by: "code" }`)
- [X] F20 *Kept 2026-10-09 (replace outright; scaling and warn-only were considered).* A low `spend_resource` (< `SPEND_RESOURCE_LOW`) replaces a resource-spending pick outright with the best no-resource option, rather than "boosting" it by some amount
- [X] F21 *Kept 2026-10-09.* "The Attack action" (War Priest and similar) means a weapon attack or Multiattack, not a spell attack (5e rules)
- [X] F22 *Kept 2026-10-09.* The one-leveled-spell rule keeps the action on a tie; confidence comes from the final action's probability, after any replacement
- [X] F23 *Kept 2026-10-09, including the known fallback quirk: an unlimited no-target option such as Dodge can outrank a damage-free slot spell in range.* Target questions offer only players reachable this turn (`inRangeAfterMove`, or `targetableIds` for an unknown range). Candidate ranking (research R5) treats a no-target option as in range now and an unknown-range option as in range after moving
- [X] F24 *Kept 2026-10-09.* Morale words sent to Jev: < 20 cowardly, < 40 wary, ≤ 60 steady, ≤ 80 bold, above that fanatical
- [X] F25 *Kept 2026-10-09; whether the fastest speed ignores a fly speed when flying isn't possible moved to F29.* Legal-option defaults:
  - Ranged attacks count their long range.
  - Melee with no stated reach is 5 ft.
  - Multiattack uses its longest component range.
  - An area with no range or a range of self uses the area's size.
  - After-move reach uses the fastest speed mode.
  - A missing per-day or recharge entry counts as unavailable.
  - A blocked turn has no `none` bonus.
  - Clusters are a partition (each player in exactly one).
- [X] F26 *Kept 2026-10-09.* `apply` never changes HP (damage is a manual edit, US3). A timeout is retried once; a network error (`TypeError`) is not
- [X] F27 *Decided 2026-10-09: the other three kept; removing a player now asks first (`window.confirm` in `components/PartyRoster.tsx`).* Situation form:
  - New players start in "near".
  - ~~Removing a player has no confirm step.~~ Removing a player asks for confirmation, naming what is lost.
  - Every edit saves to the tracker as you type.
  - Ticking "allies present" sets the count to at least 1, and unticking sets it to 0.
- [X] F28 *Kept 2026-10-09; the scripts' `console` output is recorded as an exception in CLAUDE.md "Gotchas".* Runners-up are sorted by exact probability (the tie epsilon applies to picks only); `scripts/*.ts` print CLI output with `console`, not `lib/log.ts`

**Judgment calls: recommend changing:**

- [X] F29 *Done 2026-10-09: flying is now assumed possible (`blankSituation`), the form shows "Flying not possible", and the fly speed only counts toward movement when flying is possible. Scenarios keep an explicit `false`, so no re-record.* `flyUp` requires both a fly speed **and** `terrain.flyingPossible` (today only the fly speed gates it; a low ceiling should rule it out). `lib/monster/options.ts`. No current scenario monster flies, so the guards should stay green. *From F25: decide too whether the fly speed should stop counting toward after-move reach (the fastest speed) when `flyingPossible` is off.*
- [X] F30 *Done 2026-10-10: `reachOther` needs at least 2 `targetableIds` (downed players count only for feral or genius monsters), the incapacitated DM-picked list included. lone-melee re-recorded alone; its 4 derived fixtures re-derived with the same edits.* Offer `reachOther` only when there are at least 2 targetable players (today it's offered even with one). Changes `lone-melee`'s movement lists, so **re-record lone-melee** and re-derive its fixtures (`choice-not-argmax`, `retreat-high`, `confidence-buckets`, `unknown-answer-keys`)
- [X] F31 *Done 2026-10-11: left out of both range lists (now and after moving). An unknown range now carries `possibleTargetIds` (targetable players, minus total cover for a single-target option), which target questions and the code pick read instead of `targetableIds`. No scenario uses total cover, so no re-record.* A player behind total cover can't be the target of a single-target option (5e rules): leave them out of those options' range lists. Today total cover changes nothing. Area options still count them
- [X] F32 *Done 2026-10-11: ground modes are halved; the fly speed isn't (a flier passes over). No scenario uses difficult terrain, so no re-record.* Difficult terrain halves movement when working out `inRangeAfterMove` (today `terrain.difficult` is ignored)
- [X] F33 *Done 2026-10-11: `mismatchedZone(turn)` in `lib/encounter/state.ts` (zones split at 5 / 30 / 60 ft.); PlayerRow shows an amber hint under Zone and Exact ft. Hint only, no auto-fix. Not checked in a browser.* When a player's exact distance contradicts their zone (e.g. engaged at 40 ft.), the exact feet already win for range checks; add a visible hint on the PlayerRow so the DM can fix the zone

**Checkpoint**: US1 + US2 are the full MVP loop. Load a monster, get a recommendation, override it, apply it.

---

## Phase 5: User Story 3 - Track encounter state across rounds (Priority: P2)

**Goal**: Start turn (round and recharge rolls), manual state edits, recording turn results, history feeding the next request, persistence.

**Independent Test**: Spend a slot and a recharge ability, start the next turn: the slot stays spent, the recharge roll is shown and applied, the round advances, and the log shows the previous turn with its result.

### Tests for User Story 3 ⚠️

- [X] T059 [P] [US3] *(2026-10-12: 33 tests, all seen failing on the missing functions. Decided with the DM: `startTurn` also refills legendary actions in both modes, Legendary Resistance not; rolls are `{ abilityId, name, roll, min, recharged }` in ability order; `recordResult(t, i, undefined)` clears the result and an empty note is removed; a slot level or ability the monster lacks throws. The history check is already `tests/decide/questions.test.ts` "history", so it isn't repeated here)* Write `tests/encounter/state.turn.test.ts`: `startTurn(tracker, rng)` increments the round; in auto mode it rolls `1 + floor(rng()*6)` per spent recharge ability and marks it available when the roll ≥ `min`, returning `{ tracker, rolls }`; in manual mode it makes no rolls; `recordResult(tracker, i, result, note?)` sets the result; manual edits (`setHp`, `setSlots`, `setPerDay`, `setRecharge`, `setConditions`, `setConcentration`, `setLegendary`) clamp to [0, max]; `log.slice(-HISTORY_TURNS)` is what questions use

### Implementation for User Story 3

- [X] T060 [US3] *(2026-10-12; 34/34 pass. Added while building: leaving the note out of `recordResult` keeps the current one, with its test written after the code and then seen failing against a version that always replaced the note)* Implement `startTurn`, `recordResult` and the manual-edit reducers in `lib/encounter/state.ts`; pass T059
- [X] T061 [P] [US3] *(2026-10-13: controlled `tracker`/`onChange`, every edit through the state.ts reducers. Only resources the statblock gives are shown. The rolls stay up until the round or tracker changes. Not wired in or checked in a browser until T063)* Build `components/EncounterTracker.tsx`: HP current/max, slots per level, X/day uses, recharge available/spent toggles, legendary actions and Legendary Resistance counters, conditions, concentration, round; a "Start turn" button that calls `startTurn(tracker, Math.random)` and shows the rolls
- [X] T062 [P] [US3] *(2026-10-13: controlled `tracker`/`onChange` through `recordResult`. The result is a row of toggle chips, and pressing the picked one again clears it. The note saves as you type. Players removed from the roster show as "removed player". Not wired in or checked in a browser until T063)* Build `components/TurnLog.tsx`: entries newest first, showing action, target, move, slot and a recommended/overridden marker; a hit/miss/downed/effect result picker and an optional note per entry
- [X] T063 [US3] *(2026-10-16: EncounterTracker, titled with the monster's name, replaces the summary box in the monster column. TurnLog sits under the recommendation. A new round (Start turn) clears the shown recommendation and drops any answer still in flight. Both confirmations are Playwright tests in `e2e/encounter.spec.ts` (`npm run test:e2e`), both seen failing when saving and the warning were disabled)* Wire EncounterTracker and TurnLog into `app/page.tsx`; confirm the state survives a page reload and that a corrupt stored blob shows the storage warning and an empty app

**Checkpoint**: Multi-round play works with accurate resources and history.

---

## Phase 6: User Story 4 - Manage multiple monsters with trackers (Priority: P2)

**Goal**: Sidebar listing, switching, Duplicate and Delete.

**Independent Test**: Duplicate a damaged tracker with spent resources. The copy has the same statblock, roster and settings, full HP and resources, round 1, a blank situation, an empty log and a distinct name. Deleting a tracker after confirming removes it; cancelling keeps it.

### Tests for User Story 4 ⚠️

- [X] T064 [P] [US4] *(2026-10-17: 17 tests, 16 seen failing on the missing `duplicate`; the one that passes checks the mid-fight source fixture. Decided: the situation resets to `syncSituation(blankSituation(), roster)`, one default row per kept player; the name is the lowest free `"<base> n"` with n ≥ 2, matched case-sensitively, and only a trailing space-and-digits is stripped for the base)* Write `tests/encounter/state.duplicate.test.ts`: `duplicate(tracker, existingNames, id, now)` keeps `reviewed`, `roster` and `settings`, and resets state, log and situation; names it `"<base> 2"`, `"<base> 3"`, … avoiding names in `existingNames` (base strips a trailing number)

### Implementation for User Story 4

- [X] T065 [US4] *(2026-10-17; 17/17 pass, 573/573 in the suite)* Implement `duplicate` in `lib/encounter/state.ts`; pass T064
- [X] T066 [US4] *(2026-10-18: below `xl` the sidebar is a drawer opened by a header "Trackers" button, closed by Escape, the backdrop, ✕ or any action in it; from `xl` up it's a column. Delete asks with `window.confirm`, as PartyRoster does. Duplicate selects the copy. Checked by `e2e/trackers.spec.ts`, 4 tests seen failing on the missing sidebar first; `loadMonster`/`stored` moved to `e2e/helpers.ts`)* Build `components/TrackerSidebar.tsx`: lists trackers (name, HP, round), selects, adds a new monster (opens MonsterLoader), and offers Duplicate and Delete (with confirm); collapses to a drawer on tablet width; wire it in `app/page.tsx`

**Checkpoint**: Several monsters can be run side by side.

---

## Phase 7: User Story 5 - Tune behaviour and see reminders (Priority: P3)

**Goal**: Temperament, morale and recharge-mode settings, plus reminder cards for legendary actions, reactions and lair actions.

**Independent Test**: An INT 2 monster suggests "mindless". A legendary monster shows reminder cards for legendary actions left and their options, reactions and lair actions, and none of them is decided.

### Tests for User Story 5 ⚠️

- [X] T067 [P] [US5] *(2026-10-18: 9 tests; the file fails to load on the missing `lib/encounter/reminders` module, so none ran on their own yet. Card shape in data-model.md "Reminders": legendary → reactions → lair, empty cards left out, the legendary card kept at 0 left, reactions = source `Reactions` or category `reaction` once each, text verbatim. The temperament/morale part was already covered by `tests/decide/questions.test.ts` "includes temperament and morale…", so that file wasn't extended)* Write `tests/encounter/reminders.test.ts`: `buildReminders(tracker)` returns legendary actions left with options from `LegendaryActions.Options`, reactions from `Reactions` and reaction-category abilities, and lair actions flagged "initiative 20"; it returns an empty list for a general monster with no reactions; settings temperament and morale appear in the Jev state built by `buildJevRequest` (extend `tests/decide/questions.test.ts`)

### Implementation for User Story 5

- [X] T068 [US5] *(2026-10-18; 9/9 pass, 582/582 in the suite. The reminder types are plain TS in `reminders.ts`, not zod, since they're never parsed)* Implement `buildReminders` in `lib/encounter/reminders.ts`; pass T067
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
- [ ] T076 "Ensure all generated user interfaces, components, and text styles strictly comply with WCAG 2.2 (fallback to 2.1 if needed) Level AA contrast standards (specifically SC 1.4.3 and SC 1.4.11), maintaining a minimum 4.5:1 ratio for normal text and 3:1 for UI elements."


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
