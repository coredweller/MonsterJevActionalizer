"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { syncSituation, updatePlayerTurn } from "@/lib/encounter/state";
import { SituationSchema, type Player, type Situation } from "@/lib/encounter/types";
import { log } from "@/lib/log";
import { PlayerRow } from "./PlayerRow";
import { Button, InfoTip, Panel, ToggleChip, inputClass, labelClass } from "./ui";

type TerrainFlag = keyof Situation["terrain"];
const TERRAIN_FLAGS = SituationSchema.shape.terrain.keyof().options;
const TERRAIN_LABEL: Record<TerrainFlag, string> = {
  difficult: "Difficult terrain",
  chokepoint: "Chokepoint",
  escapeRoute: "Escape route",
  flyingPossible: "No flying",
};
/** Flags whose chip means the opposite: flying is assumed possible, so the DM presses "No flying" to rule it out. */
const INVERTED: ReadonlySet<TerrainFlag> = new Set(["flyingPossible"]);

// What each field does to the recommendation. Difficult terrain and flying change what the code allows;
// the rest only inform the advisor's choice among the options the code allows.
const TERRAIN_TIP: Record<TerrainFlag, string> = {
  difficult: "Halves the monster's walking, climbing, burrowing and swimming speeds. Its fly speed isn't affected.",
  chokepoint: "A narrow spot, like a doorway or bridge, that the monster could hold or fight through. It doesn't change how far it can move.",
  escapeRoute: "The monster has a clear way out. If it's cowardly or badly hurt, it's likelier to retreat.",
  flyingPossible: "Turn on when the monster can't fly here, like under a low ceiling. Its fly speed is ignored and 'Fly up' isn't offered.",
};
const ALLIES_TIP = "Creatures fighting on the monster's side. With help nearby, it's likelier to press the attack than flee.";
const NOTES_TIP =
  "Short facts the advisor weighs, like 'it guards the altar'. They steer its choice but can't add options, and carry over to the next turn.";

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
  const notesId = useId();
  const alliesId = useId();
  // The stepper's 0 is "no allies", so a stale count left from before can't show while nobody is present.
  const allyCount = synced.allies.present ? synced.allies.count : 0;

  function emit(next: Situation) {
    setError(null);
    onChange(next);
  }

  function setAllyCount(count: number) {
    // Present follows the count, so the two can't contradict each other in Jev's state.
    emit({ ...synced, allies: { present: count > 0, count } });
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
          <form ref={battlefieldForm} className="space-y-3" onSubmit={submit}>
            <div className="relative flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold text-(--accent-strong)">
                <span id={alliesId}>Allies</span>
                <InfoTip label="Allies">{ALLIES_TIP}</InfoTip>
              </span>
              <div role="group" aria-labelledby={alliesId} className="inline-flex overflow-hidden rounded-md border border-(--accent)">
                <Button
                  variant="ghost"
                  className="rounded-none bg-(--accent-soft) disabled:text-stone-400"
                  aria-label="One fewer ally"
                  disabled={allyCount === 0}
                  onClick={() => setAllyCount(allyCount - 1)}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 7h8" />
                  </svg>
                </Button>
                <output aria-live="polite" className="flex w-12 items-center justify-center border-x border-(--accent-line) text-sm font-semibold">
                  {allyCount}
                </output>
                <Button variant="ghost" className="rounded-none bg-(--accent-soft)" aria-label="One more ally" onClick={() => setAllyCount(allyCount + 1)}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 7h8M7 3v8" />
                  </svg>
                </Button>
              </div>
            </div>

            <fieldset className="relative min-w-0">
              <legend className="mb-1 font-semibold text-(--accent-strong)">Terrain</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {TERRAIN_FLAGS.map((flag) => (
                  // The tip overlaps the chip's right edge by a negative margin, not by positioning, so its
                  // tooltip anchors to the fieldset and opens full width under the grid. It's a sibling,
                  // not inside the chip, so tapping it doesn't press the chip.
                  <div key={flag} className="flex items-center">
                    <ToggleChip
                      className="flex-1 pr-8"
                      pressed={INVERTED.has(flag) ? !synced.terrain[flag] : synced.terrain[flag]}
                      onToggle={(pressed) => emit({ ...synced, terrain: { ...synced.terrain, [flag]: INVERTED.has(flag) ? !pressed : pressed } })}
                    >
                      {TERRAIN_LABEL[flag]}
                    </ToggleChip>
                    <span className="-ml-7 flex">
                      <InfoTip label={TERRAIN_LABEL[flag]}>{TERRAIN_TIP[flag]}</InfoTip>
                    </span>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className={labelClass}>
              <div className="relative flex items-center gap-2">
                <label htmlFor={notesId}>DM notes</label>
                <InfoTip label="DM notes">{NOTES_TIP}</InfoTip>
              </div>
              <textarea
                id={notesId}
                rows={2}
                className={`${inputClass} min-h-14 py-2`}
                value={synced.notes}
                onChange={(e) => emit({ ...synced, notes: e.target.value })}
              />
            </div>

            {error && (
              <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Recommending…" : "Recommend"}
            </Button>
          </form>
        </Panel>
        {children}
      </div>
    </>
  );
}
