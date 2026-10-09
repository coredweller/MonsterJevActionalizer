# Implementation Plan: Monster Turn Advisor (v1)

**Branch**: `001-monster-turn-advisor` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-monster-turn-advisor/spec.md`; design source of truth
[docs/PLAN.md](../../docs/PLAN.md).

## Summary

A local web app that helps a DM run one 5e monster's turn. The DM loads a statblock (normalized,
validated and reviewed), tracks encounter state per monster, describes the battlefield each turn, and
gets a recommended movement, Action, Bonus Action and target(s). Code computes every legal option
deterministically; Jev (TypeSafe System One) only picks among them in one batched request per turn;
code then enforces rules consistency and fills a template explanation. The DM can override anything,
and Apply spends what was actually chosen.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode; Node 20.8 (local)
**Primary Dependencies**: Next.js 15 (App Router) + React 19, Tailwind CSS v4, zod ^3.25 (v3 API)
**Storage**: browser `localStorage` (single versioned key); no database
**Testing**: Vitest (node environment) for `lib/**`; recorded Jev responses in `fixtures/jev/`
**Target Platform**: local dev server (`npm run dev`) on the DM's laptop; desktop and tablet browsers
**Project Type**: web application — single Next.js project (UI + one server route)
**Performance Goals**: at most one Jev request per turn; turn-to-apply under 60 s for the DM (SC-001,
checked by hand in the quickstart run)
**Constraints**: API key server-only; `lib/monster|encounter|decide` pure (no React, `fetch`, `localStorage`);
choice questions ≤ 255 options; Jev timeout 20 s per attempt with one retry (worst case ≈ 45 s); tablet-usable layout
**Scale/Scope**: one DM; a handful of trackers per fight; ~11 components; fixtures of ~10 monsters

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Checked against constitution v1.0.1.

| Principle | How the design complies | Status |
|---|---|---|
| I. Code decides legality, Jev only picks | `options.ts` computes legal options; server recomputes them (research R4); questions built only from those keys; answers with unknown keys are discarded; at most one request per turn, none when hard-blocked (v1.0.1 wording), verified by a route test; template explanations; no second LLM. | ✅ |
| II. Rules consistency in code | `interpret.ts` reads `probabilities`, applies all six consistency rules from PLAN.md; thresholds are named constants (data-model.md). | ✅ |
| III. DM has final say | Every recommendation part overridable from client-side `LegalOptions`; Apply takes the DM's choice; Jev failure → error + manual pick (decide-api.md); low confidence shows runners-up. | ✅ |
| IV. Never invent mechanics | Normalizer change kinds are a closed list of fills/coercions/renames/derivations; each recorded and revertible; unknown keys flagged; unparsed text kept raw; unknown spells marked; tracker requires validated + reviewed monster. | ✅ |
| V. Tested pure core | Pure `lib/` modules with Vitest tests per PLAN Verification; recorded Jev fixtures plus derived copies (`derivedFrom`) for each consistency rule; injected RNG; `check:monsters` zero-change gate. | ✅ |
| VI. Local, simple, secret-safe | Local only, `localStorage` behind try/catch with empty default; key read only in `app/api/decide/route.ts` and `lib/jev/`; out-of-scope items excluded; tablet layout. | ✅ (see Complexity Tracking for the storage-file placement) |

**Post-design re-check (after Phase 1)**: still passes. The design adds no dependencies beyond the PLAN
stack, no extra server routes and no database.

## Project Structure

### Documentation (this feature)

```text
specs/001-monster-turn-advisor/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── decide-api.md     # POST /api/decide
│   ├── jev-questions.md  # state + question set sent to Jev
│   └── cli-and-storage.md# check:monsters CLI, localStorage format
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
app/
  layout.tsx, globals.css
  page.tsx                  # tracker sidebar | monster + tracker | situation form | recommendation
  useTrackers.ts            # the only localStorage access (try/catch, empty default)
  api/decide/route.ts       # validate → options → questions → Jev → interpret → Recommendation
lib/
  jev/      types.ts  client.ts
  monster/  schema.ts  types.ts  normalize.ts  extract.ts  spells.ts  options.ts
  encounter/types.ts  state.ts  storage.ts  reminders.ts   # storage.ts = pure serialize/parse only
  decide/   constants.ts  clusters.ts  questions.ts  interpret.ts  explain.ts
components/ TrackerSidebar MonsterLoader FixScreen ReviewScreen EncounterTracker PartyRoster
            SituationForm PlayerRow RecommendationCard ReminderCards TurnLog
data/       srd-spells.json  README.md (CC BY 4.0 attribution)
scripts/    check-monsters.ts  build-srd-spells.ts  record-jev.ts
fixtures/   monsters/  templates/
            jev/  scenarios.ts  <scenario>.json (recorded)  derived/<rule>.json (edited copies, `derivedFrom`)
tests/      mirrors lib/ (e.g. tests/monster/normalize.test.ts), plus tests/api/decide.route.test.ts
.env.example
```

**Structure Decision**: Single Next.js project, matching PLAN.md "Structure". Tests live in `tests/`
mirroring `lib/` so `lib/` stays production-only. `lib/decide/constants.ts` added to hold thresholds as
named constants (Principle II).

## Implementation Order (for /speckit.tasks)

1. Scaffold: Next 15, Tailwind v4, Vitest, tsconfig strict, `.env.example`, npm scripts.
2. `lib/monster/schema.ts` + `normalize.ts` + tests + `check:monsters` (US1 foundation; fixtures gate).
3. `extract.ts` + `spells.ts` + SRD table + tests against fixtures. US2 depends on these.
4. `lib/encounter/state.ts` + `storage.ts` + tests (US3/US4).
5. `options.ts` + tests (hard blocks, resources, range, fly).
6. `lib/jev` client; `questions.ts`; record `fixtures/jev/` for the five scenarios (needs the key in
   `.env.local`); derive one edited fixture per consistency rule; `interpret.ts` + `explain.ts` + tests.
7. `app/api/decide/route.ts`.
8. UI: loader → fix → review → tracker → situation → recommendation/apply → log → reminders; tablet pass.
9. Manual validation per quickstart.md.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `lib/encounter/storage.ts` is pure; `localStorage` calls live in `app/useTrackers.ts` | PLAN.md lists `storage.ts` as "localStorage persistence", but CLAUDE.md and Principle V forbid `localStorage` in `lib/encounter`. | Putting `localStorage` in `lib/` breaks the pure-core rule. PLAN.md's Structure line has been updated to match. |
| `SPEND_RESOURCE_LOW = 0.40` | PLAN.md says "if `spend_resource` is low" without a number; Principle II needs a named constant. | Leaving it implicit. Value is an assumption to tune against recorded fixtures. |
