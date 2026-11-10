# MonsterJevActionalizer

Dungeons and Dragons (D&amp;D) Monster decision maker given certain parameters and fed to Jev.

Upload a monster stat block, track an encounter, and get a recommended turn for the monster. The app
builds the legal options, Jev picks among them, and you apply or override the result. The design lives
in [docs/PLAN.md](docs/PLAN.md).

## Setup

Requires Node 24+ (see `engines` in `package.json`) and a TypeSafe API key.

```bash
npm install
cp .env.example .env.local      # then set TYPESAFE_API_KEY=...
npm run dev                     # http://localhost:3000
```

`.env.local` is git-ignored. Optional variables:

| Variable            | Default                   |
| ------------------- | ------------------------- |
| `TYPESAFE_BASE_URL` | `https://api.typesafe.ai` |
| `JEV_MODEL`         | `jev-latest`              |

The key is read only on the server (`lib/jev/`). Restart `npm run dev` after changing `.env.local`.

## Checks

Run these before calling work done:

```bash
npm test                        # Vitest unit tests (recorded Jev responses, no live calls)
npm run typecheck               # tsc --noEmit
npm run check:monsters          # every fixture must report OK, zero changes
npm run test:e2e                # Playwright; starts its own dev server on :3100
```

`npm run test:e2e` needs Playwright's browsers the first time: `npx playwright install`.

To normalize monster fixtures in place, use `npm run check:monsters -- --fix`.

## Manual validation

See [quickstart.md](specs/001-monster-turn-advisor/quickstart.md) for the step-by-step manual
validation: broken uploads, monster review, and the encounter scenarios.
