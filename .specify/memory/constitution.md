<!--
Sync Impact Report (1.1.1, 2026-10-08)
- Version change: 1.1.0 → 1.1.1 (PATCH: clarification, no principle redefined)
- Principle V: logging is exempt from the test-first rule and from tests generally. Log calls,
  line formats and lib/log.ts are not tested; tests may silence console output but don't assert on it.
- Propagated to: CLAUDE.md ("Test-first (always)"). Logging tests removed (tests/log.test.ts and the
  log-line assertions in tests/jev/client.test.ts and tests/api/decide.route.test.ts).
- Templates: none affected.

Sync Impact Report (1.1.0, 2026-10-03)
- Version change: 1.0.1 → 1.1.0 (MINOR: materially expanded guidance in Principle V)
- Principle V: tests for core logic are now written first and seen to fail before the
  implementation, for every change to lib/monster, lib/encounter and lib/decide (tasks,
  bug fixes and helpers added along the way). Reports name the tests seen failing first.
- Propagated to: CLAUDE.md ("Test-first (always)").
- Templates: ⚠ pending. .specify/templates/tasks-template.md still says tests are required
  for lib/ logic; update its test note to "written first and seen to fail" when next touched.

Sync Impact Report (1.0.1, 2026-10-03)
- Version change: 1.0.0 → 1.0.1 (PATCH: clarifications, no principle redefined)
- Principle I: "exactly one batched Jev request" → "at most one; none when the monster is hard-blocked"
  (a turn where code has already ruled out every action has nothing for Jev to pick).
- Principle V: recorded fixtures may include derived copies (a recorded response with probabilities
  edited and a `derivedFrom` note) so every consistency rule can be exercised without live calls.
- Templates: no changes needed (plan/spec/tasks templates do not restate these rules).
- Propagated to: CLAUDE.md (Gotchas), docs/PLAN.md (Legal options, Verification),
  specs/001-monster-turn-advisor (spec, plan, contracts, tasks).

Sync Impact Report (1.0.0)
- Version change: (unratified template) → 1.0.0
- Principles defined (all new, replacing template placeholders):
  I. Code Decides Legality, Jev Only Picks
  II. Rules Consistency Lives in Code
  III. The DM Has the Final Say
  IV. Never Invent Mechanics
  V. Tested Pure Core
  VI. Local, Simple, Secret-Safe
- Added sections: Technical Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none
- Templates:
  ✅ .specify/templates/plan-template.md — generic "Constitution Check" gate; no change needed
  ✅ .specify/templates/spec-template.md — no mandatory-section changes needed
  ✅ .specify/templates/tasks-template.md — test note updated: tests are required for lib/ logic
     (Principle V)
  ✅ .specify/templates/agent-file-template.md — generic; no change needed
  ⚠ .specify/templates/commands/ — directory not present; nothing to check
  ✅ README.md — no principle references; no change needed
- Deferred TODOs: none
-->

# MonsterJevActionalizer Constitution

## Core Principles

### I. Code Decides Legality, Jev Only Picks

Jev (TypeSafe System One) does not generate text; it answers typed `choice`, `noul` and `score`
questions. Therefore:

- Code MUST compute the legal options for a turn deterministically (availability, resources,
  hard-blocking conditions, range) before asking Jev anything.
- Jev MUST only be asked to choose among options code has already produced. Jev output MUST
  never introduce an option, target or value that code did not offer.
- Each turn MUST make at most one batched Jev request, and none when the monster is hard-blocked
  (no legal action or bonus action). Never more than one question set per turn.
- Explanations MUST be templates filled with Jev's probabilities, not generated prose.
- No second LLM is added in v1. Adding one requires a constitution amendment.

**Rationale:** Jev's strengths are calibrated choices. Keeping legality in code makes
recommendations explainable, testable and always rules-legal.

### II. Rules Consistency Lives in Code

Jev judges each question independently, so cross-question consistency is code's job.

- Interpretation MUST read the full `probabilities` distributions, not only the `choice` field.
- Consistency rules (one leveled spell per turn, range vs. movement, bonus actions that depend on
  the Attack action, retreat thresholds, concentration, resource spending) MUST be enforced in
  `interpret.ts` after Jev answers.
- Confidence buckets and thresholds MUST be named constants, not inline literals.

**Rationale:** independent answers can contradict each other. A single deterministic layer that
reconciles them is the only place those rules can be tested.

### III. The DM Has the Final Say

- Every part of a recommendation (movement, action, target, cluster, slot, bonus action) MUST be
  overridable with any legal option.
- Apply MUST record and spend what the DM *actually* chose, never the original recommendation.
- If the Jev call fails, the app MUST show the error, keep the legal options, and let the DM pick
  and apply by hand. A Jev outage MUST never block a turn.
- Low confidence MUST surface the alternatives, not hide them.

**Rationale:** the app is an assistant at the table. The DM runs the game, and the tool has to
keep working when the model doesn't.

### IV. Never Invent Mechanics

- The normalizer and extractor MUST NOT add mechanics that are not in the source statblock: no
  invented actions, resistances, immunities or Legendary Resistance.
