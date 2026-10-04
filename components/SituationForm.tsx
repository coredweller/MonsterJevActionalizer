"use client";

import { useMemo, useState, type FormEvent } from "react";
import { syncSituation, updatePlayerTurn } from "@/lib/encounter/state";
import { SituationSchema, type Player, type Situation } from "@/lib/encounter/types";
import { PlayerRow } from "./PlayerRow";
import { Button, CheckboxField, NumberField, Panel, inputClass, labelClass } from "./ui";

type TerrainFlag = keyof Situation["terrain"];
const TERRAIN_FLAGS = SituationSchema.shape.terrain.keyof().options;
const TERRAIN_LABEL: Record<TerrainFlag, string> = {
  difficult: "Difficult terrain",
  chokepoint: "Chokepoint",
  escapeRoute: "Escape route",
  flyingPossible: "Flying possible",
};

/**
 * This turn's situation. Controlled: `situation` is the tracker's carried-over situation and every
 * edit emits the whole new one through `onChange` (the caller saves it on the tracker, so the
 * draft survives a reload or a tracker switch). Rows always follow the roster via `syncSituation`,
 * so what is emitted validates against `SituationSchema` even before the caller re-syncs.
 * "Recommend" submits the form: the browser blocks it while a number field shows an error.
 */
export function SituationForm({
  roster,
  situation,
  onChange,
  onRecommend,
  pending = false,
}: {
  roster: readonly Player[];
  situation: Situation;
  onChange: (situation: Situation) => void;
  onRecommend: (situation: Situation) => void;
  /** True while a recommendation request is in flight; disables "Recommend" so it isn't sent twice. */
  pending?: boolean;
}) {
  const synced = useMemo(() => syncSituation(situation, roster), [situation, roster]);
  const [error, setError] = useState<string | null>(null);

  function emit(next: Situation) {
    setError(null);
    onChange(next);
  }

  function setAlliesPresent(present: boolean) {
    // A count with nobody present (or nobody counted while present) would contradict itself in Jev's state.
    emit({ ...synced, allies: { present, count: present ? Math.max(1, synced.allies.count) : 0 } });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = SituationSchema.safeParse(synced);
    if (!parsed.success) {
      console.error("SituationForm: situation failed validation", parsed.error.issues);
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    onRecommend(parsed.data);
  }

  return (
    <Panel title="Situation">
      <form className="space-y-4" onSubmit={submit}>
        {roster.length === 0 ? (
          <p className="text-sm text-stone-500">No players yet. Add them to the party to say where they are.</p>
        ) : (
          <div className="space-y-3">
            {roster.map((player) => {
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
            })}
          </div>
        )}

        <fieldset className="min-w-0">
          <legend className="mb-1 font-medium">Allies</legend>
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
          <legend className="mb-1 font-medium">Terrain</legend>
          <div className="flex flex-wrap gap-x-4">
            {TERRAIN_FLAGS.map((flag) => (
              <CheckboxField
                key={flag}
                label={TERRAIN_LABEL[flag]}
                checked={synced.terrain[flag]}
                onChange={(on) => emit({ ...synced, terrain: { ...synced.terrain, [flag]: on } })}
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
  );
}
