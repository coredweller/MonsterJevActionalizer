# Contract: Jev question set (one batched request per turn)

Wire types: `lib/jev/types.ts`, copied from `prototype/src/types.ts` lines 10–76.

## State object

```ts
{
  monster: { name, kind, hp: { current, max }, ac, speed, abilities: AbilitySummary[], rawUnparsed: string[] },
  encounter: EncounterState,
  temperament, morale,                    // morale described in words + 0–100
  situation: Situation,                   // players referenced by index, e.g. "player 2: Bree (caster)"
  options: { actions, bonusActions, movements },   // each with range flags
  clusters: { id, players: string[], size }[],
  history: TurnLogEntry[]                 // last 3
}
```

## Questions

| Key | Type | Criteria keys |
|---|---|---|
| `tactic` | choice | `aggressive`, `focus_weakest`, `focus_threat`, `control`, `defensive`, `flee` |
| `move_before` | choice | legal movement keys |
| `action` | choice | legal action keys; criterion = one-line summary (to-hit/DC, damage, range, area, "out of range" flag) |
| `bonus_action` | choice | legal bonus-action keys + `none` |
| `move_after` | choice | legal movement keys |
| `target__<i>` | choice | player keys `player__<j>`, for candidate single-target option `i` (top 4) |
| `cluster__<i>` | choice | cluster keys `cluster__<k>` (criterion shows count caught), for candidate area option `i` (top 3) |
| `slot_level__<i>` | choice | `level__<n>` for available levels ≥ base, per candidate leveled spell |
| `multiattack_fallback` | noul | only if a Multiattack option is legal |
| `should_retreat` | noul | always |
| `spend_resource` | noul | only if some legal option uses a limited resource |

Rules:
- Every choice question has ≤ `MAX_CHOICE_OPTIONS` (255) criteria and ≥ 2 keys; a question with fewer than
  2 legal keys is not asked and its single value is used directly.
- `<i>` indexes into a per-request candidate table returned alongside the request so interpret can map back.
- Interpretation reads `probabilities`, never `choice` alone. Answers whose keys aren't in the asked
  criteria are discarded (treated as missing → fall back to code ranking).