- Every automatic fix MUST be recorded as a human-readable change the DM can accept or revert.
- Unknown keys MUST be kept and flagged, never silently dropped.
- Anything the extractor cannot parse MUST stay available as raw text, and unknown spells MUST be
  marked unknown rather than guessed.
- A monster MUST pass zod validation and the DM review screen before it can be tracked.

**Rationale:** a wrong statblock produces confidently wrong recommendations. Visible, reversible
fixes keep the DM in control of their own content.

### V. Tested Pure Core

- Decision logic (`lib/monster`, `lib/encounter`, `lib/decide`) MUST be pure and free of React,
  `fetch` and `localStorage`, so it can be unit-tested directly.
- Each such module MUST ship with Vitest tests covering the cases listed in the plan's
  Verification section.
- Tests MUST be written first: for every change to these modules (planned tasks, bug fixes,
  and helpers added along the way), the test is written or extended and run, and seen to
  fail on the missing behaviour, before the implementation is written. Reports MUST name the
  tests seen failing first and state any change where that step was skipped.
- Logging is exempt: log calls, log-line formats and the shared logger (`lib/log.ts`) are not
  tested, first or otherwise. Tests MAY silence console output but MUST NOT assert on it.
- Interpretation tests MUST use recorded Jev responses from `fixtures/jev/`,
  not live calls. A derived fixture (a copy of a recorded response with probabilities edited and a
  `derivedFrom` field naming its source) counts as recorded.
- Every file in `fixtures/monsters/` MUST pass strict zod validation with zero normalizer changes.
  Normalizing an already-valid monster MUST produce zero changes.
- A bug fix in core logic MUST add a test that would have caught it.

**Rationale:** the risky parts are parsing and rules logic, not the UI. Testing them against real
fixtures is the cheapest way to keep recommendations trustworthy.

### VI. Local, Simple, Secret-Safe

- v1 runs locally (`npm run dev`) with no auth, deployment or database. State lives in
  `localStorage`, and every read and write MUST be wrapped in try/catch with a working empty
  default.
- `TYPESAFE_API_KEY` MUST only be read in server code (`app/api/decide/route.ts` and `lib/jev/`).
  It MUST never reach the browser bundle, logs or commits. `.env.local` stays gitignored.
- Features listed as out of scope in `docs/PLAN.md` MUST NOT be built without first updating the
  plan. New dependencies, layers or abstractions MUST be justified by a current need (YAGNI).
- The layout MUST remain usable on a tablet.

**Rationale:** one DM, one laptop. Extra infrastructure adds cost without value, and the API key
is the only real secret.

## Technical Constraints

- **Stack:** Next.js (App Router), TypeScript in strict mode, npm, Tailwind with hand-rolled
  components, zod for all external data (monster JSON, Jev responses), Vitest for tests.
- **Shared types:** UI and server share TypeScript types and zod schemas directly. Types for
  external data MUST be inferred from zod schemas, not written separately.
- **Jev client:** Bearer auth, 30 s timeout, one retry on 408/429/5xx/529. Wire types stay aligned
  with the reference prototype in `F:\Projects\AI\typesafe-assist\smart-assistant\prototype\`.
- **Limits:** choice questions MUST respect `MAX_CHOICE_OPTIONS` (255).
- **Monster format:** the DandDTemplateParser general and legendary templates
  (`fixtures/templates/`), supporting both 2014 and 2024 statblock wording.
- **Environment:** `TYPESAFE_API_KEY` (required), `TYPESAFE_BASE_URL` (default
  `https://api.typesafe.ai`), `JEV_MODEL` (default `jev-latest`). `.env.example` is committed.
- **Observability:** token usage and latency of each Jev response MUST be logged on the server.

## Development Workflow & Quality Gates

- `docs/PLAN.md` is the product and design source of truth. Feature specs and plans MUST stay
  consistent with it. When they diverge, update the plan in the same change.
- Work follows the spec-kit flow: specify → (clarify) → plan → tasks → implement. Each plan's
  Constitution Check MUST confirm Principles I–VI or record a justified exception under
  Complexity Tracking.
- Before work is called done:
  1. `npm test` passes.
  2. Type checking passes with no errors.
  3. `npm run check:monsters` reports zero changes.
  4. For UI or decision-flow changes, the relevant manual scenarios from the plan's
     Verification section have been run in `npm run dev`.
- Results are reported faithfully: failing tests or skipped checks are stated, not hidden.

## Governance

- This constitution supersedes other practices in this repository. Where `docs/PLAN.md` and this
  document conflict on a principle, this document wins until it is amended.
- **Amendments:** propose the change, update this file with a new Sync Impact Report, propagate
  it to the affected `.specify/templates/` files, and note any change to `docs/PLAN.md`.
- **Versioning:** semantic versioning. MAJOR for removing or redefining a principle, MINOR for a
  new principle or section or materially expanded guidance, PATCH for clarifications and wording.
- **Compliance:** every plan's Constitution Check and every code review MUST verify compliance.
  Unjustified complexity is grounds to reject a change.

**Version**: 1.1.1 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-10-08
