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
npm run check:monsters [-- --fix]         # fixtures must report zero changes
```

## Gotchas

- **Jev is not an LLM chat model.** It only answers typed `choice`/`noul`/`score` questions. Never
  ask it to generate text or invent options. Code builds the legal options, Jev picks, and each
  turn makes exactly one batched request.
- Read Jev's `probabilities` distribution, not its `choice` field, which isn't always the argmax.
- `TYPESAFE_API_KEY` is read only in `app/api/decide/route.ts` and `lib/jev/`, never in client code.
- The monster normalizer must never invent mechanics (actions, resistances, Legendary Resistance).
  Every fix is recorded and revertible, and unknown keys are kept and flagged.
- General monsters have no `BonusActions` field. Their bonus actions are in trait text.
- Keep `lib/monster`, `lib/encounter` and `lib/decide` free of React, `fetch` and `localStorage`.
  Wrap every `localStorage` access in try/catch.
- Interpret tests use recorded responses in `fixtures/jev/`, never live Jev calls.
- Fixture names follow `<Name>.CR<n>.<edition>.json`. The normalizer reads CR from the name.
- Don't build anything PLAN.md marks out of scope without updating the plan first.

## External references

- Jev client and wire types: `F:\Projects\AI\typesafe-assist\smart-assistant\prototype\`
- Monster zod schemas: `F:\Projects\AI\DandDTemplateParserTypeScript\src\routes\monsters.ts`
