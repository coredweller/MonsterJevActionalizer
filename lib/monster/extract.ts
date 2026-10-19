/**
 * Statblock text extraction (PLAN.md "Reading the statblock"), handling 2014 and 2024 wording.
 * Anything it can't read stays as raw text with `parsed: "none"`; unknown spells are marked
 * unknown. Nothing is inferred beyond what the text says.
 */
import type { Monster } from "./schema";
import { lookupSpell, stripUsesSuffix } from "./spells";
import type {
  Ability,
  AbilityCategory,
  AbilityName,
  AbilitySource,
  AbilityUses,
  Area,
  Attack,
  Damage,
  ReviewedMonster,
  Save,
  SpeedMap,
  SpellEntry,
  Spellcasting,
  SrdSpell,
} from "./types";

export type ReviewDraft = Omit<ReviewedMonster, "confirmedAt">;

const ABILITY_NAMES: AbilityName[] = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const ABILITY_RE = ABILITY_NAMES.join("|");
const DASH = "[-–—]";

const clean = (s: string) => s.replace(/[’‘]/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleAbility = (s: string) => ABILITY_NAMES.find((a) => a.toLowerCase() === s.toLowerCase());

// ---------------------------------------------------------------------------
// Field parsers (exported for tests and the review screen)
// ---------------------------------------------------------------------------

export function parseHp(hp: string): number | undefined {
  const m = /^\s*(\d+)/.exec(hp);
  return m ? Number(m[1]) : undefined;
}

export function parseSpeed(speed: string): SpeedMap {
  const out: SpeedMap = {};
  for (const part of speed.split(/[,;]/)) {
    const m = /^\s*(?:(walk|fly|swim|climb|burrow)\s+)?(\d+)\s*(?:ft|feet|foot)/i.exec(part);
    if (!m) continue;
    const mode = (m[1]?.toLowerCase() ?? "walk") as keyof SpeedMap;
    if (out[mode] === undefined) out[mode] = Number(m[2]);
  }
  return out;
}

export function parseUses(name: string, text: string): AbilityUses {
  const recharge = new RegExp(`Recharge\\s+(\\d)(?:\\s*${DASH}\\s*6)?`, "i");
  const perDay = /\((\d+)\s*\/\s*Day\b/i;
  for (const s of [name, text]) {
    const r = recharge.exec(s);
    if (r) return { kind: "recharge", min: Number(r[1]) };
    const d = perDay.exec(s);
    if (d) return { kind: "per-day", max: Number(d[1]) };
  }
  return { kind: "at-will" };
}

export function parseAttack(text: string): Attack | undefined {
  const t = clean(text);
  const m2014 = /(Melee|Ranged)(?: or Ranged)? (?:Weapon|Spell) Attack:\s*([+-]\d+) to hit/i.exec(t);
  const m2024 = /(Melee|Ranged)(?: or Ranged)? Attack Roll:\s*([+-]\d+)/i.exec(t);
  const m = m2014 ?? m2024;
  if (!m) return undefined;
  const attack: Attack = { kind: m[1].toLowerCase() as Attack["kind"], bonus: Number(m[2]) };
  const reach = /reach (\d+) ?(?:ft|feet)/i.exec(t);
  if (reach) attack.reach = Number(reach[1]);
  const range = /range (\d+)(?:\/(\d+))? ?(?:ft|feet)/i.exec(t);
  if (range) attack.range = range[2] ? { normal: Number(range[1]), long: Number(range[2]) } : { normal: Number(range[1]) };
  return attack;
}

export function parseSave(text: string): Save | undefined {
  const t = clean(text);
  const m2014 = new RegExp(`DC (\\d+) (${ABILITY_RE}) sav(?:ing throw|e)`, "i").exec(t);
  if (m2014) return { ability: titleAbility(m2014[2])!, dc: Number(m2014[1]) };
  const m2024 = new RegExp(`(${ABILITY_RE}) Saving Throw:\\s*DC (\\d+)`, "i").exec(t);
  if (m2024) return { ability: titleAbility(m2024[1])!, dc: Number(m2024[2]) };
  return undefined;
}

function diceAverage(dice: string): number | undefined {
  const m = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(dice);
  if (!m) return undefined;
  const base = (Number(m[1]) * (Number(m[2]) + 1)) / 2;
  const mod = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  return Math.floor(base + mod);
}

export function parseDamage(text: string): Damage[] {
  const out: Damage[] = [];
  const re = /(?:(\d+)\s*\()?(\d+d\d+(?:\s*[+\-−]\s*\d+)?)\)?\s+([a-z]+)\s+damage/gi;
  for (const m of clean(text).matchAll(re)) {
    const dice = m[2].replace(/−/g, "-").replace(/\s*([+-])\s*/, " $1 ");
    const avg = m[1] !== undefined ? Number(m[1]) : diceAverage(dice);
    if (avg === undefined) continue;
    out.push({ dice, avg, type: m[3].toLowerCase() });
  }
  return out;
}

export function parseArea(text: string): Area | undefined {
  const t = clean(text);
  const shaped = /(\d+)[- ](?:foot|feet|ft\.?)[- ](?:radius[- ])?(cone|line|sphere|cube|cylinder|radius|emanation)\b/i.exec(t);
  if (shaped) return { shape: shaped[2].toLowerCase() as Area["shape"], size: Number(shaped[1]) };
  const around = /\b(?:all|each|every) creatures? within (\d+) (?:feet|ft\.?) of\b/i.exec(t);
  if (around) return { shape: "emanation", size: Number(around[1]) };
  return undefined;
}

function parseRangeFt(text: string): number | undefined {
  const m = /within (\d+) (?:feet|ft)/i.exec(clean(text));
  return m ? Number(m[1]) : undefined;
}

function srdRangeFt(range: string): number | undefined {
  const m = /^(\d+) (?:feet|foot)/i.exec(range);
  if (m) return Number(m[1]);
  if (/^touch/i.test(range)) return 5;
  if (/^self/i.test(range)) return 0;
  return undefined;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, once: 1, twice: 2, thrice: 3 };
const toCount = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const ID_PREFIX: Record<AbilitySource, string> = {
  Actions: "act",
  BonusActions: "bon",
  Reactions: "rea",
  SpecialTraits: "trt",
  LegendaryActions: "leg",
  LairActions: "lair",
  Spellcasting: "spell",
};

const SOURCE_CATEGORY: Record<AbilitySource, AbilityCategory> = {
  Actions: "action",
  BonusActions: "bonus",
  Reactions: "reaction",
  SpecialTraits: "passive",
  LegendaryActions: "legendary",
  LairActions: "lair",
  Spellcasting: "action",
};

class Ids {
  private readonly used = new Set<string>();
  next(source: AbilitySource, name: string): string {
    const slug =
      clean(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "ability";
    const base = `${ID_PREFIX[source]}_${slug}`;
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}_${n}`;
    this.used.add(id);
    return id;
  }
}

// "As a bonus action, …", "uses its/your bonus action to …", "can use a bonus action to …" (Cunning Action),
// but not "can't use its bonus action".
const BONUS_ACTION = /\bas a bonus action\b|(?<!\b(?:can't|cannot|can not) )\bus(?:e|es|ing) (?:a|its|your|their) bonus action\b/i;
const DEPENDS_ON_ATTACK = /\btakes? the Attack action\b/i;
const SINGLE_TARGET = /\b(?:one|a|the) (?:target|creature)\b|\btarget(?:s)? (?:a|one) creature\b|\bchoose a creature\b|\bone creature\b/i;

function parseEntry(source: AbilitySource, rawName: string, raw: string, ids: Ids): Ability {
  const name = stripUsesSuffix(rawName);
  let category = SOURCE_CATEGORY[source];
  if (source === "SpecialTraits" && BONUS_ACTION.test(raw)) category = "bonus";
  if (source === "Actions" && /^\s*As a reaction\b/i.test(raw)) category = "reaction";

  const attack = parseAttack(raw);
  const save = parseSave(raw);
  const area = parseArea(raw);
  const damage = parseDamage(raw);
  const rangeFt = attack ? undefined : parseRangeFt(raw);
  const singleTarget = attack ? !area : !area && SINGLE_TARGET.test(raw);

  const ability: Ability = {
    id: ids.next(source, name),
    name,
    source,
    category,
    uses: parseUses(rawName, raw),
    singleTarget,
    raw,
    parsed: "none",
  };
  if (attack) ability.attack = attack;
  if (save) ability.save = save;
  if (area) ability.area = area;
  if (damage.length > 0) ability.damage = damage;
  if (rangeFt !== undefined) ability.rangeFt = rangeFt;
  if (category === "bonus" && DEPENDS_ON_ATTACK.test(raw)) ability.dependsOnAttackAction = true;

  const grantsBasicAction = /\b(?:Dash|Disengage|Dodge|Hide|Help)\b(?: or \w+)? action\b/i.test(raw) && category === "bonus";
  if (attack) ability.parsed = damage.length > 0 ? "full" : "partial";
  else if (save) ability.parsed = damage.length > 0 || area ? "full" : "partial";
  else if (grantsBasicAction) ability.parsed = "full";
  else if (damage.length > 0 || area || rangeFt !== undefined) ability.parsed = "partial";

  // An entry named after an SRD spell ("Misty Step (2/Day)") takes the spell's level, concentration and range.
  const asSpell = !attack && !save && source !== "SpecialTraits" ? lookupSpell(name) : undefined;
  if (asSpell?.known) {
    ability.spellLevel = asSpell.spell.level;
    ability.concentration = asSpell.spell.concentration;
    const spellRange = srdRangeFt(asSpell.spell.range);
    if (spellRange !== undefined && ability.rangeFt === undefined) ability.rangeFt = spellRange;
    ability.known = true;
    ability.parsed = "full";
  }
  return ability;
}

/**
 * Multiattack composition, and the attacks named by "make one Mace attack" bonus actions:
 * each named action with the count word just before it ("two Mace attacks", "one with its Sting").
 */
function namedAttacks(text: string, candidates: Ability[]): { abilityId: string; count: number }[] {
  const t = clean(text);
  const parts: { abilityId: string; count: number; at: number }[] = [];
  for (const a of candidates) {
    const m = new RegExp(`\\b${escapeRe(clean(a.name))}\\b`, "i").exec(t);
    if (!m) continue;
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    const c = /\b(one|two|three|four|five|six|\d+)\s+(?:(?:attacks?|times)\s+)?(?:with\s+(?:its|his|her|their|the)\s+)?$/i.exec(before);
    parts.push({ abilityId: a.id, count: c ? toCount(c[1]) : 1, at: m.index });
  }
  return parts.sort((x, y) => x.at - y.at).map(({ abilityId, count }) => ({ abilityId, count }));
}

function resolveMultiattack(multi: Ability, actions: Ability[]) {
  const attacks = actions.filter((a) => a !== multi && a.category === "action");
  const parts = namedAttacks(multi.raw, attacks);
  multi.singleTarget = true;
  if (parts.length > 0) {
    multi.multiattack = parts;
    multi.parsed = "full";
    return;
  }
  // "makes two melee weapon attacks": only resolvable when exactly one attack of that kind exists.
  const generic = /\b(one|two|three|four|five|six|\d+|twice)\s+(?:(melee|ranged)\s+)?(?:weapon\s+)?attacks?\b|\battacks? (twice|thrice)\b/i.exec(clean(multi.raw));
  if (!generic) return;
  const count = toCount(generic[1] ?? generic[3]);
  const kind = generic[2]?.toLowerCase();
  const matching = attacks.filter((a) => a.attack && (!kind || a.attack.kind === kind));
  if (matching.length === 1) {
    multi.multiattack = [{ abilityId: matching[0].id, count }];
    multi.parsed = "partial";
  }
}

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

function splitSpells(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.replace(/\(.*?\)/g, "").replace(/\*/g, "").trim())
    .filter(Boolean);
}

function spellAbility(
  name: string,
  uses: AbilityUses,
  lineLevel: number | undefined,
  castAsAction: boolean,
  dc: number | undefined,
  attackBonus: number | undefined,
  ids: Ids,
): { ability: Ability; entry: SpellEntry } {
  const lookup = lookupSpell(name);
  const spell: SrdSpell | undefined = lookup.known ? lookup.spell : undefined;
  // From the statblock's slot/cantrip line or the SRD table; an unknown at-will/X-day spell has none.
  const level = lineLevel ?? spell?.level;
  const category: AbilityCategory = castAsAction
    ? "action"
    : !spell
      ? "action"
      : spell.castingTime === "other"
        ? "passive"
        : spell.castingTime;
  const id = ids.next("Spellcasting", spell?.name ?? name);

  // Only offensive spells need a player target; healing and buffs target the monster's side.
  const offensive = Boolean(spell && (spell.attack || spell.save || spell.damage));
  const ability: Ability = {
    id,
    name: spell?.name ?? name,
    source: "Spellcasting",
    category,
    uses,
    singleTarget: spell ? offensive && !spell.area : true,
    ...(level !== undefined ? { spellLevel: level } : {}),
    known: Boolean(spell),
    raw: spell ? `${spell.name}: level ${spell.level}, ${spell.castingTime}, range ${spell.range}` : name,
    parsed: spell ? "full" : "partial",
  };
  if (spell) {
    ability.concentration = spell.concentration;
    const rangeFt = srdRangeFt(spell.range);
    if (spell.attack && attackBonus !== undefined) {
      ability.attack =
        spell.attack === "melee"
          ? { kind: "melee", bonus: attackBonus, reach: rangeFt && rangeFt > 0 ? rangeFt : 5 }
          : { kind: "ranged", bonus: attackBonus, range: { normal: rangeFt ?? 0 } };
    } else if (rangeFt !== undefined) {
      ability.rangeFt = rangeFt;
    }
    if (spell.save && dc !== undefined) ability.save = { ability: spell.save, dc };
    if (spell.area) ability.area = spell.area;
    if (spell.damage) {
      const dmg = /^(\d+d\d+(?:\s*\+\s*\d+)?)\s+(\w+)$/.exec(spell.damage);
      const avg = dmg ? diceAverage(dmg[1]) : undefined;
      if (dmg && avg !== undefined) ability.damage = [{ dice: dmg[1], avg, type: dmg[2] }];
    }
  }
  const entry: SpellEntry = { abilityId: id, name: ability.name, uses, known: Boolean(spell) };
  if (level !== undefined) entry.level = level;
  if (spell) entry.spell = spell;
  return { ability, entry };
}

function parseSpellcasting(raw: string, castAsAction: boolean, ids: Ids): { abilities: Ability[]; spellcasting: Spellcasting } {
  const t = clean(raw);
  const dc = /spell save DC (\d+)/i.exec(t);
  const atk = /([+-]\d+) to hit with spell attacks/i.exec(t);
  const saveDc = dc ? Number(dc[1]) : undefined;
  const attackBonus = atk ? Number(atk[1]) : undefined;
  const slots: Record<string, number> = {};
  const abilities: Ability[] = [];
  const spells: SpellEntry[] = [];
  const add = (list: string, uses: (level: number | undefined) => AbilityUses, level: number | undefined) => {
    for (const name of splitSpells(list)) {
      const { ability, entry } = spellAbility(name, uses(level), level, castAsAction, saveDc, attackBonus, ids);
      abilities.push(ability);
      spells.push(entry);
    }
  };

  for (const line of t.split(/\n/)) {
    const cantrips = /^\s*Cantrips?\s*\(at will\):\s*(.+)$/i.exec(line);
    const leveled = /^\s*(\d)(?:st|nd|rd|th)[- ]level\s*\((\d+) slots?\):\s*(.+)$/i.exec(line);
    const atWill = /^\s*At will:\s*(.+)$/i.exec(line);
    const perDay = /^\s*(\d+)\s*\/\s*day(?: each)?:\s*(.+)$/i.exec(line);
    if (cantrips) add(cantrips[1], () => ({ kind: "at-will" }), 0);
    else if (leveled) {
      const level = Number(leveled[1]);
      slots[String(level)] = Number(leveled[2]);
      add(leveled[3], (l) => ({ kind: "slot", level: l! }), level);
    } else if (atWill) add(atWill[1], () => ({ kind: "at-will" }), undefined);
    else if (perDay) {
      const max = Number(perDay[1]);
      add(perDay[2], () => ({ kind: "per-day", max }), undefined);
    }
  }

  const spellcasting: Spellcasting = { slots, spells };
  if (saveDc !== undefined) spellcasting.saveDc = saveDc;
  if (attackBonus !== undefined) spellcasting.attackBonus = attackBonus;
  return { abilities, spellcasting };
}

const isSpellcasting = (name: string) => /\bSpellcasting\b/i.test(name);

// ---------------------------------------------------------------------------

export function extractAbilities(monster: Monster): ReviewDraft {
  const body = monster.body;
  const ids = new Ids();
  const abilities: Ability[] = [];
  let spellcasting: Spellcasting | undefined;

  const sections: [AbilitySource, Record<string, string>][] = [["Actions", body.Actions]];
  if (monster.kind === "legendary") {
    const b = monster.body;
    sections.push(["BonusActions", b.BonusActions], ["Reactions", b.Reactions]);
  }
  sections.push(["SpecialTraits", body.SpecialTraits]);
  if (monster.kind === "legendary") {
    const b = monster.body;
    sections.push(["SpecialTraits", b.LegendaryTraits], ["LegendaryActions", b.LegendaryActions.Options], ["LairActions", b.LairActions]);
  }

  for (const [source, entries] of sections) {
    for (const [name, raw] of Object.entries(entries)) {
      if (raw.trim() === "" && source !== "SpecialTraits") continue;
      if (isSpellcasting(name) && (source === "Actions" || source === "SpecialTraits")) {
        const parsed = parseSpellcasting(raw, source === "Actions", ids);
        abilities.push(...parsed.abilities);
        spellcasting = spellcasting
          ? {
              ...spellcasting,
              slots: { ...spellcasting.slots, ...parsed.spellcasting.slots },
              spells: [...spellcasting.spells, ...parsed.spellcasting.spells],
            }
          : parsed.spellcasting;
        continue;
      }
      abilities.push(parseEntry(source, name, raw, ids));
    }
  }

  const actions = abilities.filter((a) => a.source === "Actions");
  for (const a of abilities) {
    if (a.source === "Actions" && /^Multiattack\b/i.test(a.name)) resolveMultiattack(a, actions);
    // "it can make one Mace attack as a bonus action" / "The hag makes one Thorn Lash attack":
    // point at the attack it makes.
    if (["bonus", "legendary", "lair"].includes(a.category) && !a.attack && !a.save) {
      const parts = namedAttacks(a.raw, actions.filter((x) => x.attack));
      if (parts.length > 0) {
        a.multiattack = parts;
        a.singleTarget = true;
        a.parsed = "full";
      }
    }
  }

  return {
    monster,
    abilities,
    ...(spellcasting ? { spellcasting } : {}),
    hpMax: parseHp(body.HP) ?? 1,
    speed: parseSpeed(body.Speed),
    intScore: body.AbilityScores.Intelligence.Score,
  };
}

/** Names of spells with no level yet (unknown at-will/X-day spells). The DM must fill them in before confirming. */
export function spellsMissingLevel(draft: ReviewDraft): string[] {
  return (draft.spellcasting?.spells ?? []).filter((s) => s.level === undefined).map((s) => s.name);
}

/** Confirm a draft on the review screen. */
export function confirmReview(draft: ReviewDraft, now: string): ReviewedMonster {
  return { ...draft, confirmedAt: now };
}
