"use client";

import { useMemo, useState } from "react";
import { describeUses, summarize } from "@/lib/monster/describe";
import { confirmReview, parseDamage, spellsMissingLevel, type ReviewDraft } from "@/lib/monster/extract";
import {
  AbilityCategorySchema,
  AbilityNameSchema,
  AbilityUsesSchema,
  AreaShapeSchema,
  ReviewedMonsterSchema,
  type Ability,
  type AbilityUses,
  type ReviewedMonster,
} from "@/lib/monster/types";
import { Chip, MonsterStatblock, spellBoxClass } from "./MonsterStatblock";
import { Button, Panel, inputClass, labelClass } from "./ui";

const CATEGORY_LABEL: Record<Ability["category"], string> = {
  action: "action",
  bonus: "bonus action",
  reaction: "reaction",
  passive: "passive",
  legendary: "legendary",
  lair: "lair",
};

const int = (s: string, fallback: number) => (Number.isFinite(Number.parseInt(s, 10)) ? Number.parseInt(s, 10) : fallback);

/** Every uses kind, read from the schema so the select can narrow its value without a cast. */
const USES_KINDS = AbilityUsesSchema.options.map((o) => o.shape.kind.value);

function UsesEditor({ uses, onChange }: { uses: AbilityUses; onChange: (u: AbilityUses) => void }) {
  const amount = uses.kind === "per-day" ? uses.max : uses.kind === "recharge" ? uses.min : uses.kind === "slot" ? uses.level : undefined;
  function setKind(value: string) {
    const kind = USES_KINDS.find((k) => k === value);
    if (kind === undefined) throw new Error(`Unknown uses kind "${value}"`);
    switch (kind) {
      case "at-will":
        return onChange({ kind });
      case "per-day":
        return onChange({ kind, max: 1 });
      case "recharge":
        return onChange({ kind, min: 5 });
      case "slot":
        return onChange({ kind, level: 1 });
    }
  }
  function setAmount(n: number) {
    if (uses.kind === "per-day") onChange({ kind: "per-day", max: Math.max(1, n) });
    if (uses.kind === "recharge") onChange({ kind: "recharge", min: Math.min(6, Math.max(1, n)) });
    if (uses.kind === "slot") onChange({ kind: "slot", level: Math.min(9, Math.max(1, n)) });
  }
  return (
    <div className="flex gap-2">
      <label className={labelClass}>
        Uses
        <select className={inputClass} value={uses.kind} onChange={(e) => setKind(e.target.value)}>
          <option value="at-will">at will</option>
          <option value="per-day">per day</option>
          <option value="recharge">recharge</option>
          <option value="slot">spell slot</option>
        </select>
      </label>
      {amount !== undefined && (
        <label className={labelClass}>
          {uses.kind === "per-day" ? "Per day" : uses.kind === "recharge" ? "Recharges on" : "Slot level"}
          <input className={`${inputClass} w-20`} type="number" value={amount} onChange={(e) => setAmount(int(e.target.value, amount))} />
        </label>
      )}
    </div>
  );
}

