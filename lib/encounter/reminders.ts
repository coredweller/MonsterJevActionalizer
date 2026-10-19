/**
 * Reminder cards (data-model.md "Reminders"): read-only, never decided. Plain types, not zod,
 * since they are built from a tracker and never parsed from storage or the wire.
 */
import { legendaryActionMax } from "./state";
import type { Tracker } from "./types";

export interface ReminderEntry {
  readonly name: string;
  readonly text: string;
}

export type Reminder =
  | { readonly kind: "legendary"; readonly left: number; readonly max: number; readonly options: readonly ReminderEntry[] }
  | { readonly kind: "reactions"; readonly entries: readonly ReminderEntry[] }
  | { readonly kind: "lair"; readonly initiative: 20; readonly entries: readonly ReminderEntry[] };

/** A statblock record as entries, in record order and verbatim. */
const entriesOf = (record: Readonly<Record<string, string>>): ReminderEntry[] => Object.entries(record).map(([name, text]) => ({ name, text }));

/** Cards in the order legendary, reactions, lair; a card with nothing to list is left out. The legendary card stays at 0 left. */
export function buildReminders(tracker: Tracker): Reminder[] {
  const { reviewed, state } = tracker;
  const { monster } = reviewed;
  const out: Reminder[] = [];
  const options = monster.kind === "legendary" ? entriesOf(monster.body.LegendaryActions.Options) : [];
  if (options.length > 0) out.push({ kind: "legendary", left: state.legendaryActionsLeft, max: legendaryActionMax(reviewed), options });
  const reactions = reviewed.abilities.filter((a) => a.source === "Reactions" || a.category === "reaction").map((a) => ({ name: a.name, text: a.raw }));
  if (reactions.length > 0) out.push({ kind: "reactions", entries: reactions });
  const lair = monster.kind === "legendary" ? entriesOf(monster.body.LairActions) : [];
  if (lair.length > 0) out.push({ kind: "lair", initiative: 20, entries: lair });
  return out;
}
