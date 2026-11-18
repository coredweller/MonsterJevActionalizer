"use client";

import { useId, useState, type ReactNode } from "react";
import {
  type RechargeRoll,
  legendaryActionMax,
  legendaryResistanceMax,
  perDayMax,
  setConcentration,
  setConditions,
  setHp,
  setLegendary,
  setPerDay,
  setRecharge,
  setSettings,
  setSlots,
  slotMax,
  startTurn,
  suggestTemperament,
} from "@/lib/encounter/state";
import { CONDITIONS, TemperamentSchema, type Settings, type Temperament, type Tracker } from "@/lib/encounter/types";
import { describeUses, type StatblockSection } from "@/lib/monster/describe";
import type { Ability } from "@/lib/monster/types";
import { MonsterStatblock, spellBoxClass } from "./MonsterStatblock";
import { Badge, Button, NumberField, Panel, ToggleChip, inputClass, labelClass, toggled } from "./ui";

const TEMPERAMENT_LABELS: Record<Temperament, string> = {
  mindless: "Mindless",
  feral: "Feral",
  cunning: "Cunning",
  genius: "Tactical genius",
};

/** The last "Start turn" press, kept so its rolls show until the tracker or round changes. */
interface TurnStart {
  readonly trackerId: string;
  readonly round: number;
  readonly rolls: readonly RechargeRoll[];
}

/**
 * The monster's encounter state, editable by hand: settings and conditions above, then the same
 * statblock as the review screen with each live counter placed beside what it tracks. Controlled:
 * every edit goes through a reducer in `lib/encounter/state.ts` and emits the whole new tracker,
 * which the caller saves. Only resources the statblock gives are shown, and the reducers clamp
 * each counter to [0, max].
 */
