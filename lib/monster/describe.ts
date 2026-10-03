/** One-line, human-readable descriptions of extracted abilities (review screen, option summaries). */
import type { Ability, AbilityUses, Area, Attack, Damage, Save } from "./types";

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
