/** One-line, human-readable descriptions of extracted abilities (review screen, option summaries). */
import type { Ability, AbilitySource, AbilityUses, Area, Attack, Damage, ReviewedMonster, Save } from "./types";

/** One statblock entry as written, with the ability extracted from it. Spellcasting entries have no single ability. */
export interface StatblockEntry {
  name: string;
  text: string;
  ability?: Ability;
  spellcasting: boolean;
}

export interface StatblockSection {
  title: "Traits" | "Actions" | "Bonus Actions" | "Reactions" | "Legendary Actions" | "Lair Actions";
  intro?: string;
  entries: StatblockEntry[];
}

/**
 * The review screen's statblock: each section's entries in file order, paired with their extracted ability.
 * Abilities are matched on source and raw text, which extraction copies verbatim. Spells belong to their
 * Spellcasting entry. Any other ability that matches no entry comes back in `unplaced` so it is still shown.
 */
export function statblockSections(reviewed: Pick<ReviewedMonster, "monster" | "abilities">): { sections: StatblockSection[]; unplaced: Ability[] } {
  const { monster } = reviewed;
  const pending = reviewed.abilities.filter((a) => a.source !== "Spellcasting");
  const take = (source: AbilitySource, text: string) => {
    const i = pending.findIndex((a) => a.source === source && a.raw === text);
    return i === -1 ? undefined : pending.splice(i, 1)[0];
  };
  const section = (title: StatblockSection["title"], source: AbilitySource, groups: Record<string, string>[], intro?: string): StatblockSection => {
    const entries: StatblockEntry[] = [];
    for (const [name, text] of groups.flatMap((g) => Object.entries(g))) {
      // Extraction skips blank entries outside traits, so the statblock does too.
      if (text.trim() === "" && source !== "SpecialTraits") continue;
      const spellcasting = /\bSpellcasting\b/i.test(name) && (source === "Actions" || source === "SpecialTraits");
      const ability = spellcasting ? undefined : take(source, text);
      entries.push({ name, text, spellcasting, ...(ability ? { ability } : {}) });
    }
    return { title, entries, ...(intro ? { intro } : {}) };
  };

  const body = monster.body;
  const sections =
    monster.kind === "legendary"
      ? [
          section("Traits", "SpecialTraits", [monster.body.SpecialTraits, monster.body.LegendaryTraits]),
          section("Actions", "Actions", [body.Actions]),
          section("Bonus Actions", "BonusActions", [monster.body.BonusActions]),
          section("Reactions", "Reactions", [monster.body.Reactions]),
          section(
            "Legendary Actions",
            "LegendaryActions",
            [monster.body.LegendaryActions.Options],
            `${body.CharacterName} can take ${monster.body.LegendaryActions["Legendary Action Uses"]} legendary actions, choosing from the options below.`,
          ),
          section("Lair Actions", "LairActions", [monster.body.LairActions], "On initiative count 20 (losing ties), it takes one lair action."),
        ]
      : [section("Traits", "SpecialTraits", [body.SpecialTraits]), section("Actions", "Actions", [body.Actions])];

  return { sections: sections.filter((s) => s.entries.length > 0), unplaced: pending };
}

export function describeUses(uses: AbilityUses): string {
  switch (uses.kind) {
    case "at-will":
      return "at will";
    case "per-day":
      return `${uses.max}/day`;
    case "recharge":
      return uses.min === 6 ? "recharge 6" : `recharge ${uses.min}–6`;
    case "slot":
      return `level ${uses.level} slot`;
  }
}

export function describeAttack(a: Attack): string {
  const reach = a.reach !== undefined ? `, reach ${a.reach} ft.` : "";
  const range = a.range ? `, range ${a.range.normal}${a.range.long ? `/${a.range.long}` : ""} ft.` : "";
  return `${a.kind} ${a.bonus >= 0 ? "+" : ""}${a.bonus} to hit${reach}${range}`;
}

export const describeSave = (s: Save) => `DC ${s.dc} ${s.ability} save`;
export const describeArea = (a: Area) => `${a.size}-ft. ${a.shape}`;
export const describeDamage = (d: Damage[]) => d.map((x) => `${x.avg} (${x.dice}) ${x.type}`).join(" + ");

/** "melee +6 to hit, reach 5 ft.; 12 (2d6 + 3) slashing" — to-hit/DC, damage, range, area. */
export function summarize(a: Ability, names?: Record<string, string>): string {
  const parts: string[] = [];
  if (a.multiattack) parts.push(a.multiattack.map((m) => `${m.count}× ${names?.[m.abilityId] ?? m.abilityId}`).join(" + "));
  if (a.attack) parts.push(describeAttack(a.attack));
  if (a.save) parts.push(describeSave(a.save));
  if (a.damage?.length) parts.push(describeDamage(a.damage));
  if (a.area) parts.push(describeArea(a.area));
  if (a.rangeFt !== undefined && !a.attack) parts.push(a.rangeFt === 0 ? "self" : `range ${a.rangeFt} ft.`);
  if (a.concentration) parts.push("concentration");
  if (a.uses.kind !== "at-will") parts.push(describeUses(a.uses));
  if (parts.length === 0) return a.raw.length > 90 ? `${a.raw.slice(0, 87)}…` : a.raw;
  return parts.join("; ");
}
