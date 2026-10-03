# Data Model: Monster Turn Advisor (v1)

All types for external data are inferred from zod schemas (constitution, Technical Constraints).
Names below are the TypeScript type names; files are given in brackets.

## Monster input [`lib/monster/schema.ts`]

Copied from `DandDTemplateParserTypeScript/src/routes/monsters.ts` (zod v3), with `Modifier` optional.

- **GeneralMonster**: `CharacterName` (non-empty), `Level` int, `Race`, `Class`, `Alignment`, `HP` string
  (e.g. `"135 (18d10 + 36)"`), `AC` int, `Speed` string (e.g. `"30 ft., fly 60 ft."`), `AbilityScores`
  (six × `{ Score 1–30, Modifier? }`), `SavingThrows`, `Skills`, `SpecialTraits`, `Actions`
  (all `Record<string,string>`), `Senses`, `Languages`, `Equipment { Armor, Weapons, Other }`, `Notes`.
  **No `BonusActions`.**
- **LegendaryMonster** = GeneralMonster + `DamageResistances`, `DamageImmunities`, `ConditionImmunities`,
  `ChallengeRating`, `ProficiencyBonus` (strings), `BonusActions`, `Reactions`, `LegendaryTraits`,
  `LairActions` (records), `LegendaryActions { "Legendary Action Uses": /^\d+$/, Options: record }`,
  `MythicTrait { Name, Description }`, `RegionalEffects: string[]`.
- **Monster** = `{ kind: "general", body: GeneralMonster } | { kind: "legendary", body: LegendaryMonster }`.

## Normalization [`lib/monster/normalize.ts`]

- **Change**: `{ id, kind: "fill-default" | "coerce-number" | "compute-modifier" | "rename-key" |
  "upgrade-legendary" | "wrap-legendary-actions" | "fill-cr" | "derive-pb" | "move-bonus-action" |
  "flag-unknown-key" | "move-to-notes", path: string[], before: unknown, after: unknown, message: string }`.
  `move-to-notes` is only produced by `moveUnknownToNotes(result, path)` when the DM asks for it.
  Every change is invertible from `path` + `before`.
- **NormalizeResult**: `{ fixed: unknown, kind: "general"|"legendary", changes: Change[],
  errors: FieldError[], unknownKeys: string[][], needsCr: boolean }`.
- **FieldError**: `{ path: string[], message }` (from zod issues).
- Rules: `normalize(normalize(x).fixed).changes.length === 0`; a valid monster yields zero changes;
  nothing that is not in the source is added except blank template defaults and values derived by
  table (PB from CR, Modifier from Score).
- `revert(result, changeId)` → re-applies remaining changes to the original input and re-validates.

## Extraction [`lib/monster/types.ts`, `extract.ts`, `spells.ts`]

Every type in this section is defined as a zod schema in `lib/monster/types.ts` with the TypeScript
type inferred from it (`z.infer`), because a `ReviewedMonster` is read back from storage.

- **Ability**: `{ id, name, source: "Actions"|"BonusActions"|"Reactions"|"SpecialTraits"|"LegendaryActions"|"LairActions"|"Spellcasting",
  category: "action"|"bonus"|"reaction"|"passive"|"legendary"|"lair",
  uses: { kind: "at-will" } | { kind: "per-day", max } | { kind: "recharge", min /*5 for 5–6*/ } | { kind: "slot", level },
  attack?: { kind: "melee"|"ranged", bonus, reach?, range?: { normal, long? } },
  save?: { ability, dc }, area?: { shape, size }, damage?: { dice: string, avg: number, type }[],
  multiattack?: { abilityId, count }[], concentration?: boolean, singleTarget: boolean,
  dependsOnAttackAction?: boolean, raw: string, parsed: "full"|"partial"|"none" }`.
- **Spellcasting**: `{ slots: Record<level, max>, spells: { name, level, uses, known: boolean, spell?: SrdSpell }[] }`.
- **SrdSpell** [`data/srd-spells.json`]: `{ name, level, castingTime: "action"|"bonus"|"reaction"|"other",
  range, area?, save?, attack?: "melee"|"ranged", damage?, concentration }`.
- **ReviewedMonster**: `{ monster: Monster, abilities: Ability[], spellcasting?: Spellcasting,
  hpMax, speed: Record<"walk"|"fly"|"swim"|"climb"|"burrow", number>, intScore, confirmedAt }`.
  Only a ReviewedMonster can become a tracker.

## Encounter [`lib/encounter/state.ts`]

- **EncounterState**: `{ hp, hpMax, slots: Record<level, remaining>, perDay: Record<abilityId, remaining>,
  recharge: Record<abilityId, "available"|"spent">, legendaryActionsLeft, legendaryResistanceLeft,
  conditions: Condition[], concentration: { abilityId, name } | null, round }`.
  Fresh state = all maxima, round 1 (from ReviewedMonster).
