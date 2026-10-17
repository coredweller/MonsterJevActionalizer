"use client";

import { MOVEMENT_LABELS } from "@/lib/decide/explain";
import { recordResult } from "@/lib/encounter/state";
import { TurnResultSchema, type Player, type TurnLogEntry, type TurnResult, type Tracker } from "@/lib/encounter/types";
import { Badge, Panel, ToggleChip, inputClass, labelClass } from "./ui";

const RESULT_LABEL: Record<TurnResult, string> = { hit: "Hit", miss: "Miss", downed: "Downed", effect: "Effect" };

/** Target names; a player since removed from the roster stays in the log as "removed player". */
function targetNames(ids: readonly string[], roster: readonly Player[]): string {
  return ids
    .map((id) => {
      const player = roster.find((p) => p.id === id);
      return player === undefined ? "removed player" : player.name || "Unnamed player";
    })
    .join(", ");
}

/** "Fireball (level 3 slot) → group: Ann, Bo" */
function describePart(name: string, targetIds: readonly string[], slotLevel: number | undefined, group: boolean, roster: readonly Player[]): string {
  const slot = slotLevel === undefined ? "" : ` (level ${slotLevel} slot)`;
  const targets = targetIds.length === 0 ? "" : ` → ${group ? "group: " : ""}${targetNames(targetIds, roster)}`;
  return `${name}${slot}${targets}`;
}

/**
 * The tracker's turn log, newest first. Controlled: picking a result or typing a note emits the
 * whole new tracker through `recordResult`, which the caller saves. Pressing the picked result
 * again clears it.
 */
export function TurnLog({ tracker, onChange }: { tracker: Tracker; onChange: (tracker: Tracker) => void }) {
  const { log, roster } = tracker;
  // Newest first, keeping each entry's index in the log for `recordResult`.
  const newestFirst = log.map((entry, i) => ({ entry, i })).reverse();

  return (
    <Panel title="Turn log" accent="monster">
      {log.length === 0 ? (
        <p className="text-sm text-stone-500">No turns yet. Applied turns show here.</p>
      ) : (
        <ol className="space-y-3">
          {newestFirst.map(({ entry, i }) => (
            <li key={i}>
              <Entry entry={entry} roster={roster} onRecord={(result, note) => onChange(recordResult(tracker, i, result, note))} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Entry({
  entry,
  roster,
  onRecord,
}: {
  entry: TurnLogEntry;
  roster: readonly Player[];
  onRecord: (result: TurnResult | undefined, note?: string) => void;
}) {
  const action = entry.actionId === null ? "No action" : describePart(entry.actionName, entry.targetIds, entry.slotLevel, entry.clusterId !== undefined, roster);

  return (
    <article className="rounded-md border border-(--accent-line) p-3 text-sm">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-(--accent-strong)">Round {entry.round}</h3>
        {entry.recommended ? <Badge tone="green">Recommended</Badge> : <Badge tone="amber">Overridden</Badge>}
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt className="text-stone-600">Action</dt>
        <dd>{action}</dd>
        {entry.bonusActionId !== null && (
          <>
            <dt className="text-stone-600">Bonus</dt>
            <dd>{describePart(entry.bonusActionName, entry.bonusTargetIds, entry.bonusSlotLevel, false, roster)}</dd>
          </>
        )}
        <dt className="text-stone-600">Move</dt>
        <dd>
          {MOVEMENT_LABELS[entry.moveBefore]}, then {MOVEMENT_LABELS[entry.moveAfter]}
        </dd>
      </dl>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Result for round ${entry.round}`}>
        {TurnResultSchema.options.map((r) => (
          <ToggleChip key={r} pressed={entry.result === r} onToggle={(on) => onRecord(on ? r : undefined)}>
            {RESULT_LABEL[r]}
          </ToggleChip>
        ))}
      </div>
      <label className={`${labelClass} mt-2`}>
        Note
        <input className={inputClass} value={entry.note ?? ""} placeholder="Optional" onChange={(e) => onRecord(entry.result, e.target.value)} />
      </label>
    </article>
  );
}
