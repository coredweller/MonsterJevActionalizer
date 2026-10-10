"use client";

import { PlayerSchema, type Player } from "@/lib/encounter/types";
import { Button, NumberField, Panel, inputClass, labelClass } from "./ui";

const RoleSchema = PlayerSchema.shape.role;
type Role = Player["role"];
const ROLE_LABEL: Record<Role, string> = { melee: "Melee", ranged: "Ranged", caster: "Caster", healer: "Healer" };

/**
 * The tracker's party roster. Controlled: every edit emits the whole new roster, which the caller
 * saves on the tracker. Removing a player asks first, then drops their situation row when the
 * situation is next synced with the roster (`syncSituation`).
 */
export function PartyRoster({ roster, onChange }: { roster: readonly Player[]; onChange: (roster: Player[]) => void }) {
  function update(next: Player) {
    onChange(roster.map((p) => (p.id === next.id ? next : p)));
  }

  function add() {
    onChange([...roster, { id: crypto.randomUUID(), name: `Player ${roster.length + 1}`, role: "melee", class: "" }]);
  }

  function remove(player: Player) {
    const name = player.name || "this unnamed player";
    if (!window.confirm(`Remove ${name}? Their zone, HP, conditions and groups in the current situation go too.`)) return;
    onChange(roster.filter((x) => x.id !== player.id));
  }

  function setAc(player: Player, ac: number | undefined) {
    const { ac: _previous, ...rest } = player;
    update(ac === undefined ? rest : { ...rest, ac });
  }

  return (
    <Panel
      title="Party"
      actions={
        <Button variant="primary" onClick={add}>
          Add player
        </Button>
      }
    >
      {roster.length === 0 ? (
        <p className="text-sm text-stone-500">No players yet.</p>
      ) : (
        <ul className="@container space-y-3">
          {roster.map((p) => (
            <li key={p.id} className="rounded border border-stone-200 p-3">
              {/* One column below md, or whenever the roster's own column is narrow (the page's xl grid). */}
              <div className="grid grid-cols-1 items-start gap-3 md:@xl:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_5rem_auto]">
                <label className={labelClass}>
                  Name
                  <input className={inputClass} value={p.name} onChange={(e) => update({ ...p, name: e.target.value })} />
                </label>
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
                <label className={labelClass}>
                  Class
                  <input className={inputClass} value={p.class} onChange={(e) => update({ ...p, class: e.target.value })} />
                </label>
                <NumberField label="AC" optional value={p.ac} placeholder="?" onChange={(ac) => setAc(p, ac)} />
                <Button
                  variant="danger"
                  className="md:@xl:mt-6"
                  aria-label={`Remove ${p.name || "unnamed player"}`}
                  onClick={() => remove(p)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
