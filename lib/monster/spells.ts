/** SRD spell table lookup. A spell that isn't in the table is unknown, never guessed. */
import { z } from "zod";
import data from "../../data/srd-spells.json";
import { SrdSpellSchema, type SrdSpell } from "./types";

const SPELLS = z.array(SrdSpellSchema).parse(data);

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const BY_NAME = new Map(SPELLS.map((s) => [key(s.name), s]));

export type SpellLookup = { known: true; spell: SrdSpell } | { known: false };

export function lookupSpell(name: string): SpellLookup {
  const spell = BY_NAME.get(key(name));
  return spell ? { known: true, spell } : { known: false };
}
