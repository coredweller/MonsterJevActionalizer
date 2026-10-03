"use client";

import { useMemo, useState } from "react";
import { describeUses, summarize } from "@/lib/monster/describe";
import { confirmReview, parseDamage, type ReviewDraft } from "@/lib/monster/extract";
import {
  AbilityCategorySchema,
  AbilityNameSchema,
  AreaShapeSchema,
  ReviewedMonsterSchema,
  type Ability,
  type AbilityUses,
  type ReviewedMonster,
} from "@/lib/monster/types";
import { Badge, Button, Panel, inputClass, labelClass } from "./ui";

const CATEGORY_LABEL: Record<Ability["category"], string> = {
  action: "action",
  bonus: "bonus action",
  reaction: "reaction",
  passive: "passive",
  legendary: "legendary",
  lair: "lair",
};

const int = (s: string, fallback: number) => (Number.isFinite(Number.parseInt(s, 10)) ? Number.parseInt(s, 10) : fallback);

function UsesEditor({ uses, onChange }: { uses: AbilityUses; onChange: (u: AbilityUses) => void }) {
  const amount = uses.kind === "per-day" ? uses.max : uses.kind === "recharge" ? uses.min : uses.kind === "slot" ? uses.level : undefined;
  function setKind(kind: AbilityUses["kind"]) {
    if (kind === "at-will") onChange({ kind });
    if (kind === "per-day") onChange({ kind, max: 1 });
    if (kind === "recharge") onChange({ kind, min: 5 });
    if (kind === "slot") onChange({ kind, level: 1 });
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
        <select className={inputClass} value={uses.kind} onChange={(e) => setKind(e.target.value as AbilityUses["kind"])}>
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
      {ability.spellLevel !== undefined && (
        <label className={labelClass}>
          Spell level (0 = cantrip)
          <input
            className={inputClass}
            type="number"
            min={0}
            max={9}
            value={ability.spellLevel}
            onChange={(e) => set({ spellLevel: Math.min(9, Math.max(0, int(e.target.value, 0))) })}
          />
        </label>
      )}
      {ability.attack && (
        <div className="flex gap-2">
          <label className={labelClass}>
            To hit
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={ability.attack.bonus}
              onChange={(e) => set({ attack: { ...ability.attack!, bonus: int(e.target.value, ability.attack!.bonus) } })}
            />
          </label>
          <label className={labelClass}>
            {ability.attack.kind === "melee" ? "Reach (ft.)" : "Range (ft.)"}
            <input
              className={`${inputClass} w-24`}
              type="number"
              value={ability.attack.kind === "melee" ? (ability.attack.reach ?? 5) : (ability.attack.range?.normal ?? 0)}
              onChange={(e) => {
                const n = int(e.target.value, 0);
                const attack = ability.attack!;
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
            value={ability.save?.ability ?? ""}
            onChange={(e) => set({ save: e.target.value ? { ability: AbilityNameSchema.parse(e.target.value), dc: ability.save?.dc ?? 13 } : undefined })}
          >
            <option value="">none</option>
            {AbilityNameSchema.options.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {ability.save && (
          <label className={labelClass}>
            DC
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={ability.save.dc}
              onChange={(e) => set({ save: { ...ability.save!, dc: int(e.target.value, ability.save!.dc) } })}
            />
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <label className={labelClass}>
          Area
          <select
            className={inputClass}
            value={ability.area?.shape ?? ""}
            onChange={(e) => {
              const shape = e.target.value;
              set(shape ? { area: { shape: AreaShapeSchema.parse(shape), size: ability.area?.size ?? 15 }, singleTarget: false } : { area: undefined });
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
        {ability.area && (
          <label className={labelClass}>
            Size (ft.)
            <input
              className={`${inputClass} w-20`}
              type="number"
              value={ability.area.size}
              onChange={(e) => set({ area: { ...ability.area!, size: Math.max(1, int(e.target.value, ability.area!.size)) } })}
            />
          </label>
        )}
      </div>
      {!ability.attack && (
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
  const unknown = draft.abilities.filter((a) => a.known === false);

  function updateAbility(next: Ability) {
    setDraft((d) => ({
      ...d,
      abilities: d.abilities.map((a) => (a.id === next.id ? next : a)),
      spellcasting: d.spellcasting && {
        ...d.spellcasting,
        spells: d.spellcasting.spells.map((s) => (s.abilityId === next.id ? { ...s, level: next.spellLevel ?? s.level, uses: next.uses } : s)),
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

  return (
    <Panel
      title={`Review ${draft.monster.body.CharacterName}`}
      actions={
        <>
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={confirm}>
            Confirm and create tracker
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className={labelClass}>
            Max HP
            <input
              className={`${inputClass} w-24`}
              type="number"
              value={draft.hpMax}
              onChange={(e) => setDraft((d) => ({ ...d, hpMax: Math.max(1, int(e.target.value, d.hpMax)) }))}
            />
          </label>
          <div className={labelClass}>
            Speed
            <span className="flex min-h-11 items-center">
              {Object.entries(draft.speed)
                .map(([mode, ft]) => `${mode} ${ft} ft.`)
                .join(", ") || "none parsed"}
            </span>
          </div>
          <div className={labelClass}>
            INT
            <span className="flex min-h-11 items-center">{draft.intScore}</span>
          </div>
        </div>

        {draft.spellcasting && (
          <div>
            <h3 className="mb-1 font-medium">Spellcasting</h3>
            <p className="text-sm text-stone-600">
              {draft.spellcasting.saveDc !== undefined && `Save DC ${draft.spellcasting.saveDc}. `}
              {draft.spellcasting.attackBonus !== undefined && `+${draft.spellcasting.attackBonus} to hit with spell attacks. `}
              {Object.keys(slots).length === 0 && "No spell slots (at-will and per-day spells only)."}
            </p>
            {Object.keys(slots).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(slots).map(([level, n]) => (
                  <label key={level} className={labelClass}>
                    Level {level} slots
                    <input className={`${inputClass} w-20`} type="number" min={0} value={n} onChange={(e) => setSlot(level, int(e.target.value, n))} />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {unknown.length > 0 && (
          <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
            Not in the SRD spell table: {unknown.map((a) => a.name).join(", ")}. Open each one and fill in its level, category, save
            and range.
          </p>
        )}

        <ul className="divide-y divide-stone-200">
          {draft.abilities.map((a) => (
            <li key={a.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <Badge tone={a.category === "passive" ? "stone" : "blue"}>{CATEGORY_LABEL[a.category]}</Badge>
                    <Badge>{describeUses(a.uses)}</Badge>
                    {a.known === false && <Badge tone="amber">unknown spell</Badge>}
                    {a.parsed === "none" && <Badge tone="amber">raw text only</Badge>}
                    {a.parsed === "partial" && <Badge>partly parsed</Badge>}
                    {a.dependsOnAttackAction && <Badge>after Attack action</Badge>}
                  </div>
                  <p className="text-sm text-stone-700">{a.parsed === "none" ? a.raw : summarize(a, names)}</p>
                </div>
                <Button variant="ghost" onClick={() => setEditing(editing === a.id ? null : a.id)}>
                  {editing === a.id ? "Done" : "Edit"}
                </Button>
              </div>
              {editing === a.id && (
                <>
                  <p className="mt-2 text-xs whitespace-pre-line text-stone-500">{a.raw}</p>
                  <AbilityEditor ability={a} onChange={updateAbility} />
                </>
              )}
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
