"use client";

import { useState, type ReactNode } from "react";
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
  setSlots,
  slotMax,
  startTurn,
} from "@/lib/encounter/state";
import { CONDITIONS, type Tracker } from "@/lib/encounter/types";
import { describeUses } from "@/lib/monster/describe";
import { Badge, Button, NumberField, Panel, ToggleChip, inputClass, labelClass, toggled } from "./ui";

/** The last "Start turn" press, kept so its rolls show until the tracker or round changes. */
interface TurnStart {
  readonly trackerId: string;
  readonly round: number;
  readonly rolls: readonly RechargeRoll[];
}

/**
 * The monster's encounter state, editable by hand. Controlled: every edit goes through a reducer in
 * `lib/encounter/state.ts` and emits the whole new tracker, which the caller saves. Only resources
 * the statblock gives are shown, and the reducers clamp each counter to [0, max].
 */
export function EncounterTracker({ tracker, onChange }: { tracker: Tracker; onChange: (tracker: Tracker) => void }) {
  const { reviewed, state, settings } = tracker;
  const [turnStart, setTurnStart] = useState<TurnStart | null>(null);
  const rolls = turnStart?.trackerId === tracker.id && turnStart.round === state.round ? turnStart.rolls : null;

  const slots = slotMax(reviewed);
  const perDay = perDayMax(reviewed);
  const perDayRows = reviewed.abilities.flatMap((ability) => {
    const max = perDay[ability.id];
    return max === undefined ? [] : [{ ability, max }];
  });
  const rechargeAbilities = reviewed.abilities.filter((a) => a.uses.kind === "recharge");
  const legendaryActions = legendaryActionMax(reviewed);
  const legendaryResistance = legendaryResistanceMax(reviewed);
  // The current concentration stays selectable even if its ability isn't flagged as concentration.
  const concentrationChoices = reviewed.abilities.filter((a) => a.concentration === true || a.id === state.concentration?.abilityId);

  function start() {
    const result = startTurn(tracker, Math.random);
    setTurnStart({ trackerId: result.tracker.id, round: result.tracker.state.round, rolls: result.rolls });
    onChange(result.tracker);
  }

  function chooseConcentration(abilityId: string) {
    const ability = reviewed.abilities.find((a) => a.id === abilityId);
    onChange(setConcentration(tracker, ability ? { abilityId: ability.id, name: ability.name } : null));
  }

  return (
    <Panel
      title={tracker.name}
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
              rechargeAbilities.length > 0 && <p>Recharge is manual: set each ability below.</p>
            ) : rolls.length > 0 ? (
              <ul>
                {rolls.map((r) => (
                  <li key={r.abilityId}>
                    {r.name}: rolled {r.roll} (needs {r.min}+), {r.recharged ? "recharged" : "still spent"}
                  </li>
                ))}
              </ul>
            ) : (
              rechargeAbilities.length > 0 && <p>Nothing to recharge.</p>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <NumberField className="w-28" label="HP" value={state.hp} onChange={(hp) => onChange(setHp(tracker, hp))} />
          <span className="flex min-h-11 items-center text-sm text-stone-600">/ {state.hpMax}</span>
        </div>

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

        {perDayRows.length > 0 && (
          <Section title="Daily uses">
            {perDayRows.map(({ ability, max }) => (
              <Counter
                key={ability.id}
                label={ability.name}
                value={counter(state.perDay, ability.id, "daily-use ability")}
                max={max}
                onChange={(n) => onChange(setPerDay(tracker, ability.id, n))}
              />
            ))}
          </Section>
        )}

        {rechargeAbilities.length > 0 && (
          <Section title="Recharge">
            {rechargeAbilities.map((a) => {
              const available = state.recharge[a.id] === "available";
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    {a.name} <span className="text-stone-600">({describeUses(a.uses)})</span>
                  </span>
                  <ToggleChip pressed={available} onToggle={(on) => onChange(setRecharge(tracker, a.id, on ? "available" : "spent"))}>
                    {available ? "Available" : "Spent"}
                  </ToggleChip>
                </div>
              );
            })}
          </Section>
        )}

        {(legendaryActions > 0 || legendaryResistance > 0) && (
          <Section title="Legendary">
            {legendaryActions > 0 && (
              <Counter
                label="Legendary actions"
                value={state.legendaryActionsLeft}
                max={legendaryActions}
                onChange={(actions) => onChange(setLegendary(tracker, { actions }))}
              />
            )}
            {legendaryResistance > 0 && (
              <Counter
                label="Legendary Resistance"
                value={state.legendaryResistanceLeft}
                max={legendaryResistance}
                onChange={(resistance) => onChange(setLegendary(tracker, { resistance }))}
              />
            )}
          </Section>
        )}

        <label className={labelClass}>
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

        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm">
            Conditions: {state.conditions.length > 0 ? state.conditions.join(", ") : "none"}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <ToggleChip key={c} pressed={state.conditions.includes(c)} onToggle={(on) => onChange(setConditions(tracker, toggled(state.conditions, c, on)))}>
                {c}
              </ToggleChip>
            ))}
          </div>
        </details>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-(--accent-strong)">{title}</h3>
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
