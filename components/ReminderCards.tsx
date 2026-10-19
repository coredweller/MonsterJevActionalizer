"use client";

import { buildReminders, type Reminder, type ReminderEntry } from "@/lib/encounter/reminders";
import type { Tracker } from "@/lib/encounter/types";
import { Badge, Panel } from "./ui";

/**
 * Read-only reminders for the selected tracker: legendary actions, reactions and lair actions, with
 * their full rule text. Shown from round 1 whether or not Start turn was pressed. Nothing here is
 * decided or edited; the legendary counter is edited in EncounterTracker and only reflected here.
 * Renders nothing when there is nothing to remind.
 */
export function ReminderCards({ tracker }: { tracker: Tracker }) {
  const reminders = buildReminders(tracker);
  if (reminders.length === 0) return null;
  return (
    // Panel's section takes no label, so the wrapper names the region.
    <div role="region" aria-label="Reminders">
      <Panel title="Reminders" accent="monster">
        <div className="space-y-4">
          {reminders.map((reminder) => (
            <Card key={reminder.kind} reminder={reminder} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Card({ reminder }: { reminder: Reminder }) {
  switch (reminder.kind) {
    case "legendary":
      return (
        <section className="space-y-1">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <Heading>Legendary actions</Heading>
            <Badge>
              {reminder.left} / {reminder.max} left
            </Badge>
          </header>
          <Entries entries={reminder.options} />
        </section>
      );
    case "reactions":
      return (
        <section className="space-y-1">
          <Heading>Reactions</Heading>
          <Entries entries={reminder.entries} />
        </section>
      );
    case "lair":
      return (
        <section className="space-y-1">
          <Heading>Lair actions</Heading>
          <p className="text-xs text-stone-600">On initiative count {reminder.initiative} (losing ties)</p>
          <Entries entries={reminder.entries} />
        </section>
      );
    default: {
      const unreachable: never = reminder;
      return unreachable;
    }
  }
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-sm font-semibold text-(--accent-strong)">{children}</h3>;
}

/** Name on its own line, then the rule text in full: the DM needs the exact wording, so nothing is cut. */
function Entries({ entries }: { entries: readonly ReminderEntry[] }) {
  return (
    <dl className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.name}>
          <dt className="text-sm font-semibold">{entry.name}</dt>
          <dd className="text-xs whitespace-pre-line text-stone-600">{entry.text}</dd>
        </div>
      ))}
    </dl>
  );
}
