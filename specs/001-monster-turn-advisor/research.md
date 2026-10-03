# Phase 0 Research: Monster Turn Advisor (v1)

Most decisions are already fixed by [docs/PLAN.md](../../docs/PLAN.md) and the constitution. This file
records the ones the plan left open or that depend on the local environment.

## R1. Next.js version vs. local Node

- **Decision**: Next.js 15.x (App Router) with React 19.
- **Rationale**: The DM's machine runs Node 20.8.1. Next.js 16 requires Node ≥ 20.9; Next 15 requires
  ≥ 18.18. Pinning 15 means `npm run dev` works without asking the DM to upgrade Node.
- **Alternatives**: Next 16 (needs a Node upgrade first, fine later); Vite + React with a separate API
  (the plan's documented fallback, rejected because v1 has one route and one client).

## R2. zod version

- **Decision**: `zod@^3.25` imported from `"zod"` (v3 API).
- **Rationale**: Schemas are copied from DandDTemplateParserTypeScript, which pins `zod@^3.25.76`.
  Staying on the v3 API keeps the copy verbatim, including `.transform()` on ability scores.
  `Modifier` becomes optional per the plan.
- **Alternatives**: zod 4 (`z.record` and error-map changes would make the copied schemas drift).

## R3. Styling

- **Decision**: Tailwind CSS v4 with `@tailwindcss/postcss`, hand-rolled components, no component library.
- **Rationale**: Plan mandates Tailwind and hand-rolled components; v4 is the current line and works on Node 20.
- **Alternatives**: Tailwind v3 (older config model, no benefit here).

## R4. Where legal options are computed

- **Decision**: `lib/monster/options.ts` is pure and runs in **both** places: the client computes options
  for display, override and the manual fallback; the server **recomputes** them from the submitted
  tracker snapshot before building questions.
- **Rationale**: Principle I says code decides legality and Jev never introduces an option. Recomputing
  on the server means the request can't smuggle in options; computing on the client means a Jev outage
  never blocks a turn (Principle III). Same pure function, so no drift.
- **Alternatives**: client-only (server would trust client options); server-only (manual fallback
  would need a second endpoint).

## R5. Choosing "top candidates" before the request

- **Decision**: Deterministic ranking in `lib/decide/questions.ts`: in-range-now > in-range-after-move >
  out-of-range; then limited resources last (unless no unlimited option exists); then by average damage
  from extracted dice. Take the top 4 single-target and top 3 area options. Ties break by statblock order.
- **Rationale**: Jev answers all questions in parallel, so target/cluster/slot questions must be asked for
  candidates chosen before the answer. A transparent heuristic is testable; the plan says 3–4.
- **Alternatives**: two Jev calls (violates one-request-per-turn); asking target for every option (wasteful
  and can exceed sensible question counts).
- **Consequence**: if the chosen action isn't a candidate, `interpret.ts` picks its target with a
  deterministic fallback (lowest apparent HP in range) and marks the target "code pick" in the explanation.

## R6. Clusters

- **Decision**: A cluster is a connected group in the "clustered with" relation (union-find over player
  rows), plus each player alone. For an area option, the number caught is the cluster size; cone/line/sphere
  geometry is not modelled (no grid in v1).
- **Rationale**: The plan has no map; the DM's "clustered with" is the only spatial input.

## R7. Randomness for recharge rolls

- **Decision**: `startTurn(state, rng)` takes an injected `rng: () => number`; the UI passes `Math.random`,
  tests pass a seeded/fixed sequence.
- **Rationale**: Keeps `lib/encounter` pure and testable (Principle V).

## R8. Persistence format

- **Decision**: One `localStorage` key `mja.v1.trackers` holding `{ version: 1, trackers: Tracker[],
  selectedId }`, validated with zod on read. Read/parse/validate failures return the empty default and
  keep the bad blob under `mja.v1.trackers.corrupt` so the DM's data isn't silently destroyed.
  Writes are try/catch-wrapped and surface a non-blocking warning on quota errors.
- **Rationale**: Principle VI; a version field allows future migration.

## R9. SRD spell table

- **Decision**: Generate `data/srd-spells.json` once from the SRD 5.1 spell list (CC BY 4.0) via a small
  committed script, storing only: name, level, casting time (action / bonus action / reaction), range,
  area, save ability or attack type, damage/effect summary, concentration. Include the CC BY attribution
  in `data/README.md`.
- **Rationale**: Only fields the options/questions need; licence-clean source.
- **Alternatives**: hand-typing (error-prone); full SRD dump (unneeded size).

## R10. Jev client retry policy

- **Decision**: Bearer auth, `AbortSignal.timeout(30_000)`, one retry on 408/429/5xx/529 after a short
  delay (honour `Retry-After` up to 5 s), mirroring `api.py`. The prototype's `server.ts` proxy has the
  timeout but no retry; we add it.
- **Rationale**: Constitution Technical Constraints.

## R11. Logging usage and latency

- **Decision**: The route logs one line per call: `jev model=<m> latencyMs=<n> usage=<json> questions=<count>`
  via `console.info` on the server. Never logs state, headers or the key. Usage and latency are also
  returned to the client for display in a debug footer.
- **Rationale**: Plan Verification §3 and constitution Observability.

## R12. Testing approach

- **Decision**: Vitest with node environment for `lib/**`, plus one route test for `app/api/decide/route.ts`
  with `callJev` mocked (counts requests: one when the monster can act, none when hard-blocked).
  Recorded Jev answers live in `fixtures/jev/<scenario>.json`, captured once by `scripts/record-jev.ts`
  (`tsx --env-file=.env.local`, Node ≥ 20.6). Rules that the five scenarios don't trigger naturally are
  covered by `fixtures/jev/derived/<rule>.json`: copies of a recorded response with probabilities edited
  and a `derivedFrom` field (constitution v1.0.1, Principle V). No component tests in v1; UI is covered
  by the plan's manual scenarios.
- **Rationale**: Principle V targets the pure core; the plan lists UI checks as manual. A separate
  script keeps recording code out of the production route.
- **Consequence**: derived fixtures need a recorded response to copy, so the interpret tests wait for one
  recording run with the DM's key.

## R13. Running TypeScript scripts

- **Decision**: `tsx` as a dev dependency, used by `check:monsters`, `build:spells` and `record:jev`.
- **Rationale**: These three scripts import the same pure TypeScript modules as the app. `tsx` runs them
  directly with no build step or extra tsconfig, and it passes Node flags like `--env-file`.
- **Alternatives**: compiling the scripts with `tsc` first (an extra build output to manage); `ts-node`
  (slower, with ESM friction).

## No outstanding NEEDS CLARIFICATION.
