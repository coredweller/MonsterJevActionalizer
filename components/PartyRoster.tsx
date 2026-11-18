"use client";

import { useState } from "react";
import { PlayerSchema, type Player } from "@/lib/encounter/types";
import { Button, NumberField, Panel, inputClass, labelClass } from "./ui";

const RoleSchema = PlayerSchema.shape.role;
type Role = Player["role"];
const ROLE_LABEL: Record<Role, string> = { melee: "Melee", ranged: "Ranged", caster: "Caster", healer: "Healer" };

/** "Caster · Wizard · AC 13": a player's role, then class and AC when known. */
function describePlayer(player: Player): string {
  return [ROLE_LABEL[player.role], player.class, player.ac === undefined ? "" : `AC ${player.ac}`].filter((part) => part !== "").join(" · ");
}

/**
 * The tracker's party roster, in the sidebar under the trackers. Each player is a one-line summary;
 * Edit opens their fields in place, one player at a time. Controlled: every edit emits the whole new
 * roster, which the caller saves on the tracker. Removing a player asks first, then drops their
 * situation row when the situation is next synced with the roster (`syncSituation`).
 */
export function PartyRoster({ roster, onChange }: { roster: readonly Player[]; onChange: (roster: Player[]) => void }) {
  // The player whose fields are open, or null. An id no longer in the roster opens nothing.
  const [editingId, setEditingId] = useState<string | null>(null);

  function update(next: Player) {
    onChange(roster.map((p) => (p.id === next.id ? next : p)));
  }

  function add() {
    const player: Player = { id: crypto.randomUUID(), name: `Player ${roster.length + 1}`, role: "melee", class: "" };
    onChange([...roster, player]);
    setEditingId(player.id);
  }

  function remove(player: Player) {
    const name = player.name || "this unnamed player";
    if (!window.confirm(`Remove ${name}? Their zone, HP, conditions and groups in the current situation go too.`)) return;
    onChange(roster.filter((x) => x.id !== player.id));
    setEditingId(null);
  }

  function setAc(player: Player, ac: number | undefined) {
    const { ac: _previous, ...rest } = player;
    update(ac === undefined ? rest : { ...rest, ac });
  }

  return (
    <Panel title="Party" accent="party">
      <div className="space-y-2">
        {roster.length === 0 ? (
          <p className="text-sm text-stone-500">No players yet.</p>
        ) : (
          <ul className="space-y-2">
            {roster.map((p) => (
              <li key={p.id}>
                {p.id === editingId ? (
                  <div className="space-y-2 rounded-md border border-(--accent) bg-(--accent-soft) p-2">
                    <label className={labelClass}>
                      Name
                      <input className={inputClass} value={p.name} onChange={(e) => update({ ...p, name: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={labelClass}>
                        Role
                        <select className={inputClass} value={p.role} onChange={(e) => update({ ...p, role: RoleSchema.parse(e.target.value) })}>
                          {RoleSchema.options.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <NumberField label="AC" optional value={p.ac} placeholder="?" onChange={(ac) => setAc(p, ac)} />
                    </div>
                    <label className={labelClass}>
                      Class
                      <input className={inputClass} value={p.class} onChange={(e) => update({ ...p, class: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="danger" aria-label={`Remove ${p.name || "unnamed player"}`} onClick={() => remove(p)}>
                        Remove
                      </Button>
                      <Button variant="primary" onClick={() => setEditingId(null)}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1 rounded-md border border-(--accent-line) py-0.5 pl-2">
                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-(--accent-strong)">{p.name || "Unnamed player"}</span>
                      <span className="block text-xs text-stone-600">{describePlayer(p)}</span>
                    </div>
                    <Button variant="ghost" aria-label={`Edit ${p.name || "unnamed player"}`} onClick={() => setEditingId(p.id)}>
                      Edit
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button variant="primary" className="w-full" onClick={add}>
          Add player
        </Button>
      </div>
    </Panel>
  );
}
