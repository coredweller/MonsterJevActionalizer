# Quickstart: Monster Turn Advisor (v1)

## Prerequisites

- Node 20.8+ (Next.js 15; Next 16 would need Node ≥ 20.9), npm 10.
- A TypeSafe API key.

## Setup

```bash
npm install
cp .env.example .env.local      # then set TYPESAFE_API_KEY=...
# optional: TYPESAFE_BASE_URL (default https://api.typesafe.ai), JEV_MODEL (default jev-latest)
npm run dev                      # http://localhost:3000
```

## Checks before calling work done

```bash
npm test                         # Vitest: lib/monster, lib/encounter, lib/decide
npx tsc --noEmit                 # type check
npm run check:monsters           # every fixture: OK, zero changes
```

## Manual validation (from PLAN.md → Verification §2)

1. **Broken upload**: upload a copy of a fixture with `"Equipment": {}`, `"Level": "5"`, a
   `"Legendary Actions"` key and `"Weapon"` instead of `"Weapons"`. Expect four listed changes; revert
   one and see its error inline; continue is blocked until valid; download returns fixed JSON.
2. **Review**: load `fixtures/monsters/TieflingEnforcer.CR6.2014.json`; every ability shows category,
   uses, attack/save, range, damage; unknown spells are flagged.
3. Create a tracker, add a 4-player roster, then play:
   - **Lone melee**: one player engaged, others far → sensible melee pick on that player.
   - **Spread party**: a downed caster, two players clustered → area option picks the 2-player cluster.
   - **Low HP + cowardly + escape route** → Disengage/Dash with retreat movement.
   - **Concentrating caster** casting a leveled concentration spell → warning names the dropped spell; slot level shown.
4. In each: override one part, Apply, check spent resources and the log entry, record a result, start the
   next turn and confirm the situation carried over and the log feeds the request.
5. Stop network / blank the key: request → error shown, options still listed, manual Apply works.
6. Server console shows one `jev …latencyMs=… usage=…` line per recommended turn, and none when the
   monster is stunned (hard-blocked). Time one turn from Start turn to Apply: under 60 s (SC-001).
7. Resize to tablet width (~768 px): layout stays usable.
