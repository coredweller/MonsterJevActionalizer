"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { syncSituation, updatePlayerTurn } from "@/lib/encounter/state";
import { SituationSchema, type Player, type Situation } from "@/lib/encounter/types";
import { log } from "@/lib/log";
import { PlayerRow } from "./PlayerRow";
import { Button, CheckboxField, NumberField, Panel, inputClass, labelClass } from "./ui";

type TerrainFlag = keyof Situation["terrain"];
const TERRAIN_FLAGS = SituationSchema.shape.terrain.keyof().options;
const TERRAIN_LABEL: Record<TerrainFlag, string> = {
  difficult: "Difficult terrain",
  chokepoint: "Chokepoint",
  escapeRoute: "Escape route",
  flyingPossible: "Flying not possible",
};
/** Flags whose checkbox means the opposite: flying is assumed possible, so the DM ticks to rule it out. */
const INVERTED: ReadonlySet<TerrainFlag> = new Set(["flyingPossible"]);

/**
 * This turn's situation, split over two page columns: "Players this turn" (one row per roster
 * player), then "Battlefield" (allies, terrain, notes and Recommend) with `children` under it in the
 * same column, so the recommendation sits right below the button that asks for it. Renders the two
 * columns as a fragment, for the page's grid.
 *
 * Controlled: `situation` is the tracker's carried-over situation and every edit emits the whole new
 * one through `onChange` (the caller saves it on the tracker, so the draft survives a reload or a
 * tracker switch). Rows always follow the roster via `syncSituation`, so what is emitted validates
 * against `SituationSchema` even before the caller re-syncs. Each panel is its own <form>, and
 * Recommend checks both, so a number field showing an error in either one blocks it.
 */
export function SituationForm({
  roster,
  situation,
  onChange,
  onRecommend,
  pending = false,
  children,
}: {
  roster: readonly Player[];
  situation: Situation;
  onChange: (situation: Situation) => void;
  onRecommend: (situation: Situation) => void;
  /** True while a recommendation request is in flight; disables "Recommend" so it isn't sent twice. */
  pending?: boolean;
  /** Shown under the Battlefield panel, in its column. */
  children?: ReactNode;
}) {
  const synced = useMemo(() => syncSituation(situation, roster), [situation, roster]);
  const [error, setError] = useState<string | null>(null);
  const playersForm = useRef<HTMLFormElement>(null);
  const battlefieldForm = useRef<HTMLFormElement>(null);

  function emit(next: Situation) {
    setError(null);
    onChange(next);
  }

  function setAlliesPresent(present: boolean) {
    // A count with nobody present (or nobody counted while present) would contradict itself in Jev's state.
    emit({ ...synced, allies: { present, count: present ? Math.max(1, synced.allies.count) : 0 } });
  }

  // Either form can be submitted (the button, or Enter in a field), so both are checked whichever it was.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (![playersForm.current, battlefieldForm.current].every((form) => form === null || form.reportValidity())) return;
    const parsed = SituationSchema.safeParse(synced);
    if (!parsed.success) {
      log.error("situation.invalid", { issues: parsed.error.issues.length, paths: parsed.error.issues.map((i) => i.path.join(".")).join(",") });
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    onRecommend(parsed.data);
  }

  return (
    <>
      <div className="min-w-0">
        <Panel title="Players this turn" accent="party">
          <form ref={playersForm} className="space-y-3" onSubmit={submit}>
            {roster.length === 0 ? (
              <p className="text-sm text-stone-500">No players yet. Add them under Party, in the trackers sidebar.</p>
            ) : (
              roster.map((player) => {
                const turn = synced.players.find((t) => t.playerId === player.id);
                if (!turn) throw new Error(`SituationForm: no situation row for player "${player.id}" after syncing`);
                return (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    turn={turn}
                    others={roster.filter((o) => o.id !== player.id)}
                    onChange={(next) => emit(updatePlayerTurn(synced, next))}
                  />
                );
              })
            )}
          </form>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel title="Battlefield" accent="situation">
          <form ref={battlefieldForm} className="space-y-4" onSubmit={submit}>
            <fieldset className="min-w-0">
              <legend className="mb-1 font-semibold text-(--accent-strong)">Allies</legend>
              <div className="flex flex-wrap items-end gap-3">
                <CheckboxField label="Allies present" checked={synced.allies.present} onChange={setAlliesPresent} />
                <NumberField
                  className="w-28"
                  label="How many"
                  value={synced.allies.count}
                  disabled={!synced.allies.present}
                  onChange={(count) => emit({ ...synced, allies: { ...synced.allies, count } })}
                />
              </div>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="mb-1 font-semibold text-(--accent-strong)">Terrain</legend>
              <div className="flex flex-wrap gap-x-4">
                {TERRAIN_FLAGS.map((flag) => (
                  <CheckboxField
                    key={flag}
                    label={TERRAIN_LABEL[flag]}
                    checked={INVERTED.has(flag) ? !synced.terrain[flag] : synced.terrain[flag]}
                    onChange={(ticked) => emit({ ...synced, terrain: { ...synced.terrain, [flag]: INVERTED.has(flag) ? !ticked : ticked } })}
                  />
                ))}
              </div>
            </fieldset>

            <label className={labelClass}>
              DM notes
              <textarea className={`${inputClass} min-h-20 py-2`} value={synced.notes} onChange={(e) => emit({ ...synced, notes: e.target.value })} />
            </label>

            {error && (
              <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full md:w-auto" disabled={pending}>
              {pending ? "Recommending…" : "Recommend"}
            </Button>
          </form>
        </Panel>
        {children}
      </div>
    </>
  );
}
