# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- `docs/PLAN.md` is the design source of truth. Read the relevant section before building anything.
  "The plan" means this file. Edit it directly when asked to add to the plan.
- `.specify/memory/constitution.md` is binding. Spec-kit plans must pass its Constitution Check.

## Commands

```bash
npm run dev
npm test                                  # Vitest
npx vitest run -t "<test name>"           # single test
npm run test:e2e                          # Playwright, e2e/ (starts its own dev server on :3100)
npm run check:monsters [-- --fix]         # fixtures must report zero changes
```

## Test-first (always)

Applies to every change in `lib/`: tasks, bug fixes, and helpers you add along the way.

1. Write or extend the Vitest test before touching the implementation.
2. Run just that test (`npx vitest run <file>`) and confirm it fails on the missing
   behaviour, not on a typo.
3. Only then write the code, until it passes.
4. In your report, name the tests you saw fail first. If you skipped the failing run
   for anything, say so.

Don't write the test and the implementation in the same step. If extra code turns out
to be needed mid-task, stop and write its test first.

**Exempt: logging.** Don't write tests for log calls, log-line formats or `lib/log.ts`, first or
otherwise. Tests may silence `console` output, but never assert on it.

## Gotchas

- **Jev is not an LLM chat model.** It only answers typed `choice`/`noul`/`score` questions. Never
  ask it to generate text or invent options. Code builds the legal options, Jev picks, and each
  turn makes at most one batched request (none when the monster is hard-blocked).
- Read Jev's `probabilities` distribution, not its `choice` field, which isn't always the argmax.
- `TYPESAFE_API_KEY` is read only in `app/api/decide/route.ts` and `lib/jev/`, never in client code.
- The monster normalizer must never invent mechanics (actions, resistances, Legendary Resistance).
  Every fix is recorded and revertible, and unknown keys are kept and flagged.
- General monsters have no `BonusActions` field. Their bonus actions are in trait text.
- Keep `lib/monster`, `lib/encounter` and `lib/decide` free of React, `fetch` and `localStorage`.
  Wrap every `localStorage` access in try/catch.
- Interpret tests use recorded responses in `fixtures/jev/` (or derived copies with a `derivedFrom`
  field), never live Jev calls.
- Fixture names follow `<Name>.CR<n>.<edition>.json`. The normalizer reads CR from the name.
- Don't build anything PLAN.md marks out of scope without updating the plan first.
- **Exception to the shared logger:** CLI scripts in `scripts/` print their report with `console`, not
  `lib/log.ts`. That output is the script's result for a person to read, not app logging. It must still
  never include secrets. App code (`lib/`, `app/`, `components/`) always logs through `lib/log.ts`.

## External references

- Jev client and wire types: `F:\Projects\AI\typesafe-assist\smart-assistant\prototype\`
- Monster zod schemas: `F:\Projects\AI\DandDTemplateParserTypeScript\src\routes\monsters.ts`