- **Settings**: `{ temperament: "mindless"|"feral"|"cunning"|"genius", morale: 0..100 (default 50),
  rechargeMode: "auto"|"manual" }`. Temperament default from INT: ≤3 / 4–7 / 8–13 / ≥14.
- **Player**: `{ id, name, role: "melee"|"ranged"|"caster"|"healer", class, ac? }`.
- **PlayerTurn**: `{ playerId, zone: "engaged"|"near"|"far"|"veryFar", distanceFt?, apparentHp:
  "healthy"|"bloodied"|"nearDown"|"down", conditions: string[], cover: "none"|"half"|"threeQuarters"|"total",
  hitMonsterLastRound: boolean, clusteredWith: playerId[] }`.
  Zone defaults: engaged 5, near 30, far 60, veryFar 61+ ft.
- **Situation**: `{ players: PlayerTurn[], allies: { present, count }, terrain: { difficult, chokepoint,
  escapeRoute, flyingPossible }, notes }`. Carried forward on Apply.
- **TurnLogEntry**: `{ round, moveBefore, actionId, targetIds, clusterId?, slotLevel?, bonusActionId,
  moveAfter, result?: "hit"|"miss"|"downed"|"effect", note?, recommended: boolean }`.
- **Tracker**: `{ id, name, reviewed: ReviewedMonster, state: EncounterState, roster: Player[],
  situation: Situation, log: TurnLogEntry[], settings: Settings, createdAt }`.

### State transitions (reducers, all pure)

| Event | Effect |
|---|---|
| `create(reviewed)` | fresh state, default settings, empty roster/log |
| `duplicate(t)` | same `reviewed`, `roster`, `settings`; fresh state; blank situation; empty log; name `"<base> <n+1>"` |
| `delete` | removes the tracker from the store (UI confirms first; not a state reducer) |
| `startTurn(t, rng)` | `round+1`; auto mode: d6 per spent recharge, `available` if roll ≥ `min`; returns rolls shown to DM |
| `apply(t, choice)` | spend slot/per-day/recharge actually chosen; set/replace concentration; push log entry; keep situation |
| `recordResult(t, i, result)` | sets result on log entry `i` |
| `setHp / setCondition / setSlots …` | manual DM edits, clamped to [0, max] |

History sent to Jev = `log.slice(-3)`.

## Decision [`lib/decide`]

- **LegalOptions** [`lib/monster/options.ts`]: `{ blocked?: Blocked, actions: Option[], bonusActions: Option[]
  (always incl. "none"), movements: Movement[] }`, each list ≤ 255.
- **Option**: `{ key, abilityId | basic: "dash"|"dodge"|"disengage"|"hide"|"help", summary /*one line: to-hit/DC,
  damage, range, area*/, usesResource: boolean, leveledSpell?: { baseLevel, availableLevels: number[] },
  concentration: boolean, singleTarget: boolean, area: boolean, range: { inRangeNow: string[], inRangeAfterMove: string[] } }`.
- **Movement**: `"hold"|"closeIn"|"reachOther"|"retreat"|"takeCover"|"flyUp"`; speed 0, stunned, paralyzed,
  petrified or unconscious → `["hold"]`; flyUp only with fly speed.
- **Blocked**: `blocked = { reason, movementBy: "code"|"dm" }`. Stunned/paralyzed/petrified/unconscious →
  `movementBy: "code"` (hold). Incapacitated alone → `movementBy: "dm"` (full movement list, DM picks by hand).
  Jev is never called when `blocked` is set.
- **Cluster**: `{ id, playerIds }` (connected components of `clusteredWith`, plus singletons).
- **Recommendation**: `{ moveBefore, action: { key, targetIds?, clusterId?, slotLevel? }, bonusAction: { key, targetIds? },
  moveAfter, tactic, confidence: "high"|"medium"|"dmsCall", probabilities: {...per question}, runnersUp:
  { question, key, p }[], warnings: string[], explanation: string, adjustments: string[] /*consistency rules applied*/ }`.
  When the monster is hard-blocked, the recommendation is `{ blocked: Blocked, moveBefore: "hold" | null,
  moveAfter: "hold" | null }` with no action, bonus action, tactic or probabilities (`null` movement = DM picks;
  see contracts/decide-api.md).
- **JevError** [`lib/jev/client.ts`]: `{ kind: "config" | "upstream" | "timeout", message, status? }`, thrown by
  `callJev`. `config` = missing `TYPESAFE_API_KEY` (checked before any fetch); `upstream` = non-2xx after the retry,
  or a response that fails zod; `timeout` = the 30 s abort fired on the final attempt. Messages never include the key.
- Thresholds as named constants: `CONFIDENCE_HIGH = 0.85`, `CONFIDENCE_MEDIUM = 0.60`, `RETREAT_THRESHOLD = 0.60`,
  `SPEND_RESOURCE_LOW = 0.40` (assumed; the plan says "low").
