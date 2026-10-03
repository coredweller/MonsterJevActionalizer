/**
 * `npm run build:spells`: generates data/srd-spells.json from the SRD 5.1 spell list
 * (CC BY 4.0), via the 5e-bits/5e-database export. Keeps only the fields options and
 * questions need. Run once and commit the output; the app never fetches spells at runtime.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SrdSpellSchema, type SrdSpell } from "../lib/monster/types";

const SOURCE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Spells.json";
const OUT = fileURLToPath(new URL("../data/srd-spells.json", import.meta.url));

const SourceDamage = z.object({
  damage_type: z.object({ name: z.string() }).optional(),
  damage_at_slot_level: z.record(z.string(), z.string()).optional(),
  damage_at_character_level: z.record(z.string(), z.string()).optional(),
});

const SourceSpell = z.object({
  name: z.string(),
  level: z.number().int(),
  casting_time: z.string(),
  range: z.string(),
  concentration: z.boolean(),
  attack_type: z.enum(["melee", "ranged"]).optional(),
  dc: z.object({ dc_type: z.object({ index: z.string() }) }).optional(),
  area_of_effect: z.object({ type: z.string(), size: z.number() }).optional(),
  damage: z
    .union([z.array(z.unknown()), z.object({}).passthrough()])
    .transform((d) => (Array.isArray(d) ? d[0] : d))
    .pipe(SourceDamage.optional())
    .optional(),
});

const SAVE: Record<string, SrdSpell["save"]> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const SHAPES = new Set(["cone", "line", "sphere", "cube", "cylinder"]);

function castingTime(s: string): SrdSpell["castingTime"] {
  if (s === "1 action") return "action";
  if (s === "1 bonus action") return "bonus";
  if (s === "1 reaction") return "reaction";
  return "other";
}

function damage(d: z.infer<typeof SourceSpell>["damage"]): string | undefined {
  if (!d) return undefined;
  const table = d.damage_at_slot_level ?? d.damage_at_character_level;
  const first = table ? Object.values(table)[0] : undefined;
  if (!first) return undefined;
  return d.damage_type ? `${first} ${d.damage_type.name.toLowerCase()}` : first;
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Fetching ${SOURCE} failed: ${res.status}`);
  const source = z.array(SourceSpell.passthrough()).parse(await res.json());

  const spells: SrdSpell[] = source
    .map((s) => {
      const area = s.area_of_effect && SHAPES.has(s.area_of_effect.type) ? s.area_of_effect : undefined;
      return SrdSpellSchema.parse({
        name: s.name,
        level: s.level,
        castingTime: castingTime(s.casting_time),
        range: s.range,
        ...(area ? { area: { shape: area.type, size: area.size } } : {}),
        ...(s.dc ? { save: SAVE[s.dc.dc_type.index] } : {}),
        ...(s.attack_type ? { attack: s.attack_type } : {}),
        ...(damage(s.damage) ? { damage: damage(s.damage) } : {}),
        concentration: s.concentration,
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  writeFileSync(OUT, `${JSON.stringify(spells, null, 2)}\n`);
  console.log(`Wrote ${spells.length} spells to data/srd-spells.json`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
