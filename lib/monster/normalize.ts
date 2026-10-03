/**
 * Template-drift detection and auto-fixes (PLAN.md "Validation and fixing"). Pure: shared by
 * the fix screen and `npm run check:monsters`.
 *
 * Every fix is a recorded Change with a stable id (`<kind>:<path>`). Reverting a change re-runs
 * the normalizer on the original input with that id skipped, so the other fixes stay applied.
 * Nothing is added that isn't in the source except blank template defaults and values derived by
 * table (proficiency bonus from CR, modifier from score). Unknown keys are kept and listed.
 */
import type { ZodIssue } from "zod";
import { GeneralMonsterBodySchema, LegendaryMonsterBodySchema, abilityModifier, classify, type MonsterKind } from "./schema";

export const CHANGE_KINDS = [
  "fill-default",
  "coerce-number",
  "compute-modifier",
  "rename-key",
  "upgrade-legendary",
  "wrap-legendary-actions",
  "fill-cr",
  "derive-pb",
  "move-bonus-action",
  "flag-unknown-key",
  "move-to-notes",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface Change {
  id: string;
  kind: ChangeKind;
  path: string[];
  before: unknown;
  after: unknown;
  message: string;
}

export interface FieldError {
  path: string[];
  message: string;
  /** For type errors: the type zod expected ("number", "string", "object", …). */
  expected?: string;
}

export interface NormalizeOptions {
  /** Used to read the CR from `<Name>.CR<n>.<edition>.json`. */
  filename?: string;
  /** CR supplied by the DM when the filename has none. */
  cr?: string;
  /** Change ids the DM reverted. */
  skip?: string[];
  /** Unknown-key paths the DM asked to move into Notes. */
  moveToNotes?: string[][];
}

export interface NormalizeResult {
  input: unknown;
  options: NormalizeOptions;
  fixed: unknown;
  kind: MonsterKind;
  changes: Change[];
  errors: FieldError[];
  unknownKeys: string[][];
  needsCr: boolean;
}

const GENERAL_KEYS = [
  "CharacterName",
  "Level",
  "Race",
  "Class",
  "Alignment",
  "HP",
  "AC",
  "Speed",
  "AbilityScores",
  "SavingThrows",
  "Skills",
  "Senses",
  "Languages",
  "SpecialTraits",
  "Actions",
  "Equipment",
  "Notes",
] as const;

const LEGENDARY_ONLY_KEYS = [
  "DamageResistances",
  "DamageImmunities",
  "ConditionImmunities",
  "ChallengeRating",
  "ProficiencyBonus",
  "BonusActions",
  "Reactions",
  "LegendaryTraits",
  "LegendaryActions",
  "MythicTrait",
  "LairActions",
  "RegionalEffects",
] as const;

/** Keys only the legendary template has; a legendary monster with none of them is a general one to upgrade. */
const LEGENDARY_SCALAR_KEYS = ["ChallengeRating", "ProficiencyBonus", "DamageResistances", "DamageImmunities", "ConditionImmunities"];

const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;
const EQUIPMENT_KEYS = ["Armor", "Weapons", "Other"] as const;

/** Blank defaults filled when a key is missing. Core values (name, HP, AC, Level, Speed, scores) are never filled. */
const GENERAL_DEFAULTS: Record<string, () => unknown> = {
  Race: () => "",
  Class: () => "",
  Alignment: () => "",
  SavingThrows: () => ({}),
  Skills: () => ({}),
  Senses: () => "",
  Languages: () => "",
  SpecialTraits: () => ({}),
  Actions: () => ({}),
  Equipment: () => ({ Armor: "", Weapons: "", Other: "" }),
  Notes: () => "",
};

/** Never includes LegendaryTraits' template "Legendary Resistance (3/Day)": Legendary Resistance is never invented. */
const LEGENDARY_DEFAULTS: Record<string, () => unknown> = {
  DamageResistances: () => "",
  DamageImmunities: () => "",
  ConditionImmunities: () => "",
  BonusActions: () => ({}),
  Reactions: () => ({}),
  LegendaryTraits: () => ({}),
  LairActions: () => ({}),
  RegionalEffects: () => [],
  MythicTrait: () => ({ Name: "", Description: "" }),
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function withPluralVariants(canonical: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of canonical) {
    const n = norm(key);
    out[n] = key;
    if (n.endsWith("ies")) out[`${n.slice(0, -3)}y`] = key;
    else if (n.endsWith("s")) out[n.slice(0, -1)] = key;
    else out[`${n}s`] = key;
  }
  return out;
}

/** Near-miss key → canonical key, compared after lowercasing and dropping spaces, underscores and hyphens. */
export const ALIASES = {
  topLevel: {
    ...withPluralVariants([...GENERAL_KEYS, ...LEGENDARY_ONLY_KEYS]),
    name: "CharacterName",
    hitpoints: "HP",
    armorclass: "AC",
    abilities: "AbilityScores",
    stats: "AbilityScores",
    saves: "SavingThrows",
    traits: "SpecialTraits",
    challenge: "ChallengeRating",
    cr: "ChallengeRating",
    pb: "ProficiencyBonus",
    proficiency: "ProficiencyBonus",
  } as Record<string, string>,
  equipment: { ...withPluralVariants(EQUIPMENT_KEYS), armour: "Armor", armours: "Armor" } as Record<string, string>,
  abilityScores: {
    ...withPluralVariants(ABILITY_NAMES),
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma",
  } as Record<string, string>,
  abilityScore: { score: "Score", modifier: "Modifier", mod: "Modifier" } as Record<string, string>,
};

/** Standard proficiency bonus by CR: [highest CR in band, bonus]. */
export const PB_BY_CR: ReadonlyArray<readonly [number, number]> = [
  [4, 2],
  [8, 3],
  [12, 4],
  [16, 5],
  [20, 6],
  [24, 7],
  [28, 8],
  [30, 9],
];

function crValue(cr: string): number | undefined {
  const t = cr.trim();
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

export function proficiencyBonusForCr(cr: string): number | undefined {
  const v = crValue(cr);
  if (v === undefined) return undefined;
  return PB_BY_CR.find(([max]) => v <= max)?.[1];
}

export function crFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  return /\.CR(\d+(?:\/\d+)?)\./i.exec(filename)?.[1];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumericString = (v: unknown): v is string => typeof v === "string" && /^\s*-?\d+\s*$/.test(v);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const preview = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

/** Rename a key in place, keeping its position. */
function renameKey(obj: Obj, from: string, to: string): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
  return out;
}

class Recorder {
  readonly changes: Change[] = [];
  constructor(private readonly skip: ReadonlySet<string>) {}

  /** Records and applies a change unless the DM reverted it. Returns whether it was applied. */
  apply(kind: ChangeKind, path: string[], before: unknown, after: unknown, message: string, mutate: () => void): boolean {
    const id = `${kind}:${path.join("/")}`;
    if (this.skip.has(id)) return false;
    mutate();
    this.changes.push({ id, kind, path, before, after, message });
    return true;
  }
}

function renameAliases(obj: Obj, table: Record<string, string>, canonical: readonly string[], parentPath: string[], rec: Recorder): Obj {
  let out = obj;
  for (const key of Object.keys(obj)) {
    if (canonical.includes(key)) continue;
    const target = table[norm(key)];
    if (!target || target in out) continue;
    rec.apply("rename-key", [...parentPath, key], key, target, `Renamed "${[...parentPath, key].join(".")}" to "${target}".`, () => {
      out = renameKey(out, key, target);
    });
  }
  return out;
}

function errorsFor(kind: MonsterKind, body: unknown): FieldError[] {
  const schema = kind === "legendary" ? LegendaryMonsterBodySchema : GeneralMonsterBodySchema;
  const result = schema.safeParse(body);
  return result.success
    ? []
    : result.error.issues.map((i: ZodIssue) => ({
        path: i.path.map(String),
        message: i.message,
        ...(i.code === "invalid_type" ? { expected: String(i.expected) } : {}),
      }));
}

export function normalize(input: unknown, options: NormalizeOptions = {}): NormalizeResult {
  const base = { input, options };
  if (!isObj(input)) {
    return {
      ...base,
      fixed: input,
      kind: "general",
      changes: [],
      errors: [{ path: [], message: "A monster must be a JSON object." }],
      unknownKeys: [],
      needsCr: false,
    };
  }

  const rec = new Recorder(new Set(options.skip ?? []));
  let b: Obj = structuredClone(input);

  // 1. Rename near-miss keys.
  b = renameAliases(b, ALIASES.topLevel, [...GENERAL_KEYS, ...LEGENDARY_ONLY_KEYS], [], rec);
  if (isObj(b.Equipment)) b.Equipment = renameAliases(b.Equipment, ALIASES.equipment, EQUIPMENT_KEYS, ["Equipment"], rec);
  if (isObj(b.AbilityScores)) {
    const scores = renameAliases(b.AbilityScores, ALIASES.abilityScores, ABILITY_NAMES, ["AbilityScores"], rec);
    for (const name of ABILITY_NAMES) {
      const s = scores[name];
      if (isObj(s)) scores[name] = renameAliases(s, ALIASES.abilityScore, ["Score", "Modifier"], ["AbilityScores", name], rec);
    }
    b.AbilityScores = scores;
  }

  const kind = classify(b);

  // 2. Wrap a flat legendary-actions map, keeping the real action names as Options.
  if (kind === "legendary" && isObj(b.LegendaryActions) && !("Options" in b.LegendaryActions)) {
    const flat = b.LegendaryActions;
    const usesKey = Object.keys(flat).find((k) => ["legendaryactionuses", "uses"].includes(norm(k)));
    const uses = usesKey !== undefined ? String(flat[usesKey]) : "3";
    const options: Obj = {};
    for (const [k, v] of Object.entries(flat)) if (k !== usesKey) options[k] = v;
    const wrapped = { "Legendary Action Uses": uses, Options: options };
    rec.apply(
      "wrap-legendary-actions",
      ["LegendaryActions"],
      flat,
      wrapped,
      `Wrapped the legendary actions as { "Legendary Action Uses": "${uses}", Options } (${Object.keys(options).length} options).`,
      () => {
        b.LegendaryActions = wrapped;
      },
    );
  }

  // 3. Upgrade a general monster with legendary content to the legendary template.
  const looksGeneral = kind === "legendary" && !LEGENDARY_SCALAR_KEYS.some((k) => k in b);
  const upgraded =
    looksGeneral &&
    rec.apply("upgrade-legendary", [], "general", "legendary", "Upgraded to the legendary template because it has legendary content.", () => {});
  const legendaryFill = kind === "legendary" && (!looksGeneral || upgraded);

  // 4. Fill missing template keys with blank defaults.
  const defaults = legendaryFill ? { ...GENERAL_DEFAULTS, ...LEGENDARY_DEFAULTS } : GENERAL_DEFAULTS;
  for (const [key, make] of Object.entries(defaults)) {
    if (key === "Equipment" && isObj(b.Equipment)) {
      const equipment = b.Equipment;
      const missing = EQUIPMENT_KEYS.filter((k) => !(k in equipment));
      if (missing.length === 0) continue;
      const after = { ...equipment, ...Object.fromEntries(missing.map((k) => [k, ""])) };
      rec.apply("fill-default", ["Equipment"], equipment, after, `Filled blank Equipment.${missing.join(", Equipment.")}.`, () => {
        b.Equipment = after;
      });
      continue;
    }
    if (key in b) continue;
    const value = make();
    rec.apply("fill-default", [key], undefined, value, `Added missing ${key} as ${preview(value)}.`, () => {
      b[key] = value;
    });
  }

  // 5. Challenge rating and proficiency bonus.
  let needsCr = false;
  if (legendaryFill && !("ChallengeRating" in b)) {
    const fromFilename = crFromFilename(options.filename);
    const cr = options.cr ?? fromFilename;
    if (cr === undefined) needsCr = true;
    else
      rec.apply("fill-cr", ["ChallengeRating"], undefined, cr, `Set ChallengeRating to "${cr}" from ${options.cr ? "the CR you entered" : "the filename"}.`, () => {
        b.ChallengeRating = cr;
      });
  }
  if (legendaryFill && !("ProficiencyBonus" in b) && typeof b.ChallengeRating === "string") {
    const pb = proficiencyBonusForCr(b.ChallengeRating);
    if (pb !== undefined)
      rec.apply("derive-pb", ["ProficiencyBonus"], undefined, signed(pb), `Set ProficiencyBonus to "${signed(pb)}" from CR ${b.ChallengeRating}.`, () => {
        b.ProficiencyBonus = signed(pb);
      });
  }

  // 6. On upgrade, move "as a bonus action" traits into BonusActions.
  if (upgraded && isObj(b.SpecialTraits) && isObj(b.BonusActions)) {
    for (const [name, text] of Object.entries(b.SpecialTraits)) {
      if (typeof text !== "string" || !/\bas a bonus action\b/i.test(text) || name in b.BonusActions) continue;
      rec.apply("move-bonus-action", ["SpecialTraits", name], text, `BonusActions.${name}`, `Moved trait "${name}" into BonusActions (it says "as a bonus action").`, () => {
        const traits = { ...(b.SpecialTraits as Obj) };
        delete traits[name];
        b.SpecialTraits = traits;
        b.BonusActions = { ...(b.BonusActions as Obj), [name]: text };
      });
    }
  }

  // 7. Coerce numeric strings.
  for (const key of ["Level", "AC"]) {
    const v = b[key];
    if (isNumericString(v))
      rec.apply("coerce-number", [key], v, Number(v), `Changed ${key} from "${v}" to the number ${Number(v)}.`, () => {
        b[key] = Number(v);
      });
  }
  if (isObj(b.AbilityScores)) {
    const scores = b.AbilityScores;
    for (const name of ABILITY_NAMES) {
      const s = scores[name];
      if (!isObj(s) || !isNumericString(s.Score)) continue;
      const v = s.Score;
      rec.apply("coerce-number", ["AbilityScores", name, "Score"], v, Number(v), `Changed ${name} score from "${v}" to the number ${Number(v)}.`, () => {
        scores[name] = { ...s, Score: Number(v) };
      });
    }

    // 8. Compute missing modifiers from scores.
    for (const name of ABILITY_NAMES) {
      const s = scores[name];
      if (!isObj(s) || typeof s.Score !== "number" || s.Modifier !== undefined) continue;
      const mod = signed(abilityModifier(s.Score));
      rec.apply("compute-modifier", ["AbilityScores", name, "Modifier"], undefined, mod, `Computed ${name} modifier ${mod} from score ${s.Score}.`, () => {
        scores[name] = { ...s, Modifier: mod };
      });
    }
  }

  // 9. Move unknown keys into Notes, only where the DM asked.
  for (const path of options.moveToNotes ?? []) {
    const parent = path.length === 1 ? b : isObj(b[path[0]]) ? (b[path[0]] as Obj) : undefined;
    const key = path[path.length - 1];
    if (!parent || !(key in parent) || path.length > 2) continue;
    const value = parent[key];
    const line = `${path.join(".")}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
    rec.apply("move-to-notes", path, value, line, `Moved unknown key "${path.join(".")}" into Notes.`, () => {
      delete parent[key];
      b.Notes = typeof b.Notes === "string" && b.Notes.length > 0 ? `${b.Notes}\n${line}` : line;
    });
  }

  // 10. Flag unknown keys (kept as-is).
  const allowed: readonly string[] = kind === "legendary" ? [...GENERAL_KEYS, ...LEGENDARY_ONLY_KEYS] : GENERAL_KEYS;
  const unknownKeys: string[][] = Object.keys(b)
    .filter((k) => !allowed.includes(k))
    .map((k) => [k]);
  if (isObj(b.Equipment))
    for (const k of Object.keys(b.Equipment)) if (!(EQUIPMENT_KEYS as readonly string[]).includes(k)) unknownKeys.push(["Equipment", k]);

  return { ...base, fixed: b, kind, changes: rec.changes, errors: errorsFor(kind, b), unknownKeys, needsCr };
}

/** Undo one change: re-run on the original input with it skipped; every other change stays applied. */
export function revert(result: NormalizeResult, changeId: string): NormalizeResult {
  const skip = [...new Set([...(result.options.skip ?? []), changeId])];
  return normalize(result.input, { ...result.options, skip });
}

/** Move an unknown key into Notes as "<key>: <value>". Only ever done on the DM's request. */
export function moveUnknownToNotes(result: NormalizeResult, path: string[]): NormalizeResult {
  return normalize(result.input, { ...result.options, moveToNotes: [...(result.options.moveToNotes ?? []), path] });
}

/** Undo a revert. */
export function reapply(result: NormalizeResult, changeId: string): NormalizeResult {
  return normalize(result.input, { ...result.options, skip: (result.options.skip ?? []).filter((id) => id !== changeId) });
}

/**
 * The DM's inline edit of a field in the fixed monster. The edit goes into the original input
 * (mapping renamed keys back to their source spelling) so every recorded change stays revertible.
 */
export function editField(result: NormalizeResult, path: string[], value: unknown): NormalizeResult {
  if (!isObj(result.input) || path.length === 0) return result;
  const renames = result.changes.filter((c) => c.kind === "rename-key");
  const inputPath = path.map((seg, i) => {
    const parent = path.slice(0, i);
    const rename = renames.find((c) => c.after === seg && c.path.length === i + 1 && c.path.slice(0, i).join("/") === parent.join("/"));
    return rename ? String(rename.before) : seg;
  });
  const input: Obj = structuredClone(result.input);
  let node: Obj = input;
  for (const seg of inputPath.slice(0, -1)) {
    if (!isObj(node[seg])) node[seg] = {};
    node = node[seg] as Obj;
  }
  node[inputPath[inputPath.length - 1]] = value;
  return normalize(input, result.options);
}

/** Re-run with a CR the DM entered (when `needsCr`). */
export function withCr(result: NormalizeResult, cr: string): NormalizeResult {
  return normalize(result.input, { ...result.options, cr });
}
