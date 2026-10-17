/** SRD spell table lookup. A spell that isn't in the table is unknown, never guessed. */
import { z } from "zod";
// The attribute lets Node's own ESM loader (Playwright's e2e tests) import it; bundlers accept it too.
import data from "../../data/srd-spells.json" with { type: "json" };
import { SrdSpellSchema, type SrdSpell } from "./types";

const SPELLS = z.array(SrdSpellSchema).parse(data);

/** A uses suffix: "(2/Day)", "(1/Day Each)", "(Recharge 5–6)", "(Recharge after a Short or Long Rest)". */
const USES_SUFFIX = /\s*\((?:Recharge[^)]*|\d+\s*\/\s*Day[^)]*)\)/gi;

/** The name without its uses suffix: "Misty Step (2/Day)" → "Misty Step". */
export const stripUsesSuffix = (name: string): string => name.replace(USES_SUFFIX, "").trim();

const key = (name: string) => stripUsesSuffix(name).replace(/\s+/g, " ").toLowerCase();

const BY_NAME = new Map(SPELLS.map((s) => [key(s.name), s]));

export type SpellLookup = { known: true; spell: SrdSpell } | { known: false };

/** Looks a spell up by name, ignoring case, extra whitespace and a uses suffix. */
export function lookupSpell(name: string): SpellLookup {
  const spell = BY_NAME.get(key(name));
  return spell ? { known: true, spell } : { known: false };
}
