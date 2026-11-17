"use client";

import { useMemo, type ReactNode } from "react";
import { statblockSections, type StatblockEntry, type StatblockSection } from "@/lib/monster/describe";
import { AbilityNameSchema, type Ability, type AbilityName, type ReviewedMonster } from "@/lib/monster/types";

/**
 * The monster as a printed statblock, shared by the review screen and the encounter tracker. Each
 * screen fills the interactive parts: the Hit Points value, what goes under each ability, the box
 * under the Spellcasting entry, and extras at the end of a section.
 */
export function MonsterStatblock({
  reviewed,
  name,
  hitPoints,
  speedNote,
  abilityExtra,
  spellcasting,
  sectionExtra,
}: {
  reviewed: Pick<ReviewedMonster, "monster" | "abilities">;
  /** The heading: the creature's name, or the tracker's name ("Goblin 2"). */
  name: string;
  /** The Hit Points line after its label: a field and anything beside it. The dice formula follows it. */
  hitPoints: ReactNode;
  /** Shown beside Speed. */
  speedNote?: ReactNode;
  /** Shown under each ability's statblock text. */
  abilityExtra: (ability: Ability) => ReactNode;
  /** Shown under the first Spellcasting entry, or after the last section when there is none. */
  spellcasting?: ReactNode;
  /** Shown at the end of a section, after its entries. */
  sectionExtra?: (title: StatblockSection["title"]) => ReactNode;
}) {
  const { monster } = reviewed;
  const { sections, unplaced } = useMemo(() => statblockSections(reviewed), [reviewed]);
  // The box hangs off the first Spellcasting entry only, so a monster with two never shows it twice.
  const firstSpellcasting = sections.flatMap((s) => s.entries).find((e) => e.spellcasting);

  const entry = (e: StatblockEntry) => (
    <div key={`${e.name}-${e.ability?.id ?? "text"}`} id={e.ability ? `ability-${e.ability.id}` : undefined} className="scroll-mt-24">
      <p className="whitespace-pre-line">
        <span className="font-bold italic">{e.name.endsWith(".") ? e.name : `${e.name}.`}</span> {e.text}
      </p>
      {e.ability && abilityExtra(e.ability)}
      {e === firstSpellcasting && spellcasting}
    </div>
  );

  const body = monster.body;
  const legendary = monster.kind === "legendary" ? monster.body : undefined;
  const equipment = Object.entries(body.Equipment)
    .flatMap(([slot, item]) => (typeof item === "string" && item.trim() !== "" ? [`${slot}: ${item}`] : []))
    .join("; ");

  return (
    <article aria-label={`${name} statblock`} className="statblock @container mx-auto max-w-3xl text-sm leading-snug text-stone-950">
      <div className="statblock-bar" />
      <div className="px-4 py-3 @lg:px-6">
        <h3 className="statblock-name text-3xl leading-tight font-bold">{name}</h3>
        <p className="italic">{[body.Race, body.Alignment.toLowerCase()].filter((part) => part.trim() !== "").join(", ")}</p>
        <div className="statblock-rule" />

        <div className="space-y-0.5 text-[#7a200d]">
          <Prop label="Armor Class">{body.AC}</Prop>
          <div className="flex flex-wrap items-center gap-x-2">
            {hitPoints}
            <span>{body.HP.replace(/^\s*\d+\s*/, "")}</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-2">
            <span>
              <span className="font-bold">Speed</span> {body.Speed}
            </span>
            {speedNote}
          </p>
        </div>
        <div className="statblock-rule" />

        <dl className="grid grid-cols-3 gap-y-2 text-center text-[#7a200d] @md:grid-cols-6">
          {AbilityNameSchema.options.map((ability) => (
            <div key={ability}>
              <dt className="font-bold">{ABILITY_ABBR[ability]}</dt>
              <dd>
                {body.AbilityScores[ability].Score} ({signed(body.AbilityScores[ability].Modifier)})
              </dd>
            </div>
          ))}
        </dl>
        <div className="statblock-rule" />

        <div className="space-y-0.5 text-[#7a200d]">
          {Object.keys(body.SavingThrows).length > 0 && <Prop label="Saving Throws">{joinBonuses(body.SavingThrows, true)}</Prop>}
          {Object.keys(body.Skills).length > 0 && <Prop label="Skills">{joinBonuses(body.Skills, false)}</Prop>}
          {legendary?.DamageResistances && <Prop label="Damage Resistances">{legendary.DamageResistances}</Prop>}
          {legendary?.DamageImmunities && <Prop label="Damage Immunities">{legendary.DamageImmunities}</Prop>}
          {legendary?.ConditionImmunities && <Prop label="Condition Immunities">{legendary.ConditionImmunities}</Prop>}
          {body.Senses && <Prop label="Senses">{body.Senses}</Prop>}
          {body.Languages && <Prop label="Languages">{body.Languages}</Prop>}
          {legendary && (
            <Prop label="Challenge">
              {legendary.ChallengeRating} (Proficiency Bonus {legendary.ProficiencyBonus})
            </Prop>
          )}
          {body.Class && <Prop label="Class">{body.Class}</Prop>}
          <Prop label="Level">{body.Level}</Prop>
          {equipment && <Prop label="Equipment">{equipment}</Prop>}
          {body.Notes && <Prop label="Notes">{body.Notes}</Prop>}
        </div>
        <div className="statblock-rule" />

        {sections.map((section) => (
          <section key={section.title} className="space-y-2.5">
            {section.title !== "Traits" && <h4 className="statblock-heading mt-4 border-b border-[#922610] text-2xl">{section.title}</h4>}
            {section.intro && <p>{section.intro}</p>}
            {section.entries.map(entry)}
            {sectionExtra?.(section.title)}
          </section>
        ))}

        {unplaced.length > 0 && (
          <section className="space-y-2.5">
            <h4 className="statblock-heading mt-4 border-b border-[#922610] text-2xl">Other abilities</h4>
            {unplaced.map((a) => entry({ name: a.name, text: a.raw, ability: a, spellcasting: false }))}
          </section>
        )}

        {firstSpellcasting === undefined && spellcasting}
      </div>
      <div className="statblock-bar" />
    </article>
  );
}

/** A small tag in the statblock's colours. */
export function Chip({ tone = "plain", children }: { tone?: "plain" | "warning"; children: ReactNode }) {
  const tones = { plain: "border-[#7a200d]/40 bg-white/70 text-stone-800", warning: "border-amber-600 bg-amber-100 text-amber-950" };
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/** The boxed area under the Spellcasting entry. */
export const spellBoxClass = "mt-2 space-y-2 rounded border border-[#7a200d]/30 bg-white/50 p-2";

const ABILITY_ABBR: Record<AbilityName, string> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** "Dex +7, Wis +7" for saving throws (ability names shortened), "Perception +7, Stealth +7" for skills. */
const joinBonuses = (bonuses: Record<string, string>, shorten: boolean) =>
  Object.entries(bonuses)
    .map(([bonusName, bonus]) => `${shorten ? bonusName.slice(0, 3) : bonusName} ${bonus}`)
    .join(", ");

/** A "Label value" line in the statblock's property block. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-bold">{label}</span> {children}
    </p>
  );
}
