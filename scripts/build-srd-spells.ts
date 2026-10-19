/**
 * `npm run build:spells`: generates data/srd-spells.json from the SRD 5.1 spell list
 * (CC BY 4.0), via the 5e-bits/5e-database export. Keeps only the fields options and
 * questions need. Run once and commit the output; the app never fetches spells at runtime.
 *
 * The export leaves `dc` and `area_of_effect` out of some spells whose SRD text states them
 * (Spirit Guardians: "must make a wisdom saving throw", "to a distance of 15 feet"). When a
 * structured field is missing, the save and area are read from the spell's own description;
 * nothing is filled in that the text doesn't say.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AbilityNameSchema, AreaShapeSchema, SrdSpellSchema, type Area, type SrdSpell } from "../lib/monster/types";

const SOURCE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Spells.json";
const OUT = fileURLToPath(new URL("../data/srd-spells.json", import.meta.url));

const SourceDamage = z.object({
  damage_type: z.object({ name: z.string() }).optional(),
  damage_at_slot_level: z.record(z.string(), z.string()).optional(),
  damage_at_character_level: z.record(z.string(), z.string()).optional(),
});

const SourceSpell = z.object({
  name: z.string(),
  desc: z.array(z.string()),
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

/** "must make a wisdom saving throw", "makes a Wisdom saving throw", "succeeds on a constitution saving throw". */
const TEXT_SAVE = /\b(?:makes?|succeeds?) (?:on )?an? (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i;

function textSave(desc: string): SrdSpell["save"] {
  const m = TEXT_SAVE.exec(desc);
  return m ? AbilityNameSchema.options.find((a) => a.toLowerCase() === m[1].toLowerCase()) : undefined;
}

/**
 * "a 20-foot-radius sphere", "a 30-foot cube", and Spirit Guardians' "to a distance of 15 feet" (an
 * emanation). A bare "N-foot radius" is skipped: in the SRD text it is nearly always a light radius.
 */
const TEXT_AREA_SHAPED = /\b(\d+)-foot(?:-radius)? (sphere|cube|cone|line|cylinder)\b/i;
const TEXT_AREA_AROUND = /\bto a distance of (\d+) feet\b/i;

function textArea(desc: string): Area | undefined {
  const shaped = TEXT_AREA_SHAPED.exec(desc);
  if (shaped) {
    const shape = AreaShapeSchema.safeParse(shaped[2].toLowerCase());
    return shape.success ? { shape: shape.data, size: Number(shaped[1]) } : undefined;
  }
  const around = TEXT_AREA_AROUND.exec(desc);
  return around ? { shape: "emanation", size: Number(around[1]) } : undefined;
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
      const desc = s.desc.join("\n");
      const save = s.dc ? SAVE[s.dc.dc_type.index] : textSave(desc);
      const dmg = damage(s.damage);
      const sourceArea = s.area_of_effect && SHAPES.has(s.area_of_effect.type) ? { shape: s.area_of_effect.type, size: s.area_of_effect.size } : undefined;
      // Only a spell that harms or calls for a save has an area of effect; elsewhere "a 20-foot cube"
      // is a size limit (Major Image) or a volume of material (Fabricate).
      const area = sourceArea ?? (save || dmg ? textArea(desc) : undefined);
      return SrdSpellSchema.parse({
        name: s.name,
        level: s.level,
        castingTime: castingTime(s.casting_time),
        range: s.range,
        ...(area ? { area } : {}),
        ...(save ? { save } : {}),
        ...(s.attack_type ? { attack: s.attack_type } : {}),
        ...(dmg ? { damage: dmg } : {}),
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