function AbilityEditor({ ability, onChange }: { ability: Ability; onChange: (a: Ability) => void }) {
  const set = (patch: Partial<Ability>) => onChange({ ...ability, ...patch });
  const [damageText, setDamageText] = useState(ability.damage?.map((d) => `${d.dice} ${d.type}`).join(", ") ?? "");
  // Narrowed once here; the const narrowing carries into the onChange closures below.
  const { attack, save, area } = ability;
  // An unknown at-will/X-day spell has no level until the DM enters one.
  const isSpell = ability.spellLevel !== undefined || ability.known === false;

  return (
    <div className="mt-2 grid grid-cols-1 gap-3 rounded bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={labelClass}>
        Category
        <select className={inputClass} value={ability.category} onChange={(e) => set({ category: AbilityCategorySchema.parse(e.target.value) })}>
          {AbilityCategorySchema.options.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <UsesEditor uses={ability.uses} onChange={(uses) => set({ uses })} />
      {isSpell && (
        <label className={labelClass}>
          Spell level (0 = cantrip){ability.spellLevel === undefined && " (required)"}
          <input
            className={inputClass}
            type="number"
            min={0}
            max={9}
            required
            aria-invalid={ability.spellLevel === undefined}
            value={ability.spellLevel ?? ""}
            onChange={(e) => set({ spellLevel: e.target.value === "" ? undefined : Math.min(9, Math.max(0, int(e.target.value, 0))) })}
          />
        </label>
      )}
      {attack && (
        <div className="flex gap-2">
          <label className={labelClass}>
            To hit
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={attack.bonus}
              onChange={(e) => set({ attack: { ...attack, bonus: int(e.target.value, attack.bonus) } })}
            />
          </label>
          <label className={labelClass}>
            {attack.kind === "melee" ? "Reach (ft.)" : "Range (ft.)"}
            <input
              className={`${inputClass} w-24`}
              type="number"
              value={attack.kind === "melee" ? (attack.reach ?? 5) : (attack.range?.normal ?? 0)}
              onChange={(e) => {
                const n = int(e.target.value, 0);
                set({ attack: attack.kind === "melee" ? { ...attack, reach: n } : { ...attack, range: { ...attack.range, normal: n } } });
              }}
            />
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <label className={labelClass}>
          Save
          <select
            className={inputClass}
            value={save?.ability ?? ""}
            onChange={(e) => set({ save: e.target.value ? { ability: AbilityNameSchema.parse(e.target.value), dc: save?.dc ?? 13 } : undefined })}
          >
            <option value="">none</option>
            {AbilityNameSchema.options.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {save && (
          <label className={labelClass}>
            DC
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={save.dc}
              onChange={(e) => set({ save: { ...save, dc: int(e.target.value, save.dc) } })}
            />
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <label className={labelClass}>
          Area
          <select
            className={inputClass}
            value={area?.shape ?? ""}
            onChange={(e) => {
              const shape = e.target.value;
              set(shape ? { area: { shape: AreaShapeSchema.parse(shape), size: area?.size ?? 15 }, singleTarget: false } : { area: undefined });
            }}
          >
            <option value="">none</option>
            {AreaShapeSchema.options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {area && (
          <label className={labelClass}>
            Size (ft.)
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={area.size}
              onChange={(e) => set({ area: { ...area, size: Math.max(1, int(e.target.value, area.size)) } })}
            />
          </label>
        )}
      </div>
      {!attack && (
        <label className={labelClass}>
          Range (ft., 0 = self)
          <input
            className={inputClass}
            type="number"
            value={ability.rangeFt ?? ""}
            onChange={(e) => set({ rangeFt: e.target.value === "" ? undefined : Math.max(0, int(e.target.value, 0)) })}
          />
        </label>
      )}
      <label className={labelClass}>
        Damage (e.g. &quot;2d6 + 3 slashing, 1d8 fire&quot;)
        <input
          className={inputClass}
          value={damageText}
          onChange={(e) => setDamageText(e.target.value)}
          onBlur={() => {
            const damage = parseDamage(damageText.split(",").map((part) => `${part.trim()} damage`).join(" "));
            set({ damage: damage.length > 0 ? damage : undefined });
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={ability.singleTarget} onChange={(e) => set({ singleTarget: e.target.checked })} /> Targets one player
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={ability.concentration ?? false} onChange={(e) => set({ concentration: e.target.checked })} /> Concentration
        </label>
        {ability.category === "bonus" && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={ability.dependsOnAttackAction ?? false} onChange={(e) => set({ dependsOnAttackAction: e.target.checked })} />{" "}
            Needs the Attack action
          </label>
        )}
      </div>
    </div>
  );
}

export function ReviewScreen({
  draft: initial,
  onConfirm,
  onBack,
}: {
  draft: ReviewDraft;
  onConfirm: (reviewed: ReviewedMonster) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => Object.fromEntries(draft.abilities.map((a) => [a.id, a.name])), [draft.abilities]);
  const slots = draft.spellcasting?.slots ?? {};
  const missingLevel = spellsMissingLevel(draft);
  const spells = draft.abilities.filter((a) => a.source === "Spellcasting");

  function updateAbility(next: Ability) {
    setDraft((d) => ({
      ...d,
      abilities: d.abilities.map((a) => (a.id === next.id ? next : a)),
      spellcasting: d.spellcasting && {
        ...d.spellcasting,
        // The spell entry mirrors its ability, including a level the DM has cleared.
        spells: d.spellcasting.spells.map((s) => (s.abilityId === next.id ? { ...s, level: next.spellLevel, uses: next.uses } : s)),
      },
    }));
  }

  function setSlot(level: string, n: number) {
    setDraft((d) => (d.spellcasting ? { ...d, spellcasting: { ...d.spellcasting, slots: { ...d.spellcasting.slots, [level]: Math.max(0, n) } } } : d));
  }

  function confirm() {
    const result = ReviewedMonsterSchema.safeParse(confirmReview(draft, new Date().toISOString()));
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    onConfirm(result.data);
  }

  /** Open an ability's editor and bring it into view (used by the problem banners). */
  function goTo(abilityId: string) {
    setEditing(abilityId);
    requestAnimationFrame(() => document.getElementById(`ability-${abilityId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const errors: Problem[] = [
    ...(draft.spellcasting?.spells ?? [])
      .filter((s) => missingLevel.includes(s.name))
      .map((s) => ({ abilityId: s.abilityId, text: `${s.name} has no spell level. Give it one before confirming.` })),
    ...(error ? [{ text: `Couldn't confirm: ${error}` }] : []),
  ];
  const warnings: Problem[] = draft.abilities.flatMap((a) =>
    a.known === false
      ? [{ abilityId: a.id, text: `${a.name} isn't in the SRD spell table. Fill in its level, category, save and range.` }]
      : a.parsed === "none"
        ? [{ abilityId: a.id, text: `${a.name}: only the raw text was kept, nothing was parsed.` }]
        : a.parsed === "partial"
          ? [{ abilityId: a.id, text: `${a.name}: partly parsed. Check its values.` }]
          : [],
  );

  const editToggle = (a: Ability) => (
    <Button variant="ghost" onClick={() => setEditing(editing === a.id ? null : a.id)}>
      {editing === a.id ? "Done" : "Edit"}
    </Button>
  );

  const spellcastingTools = draft.spellcasting && (
    <div className={spellBoxClass}>
      <p className="text-xs text-stone-700">
        {draft.spellcasting.saveDc !== undefined && `Save DC ${draft.spellcasting.saveDc}. `}
        {draft.spellcasting.attackBonus !== undefined && `+${draft.spellcasting.attackBonus} to hit with spell attacks. `}
        {Object.keys(slots).length === 0 && "No spell slots (at-will and per-day spells only)."}
      </p>
      {Object.keys(slots).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(slots).map(([level, n]) => (
            <label key={level} className={labelClass}>
              Level {level} slots
              <input className={`${inputClass} w-20`} type="number" min={0} value={n} onChange={(e) => setSlot(level, int(e.target.value, n))} />
            </label>
          ))}
        </div>
      )}
      <ul className="divide-y divide-[#7a200d]/15">
        {spells.map((s) => (
          <li key={s.id} id={`ability-${s.id}`} className="scroll-mt-24 py-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{s.name}</span>
              <AbilityChips ability={s} names={names} />
              {editToggle(s)}
            </div>
            {editing === s.id && <AbilityEditor ability={s} onChange={updateAbility} />}
          </li>
        ))}
      </ul>
    </div>
  );

  const body = draft.monster.body;
  const speedParsed = Object.entries(draft.speed)
    .map(([mode, ft]) => `${mode} ${ft}`)
    .join(" · ");

  return (
    <Panel
      title={`Review ${body.CharacterName}`}
      actions={
        <>
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={confirm} disabled={missingLevel.length > 0} aria-describedby={missingLevel.length > 0 ? "review-errors" : undefined}>
            Confirm and create tracker
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {errors.length > 0 && (
          <ProblemBanner
            id="review-errors"
            tone="error"
            title={`${errors.length} ${errors.length === 1 ? "error" : "errors"}${missingLevel.length > 0 ? ": Confirm is disabled" : ""}`}
            problems={errors}
            onGo={goTo}
          />
        )}
        {warnings.length > 0 && (
          <ProblemBanner tone="warning" title={`${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`} problems={warnings} onGo={goTo} />
        )}

        <MonsterStatblock
          reviewed={draft}
          name={body.CharacterName}
          hitPoints={
            <>
              <label htmlFor="review-max-hp" className="font-bold">
                Hit Points
              </label>
              {/* The wrapper sets the width: inputClass's w-full beats a w-24 added beside it. */}
              <span className="w-24">
                <input
                  id="review-max-hp"
                  aria-label="Max HP"
                  className={inputClass}
                  type="number"
                  value={draft.hpMax}
                  onChange={(e) => setDraft((d) => ({ ...d, hpMax: Math.max(1, int(e.target.value, d.hpMax)) }))}
                />
              </span>
            </>
          }
          speedNote={speedParsed ? <Chip>{speedParsed}</Chip> : <Chip tone="warning">speed not parsed</Chip>}
          abilityExtra={(a) => (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <AbilityChips ability={a} names={names} />
                {editToggle(a)}
              </div>
              {editing === a.id && <AbilityEditor ability={a} onChange={updateAbility} />}
            </>
          )}
          spellcasting={spellcastingTools}
        />
      </div>
    </Panel>
  );
}

/** What was parsed from an ability, as small chips under its statblock text. */
function AbilityChips({ ability: a, names }: { ability: Ability; names: Record<string, string> }) {
  const isSpell = a.spellLevel !== undefined || a.known === false;
  return (
    <>
      <Chip>{CATEGORY_LABEL[a.category]}</Chip>
      {/* The summary already ends with any limited uses, so only show uses on their own when it wouldn't. */}
      {(a.parsed === "none" || a.uses.kind === "at-will") && <Chip>{describeUses(a.uses)}</Chip>}
      {isSpell && (a.spellLevel === undefined ? <Chip tone="warning">no level</Chip> : <Chip>{a.spellLevel === 0 ? "cantrip" : `level ${a.spellLevel} spell`}</Chip>)}
      {a.parsed !== "none" && <Chip>{summarize(a, names)}</Chip>}
      {a.known === false && <Chip tone="warning">unknown spell</Chip>}
      {a.parsed === "none" && <Chip tone="warning">raw text only</Chip>}
      {a.parsed === "partial" && <Chip>partly parsed</Chip>}
      {a.dependsOnAttackAction && <Chip>after Attack action</Chip>}
    </>
  );
}

/** A problem shown in a banner above the statblock. With an ability id, clicking it opens that ability. */
interface Problem {
  abilityId?: string;
  text: string;
}

function ProblemBanner({ id, tone, title, problems, onGo }: { id?: string; tone: "error" | "warning"; title: string; problems: Problem[]; onGo: (abilityId: string) => void }) {
  const style = tone === "error" ? "border-red-700 bg-red-50 text-red-900" : "border-amber-500 bg-amber-50 text-amber-950";
  const icon = tone === "error" ? "bg-red-700 text-white" : "bg-amber-400 text-amber-950";
  return (
    <section id={id} role={tone === "error" ? "alert" : "status"} className={`rounded-md border-2 border-l-8 p-3 ${style}`}>
      <h3 className="flex items-center gap-2 text-base font-bold">
        <span aria-hidden="true" className={`inline-flex size-6 items-center justify-center rounded-full text-sm ${icon}`}>
          {tone === "error" ? "✕" : "!"}
        </span>
        {title}
      </h3>
      <ul className="mt-1 list-disc pl-10 text-sm">
        {problems.map(({ abilityId, text }) => (
          <li key={`${abilityId ?? "general"}-${text}`}>
            {abilityId === undefined ? (
              text
            ) : (
              <button type="button" className="min-h-11 text-left underline underline-offset-2 hover:no-underline" onClick={() => onGo(abilityId)}>
                {text}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