export function EncounterTracker({ tracker, onChange }: { tracker: Tracker; onChange: (tracker: Tracker) => void }) {
  const { reviewed, state, settings } = tracker;
  const [turnStart, setTurnStart] = useState<TurnStart | null>(null);
  const rolls = turnStart?.trackerId === tracker.id && turnStart.round === state.round ? turnStart.rolls : null;

  const slots = slotMax(reviewed);
  const perDay = perDayMax(reviewed);
  const hasRecharge = reviewed.abilities.some((a) => a.uses.kind === "recharge");
  const legendaryActions = legendaryActionMax(reviewed);
  const legendaryResistance = legendaryResistanceMax(reviewed);
  // The current concentration stays selectable even if its ability isn't flagged as concentration.
  const concentrationChoices = reviewed.abilities.filter((a) => a.concentration === true || a.id === state.concentration?.abilityId);
  // Spells aren't statblock entries of their own, so their live controls go in the Spellcasting box.
  const trackedSpells = reviewed.abilities.filter((a) => a.source === "Spellcasting" && (perDay[a.id] !== undefined || a.uses.kind === "recharge"));
  const suggested = suggestTemperament(reviewed.intScore);
  const moraleId = useId();

  function start() {
    const result = startTurn(tracker, Math.random);
    setTurnStart({ trackerId: result.tracker.id, round: result.tracker.state.round, rolls: result.rolls });
    onChange(result.tracker);
  }

  function chooseConcentration(abilityId: string) {
    const ability = reviewed.abilities.find((a) => a.id === abilityId);
    onChange(setConcentration(tracker, ability ? { abilityId: ability.id, name: ability.name } : null));
  }

  function chooseTemperament(value: string) {
    onChange(setSettings(tracker, { temperament: TemperamentSchema.parse(value) }));
  }

  // Pressing the mode that's already on does nothing, so the pair always has exactly one pressed.
  function chooseRechargeMode(rechargeMode: Settings["rechargeMode"]) {
    if (rechargeMode !== settings.rechargeMode) onChange(setSettings(tracker, { rechargeMode }));
  }

  /** An ability's daily-use counter or recharge toggle; nothing for an ability without either. */
  function liveControls(a: Ability): ReactNode {
    const max = perDay[a.id];
    if (max !== undefined) {
      return (
        <Live>
          <Counter label={a.name} value={counter(state.perDay, a.id, "daily-use ability")} max={max} onChange={(n) => onChange(setPerDay(tracker, a.id, n))} />
        </Live>
      );
    }
    if (a.uses.kind !== "recharge") return null;
    const available = state.recharge[a.id] === "available";
    return (
      <Live>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0">
            {a.name} <span className="text-stone-600">({describeUses(a.uses)})</span>
          </span>
          <ToggleChip pressed={available} onToggle={(on) => onChange(setRecharge(tracker, a.id, on ? "available" : "spent"))}>
            {available ? "Available" : "Spent"}
          </ToggleChip>
        </div>
      </Live>
    );
  }

  const concentrating = state.concentration !== null;
  const spellBox = (
    <div className={spellBoxClass}>
      <label className={`${labelClass} rounded p-2 ${concentrating ? "bg-amber-100 font-semibold text-amber-950" : ""}`}>
        Concentrating on
        <select className={inputClass} value={state.concentration?.abilityId ?? ""} onChange={(e) => chooseConcentration(e.target.value)}>
          <option value="">Nothing</option>
          {concentrationChoices.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {Object.keys(slots).length > 0 && (
        <Section title="Spell slots">
          {Object.entries(slots).map(([level, max]) => (
            <Counter
              key={level}
              label={`Level ${level}`}
              value={counter(state.slots, level, "slot level")}
              max={max}
              onChange={(n) => onChange(setSlots(tracker, Number(level), n))}
            />
          ))}
        </Section>
      )}
      {trackedSpells.length > 0 && <Section title="Daily spells">{trackedSpells.map((a) => <div key={a.id}>{liveControls(a)}</div>)}</Section>}
    </div>
  );

  function sectionExtra(title: StatblockSection["title"]): ReactNode {
    if (title === "Traits" && legendaryResistance > 0) {
      return (
        <Live>
          <Counter
            label="Legendary Resistance"
            value={state.legendaryResistanceLeft}
            max={legendaryResistance}
            onChange={(resistance) => onChange(setLegendary(tracker, { resistance }))}
          />
        </Live>
      );
    }
    if (title === "Legendary Actions" && legendaryActions > 0) {
      return (
        <Live>
          <Counter
            label="Legendary actions"
            value={state.legendaryActionsLeft}
            max={legendaryActions}
            onChange={(actions) => onChange(setLegendary(tracker, { actions }))}
          />
        </Live>
      );
    }
    return null;
  }

  return (
    <Panel
      title="Monster"
      accent="monster"
      actions={
        <>
          <span className="flex items-center">
            <Badge>Round {state.round}</Badge>
          </span>
          <Button variant="primary" onClick={start}>
            Start turn
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {rolls !== null && (
          <div role="status" className="rounded bg-(--accent-soft) p-2 text-sm">
            <p className="font-semibold">Round {state.round} started.</p>
            {legendaryActions > 0 && <p>Legendary actions back to {legendaryActions}.</p>}
            {settings.rechargeMode === "manual" ? (
              hasRecharge && <p>Recharge is manual: set each ability in the statblock.</p>
            ) : rolls.length > 0 ? (
              <ul>
                {rolls.map((r) => (
                  <li key={r.abilityId}>
                    {r.name}: rolled {r.roll} (needs {r.min}+), {r.recharged ? "recharged" : "still spent"}
                  </li>
                ))}
              </ul>
            ) : (
              hasRecharge && <p>Nothing to recharge.</p>
            )}
          </div>
        )}

        {/* Closed by default so the statblock starts higher; the summary still shows every current value. */}
        <section aria-label="Settings" className="@container rounded-md border border-(--accent-line)">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="text-(--accent-strong) transition-transform group-open:rotate-90">
                ▸
              </span>
              <span className="font-semibold text-(--accent-strong)">Settings</span>
              <span className="text-stone-600">
                {TEMPERAMENT_LABELS[settings.temperament]} · Morale {settings.morale} · Recharge {settings.rechargeMode} · Conditions:{" "}
                {state.conditions.length > 0 ? state.conditions.join(", ") : "none"}
              </span>
            </summary>
            <div className="space-y-4 px-3 pb-3">
          <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
            <label className={labelClass}>
              Temperament
              <select className={inputClass} value={settings.temperament} onChange={(e) => chooseTemperament(e.target.value)}>
                {TemperamentSchema.options.map((t) => (
                  <option key={t} value={t}>
                    {t === suggested ? `${TEMPERAMENT_LABELS[t]} (suggested for INT ${reviewed.intScore})` : TEMPERAMENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <label htmlFor={moraleId}>Morale</label>
                <output htmlFor={moraleId} className="tabular-nums">
                  {settings.morale}
                </output>
              </div>
              <input
                id={moraleId}
                type="range"
                min={0}
                max={100}
                step={1}
                className="min-h-11 w-full accent-(--accent)"
                value={settings.morale}
                onChange={(e) => onChange(setSettings(tracker, { morale: Number(e.target.value) }))}
              />
              <div className="flex justify-between text-xs text-stone-600">
                <span>Cowardly</span>
                <span>Fanatical</span>
              </div>
            </div>
          </div>

          <div role="group" aria-label="Recharge mode" className="flex items-center gap-2 text-sm">
            <span className="mr-auto">Recharge</span>
            <ToggleChip pressed={settings.rechargeMode === "auto"} onToggle={() => chooseRechargeMode("auto")}>
              Auto
            </ToggleChip>
            <ToggleChip pressed={settings.rechargeMode === "manual"} onToggle={() => chooseRechargeMode("manual")}>
              Manual
            </ToggleChip>
          </div>

          <div role="group" aria-label="Conditions" className="space-y-1">
            <p className="text-sm">Conditions: {state.conditions.length > 0 ? state.conditions.join(", ") : "none"}</p>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <ToggleChip key={c} pressed={state.conditions.includes(c)} onToggle={(on) => onChange(setConditions(tracker, toggled(state.conditions, c, on)))}>
                  {c}
                </ToggleChip>
              ))}
            </div>
          </div>
            </div>
          </details>
        </section>

        <MonsterStatblock
          reviewed={reviewed}
          name={tracker.name}
          hitPoints={
            <>
              <span className="font-bold">Hit Points</span>
              <NumberField className="w-24" label="HP" hideLabel value={state.hp} onChange={(hp) => onChange(setHp(tracker, hp))} />
              <span>/ {state.hpMax}</span>
            </>
          }
          abilityExtra={liveControls}
          spellcasting={spellBox}
          sectionExtra={sectionExtra}
        />
      </div>
    </Panel>
  );
}

/** A remaining-uses counter from the state. Its absence means the state doesn't match the statblock, so it throws. */
function counter(counters: Readonly<Record<string, number>>, key: string, what: string): number {
  const value = counters[key];
  if (value === undefined) throw new Error(`EncounterTracker: the state has no counter for ${what} "${key}"`);
  return value;
}

/** A live control set into the statblock text, boxed so it reads as the tracker's, not the book's. */
function Live({ children }: { children: ReactNode }) {
  return <div className="mt-1 rounded border border-[#7a200d]/30 bg-white/60 px-2 py-1">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-semibold text-(--accent-strong)">{title}</h4>
      {children}
    </section>
  );
}

/** "− 2 / 3 +": steps a counter by one, disabled at 0 and at its max. */
function Counter({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Button aria-label={`${label}: use one`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          −
        </Button>
        <span className="w-14 text-center tabular-nums">
          {value} / {max}
        </span>
        <Button aria-label={`${label}: restore one`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}
