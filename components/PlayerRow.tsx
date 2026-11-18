"use client";

import { useId, useState } from "react";
import { setDistance, setZone } from "@/lib/encounter/state";
import {
  ApparentHpSchema,
  CONDITIONS,
  ConditionSchema,
  PlayerTurnSchema,
  ZONE_DEFAULT_FT,
  ZoneSchema,
  type ApparentHp,
  type Condition,
  type Player,
  type PlayerTurn,
  type Zone,
} from "@/lib/encounter/types";
import { NumberField, ToggleChip, inputClass, toggled } from "./ui";

const CoverSchema = PlayerTurnSchema.shape.cover;
type Cover = PlayerTurn["cover"];

const ZONE_NAME: Record<Zone, string> = { engaged: "Engaged", near: "Near", far: "Far", veryFar: "Very far" };
const HP_LABEL: Record<ApparentHp, string> = { healthy: "Healthy", bloodied: "Bloodied", nearDown: "Near down", down: "Down" };
// Short so HP, Cover and Hit you fit beside the name in the narrow column.
const COVER_LABEL: Record<Cover, string> = { none: "None", half: "Half", threeQuarters: "¾", total: "Full" };

/**
 * Each condition's chip colour: a light tint, a stronger border and dark text of one hue, all over 4.5:1.
 * The chip always shows the name, so the colour is a second cue, not the only one. Whole class names, so
 * Tailwind sees them.
 */
const CONDITION_CHIP: Record<Condition, { label: string; className: string }> = {
  blinded: { label: "Blinded", className: "border-indigo-300 bg-indigo-100 text-indigo-900" },
  charmed: { label: "Charmed", className: "border-pink-300 bg-pink-100 text-pink-900" },
  deafened: { label: "Deafened", className: "border-sky-300 bg-sky-100 text-sky-900" },
  exhaustion: { label: "Exhaustion", className: "border-rose-300 bg-rose-100 text-rose-900" },
  frightened: { label: "Frightened", className: "border-violet-300 bg-violet-100 text-violet-900" },
  grappled: { label: "Grappled", className: "border-orange-300 bg-orange-100 text-orange-900" },
  incapacitated: { label: "Incapacitated", className: "border-red-300 bg-red-100 text-red-900" },
  invisible: { label: "Invisible", className: "border-cyan-300 bg-cyan-100 text-cyan-900" },
  paralyzed: { label: "Paralyzed", className: "border-yellow-300 bg-yellow-100 text-yellow-900" },
  petrified: { label: "Petrified", className: "border-stone-400 bg-stone-200 text-stone-900" },
  poisoned: { label: "Poisoned", className: "border-lime-300 bg-lime-100 text-lime-900" },
  prone: { label: "Prone", className: "border-amber-300 bg-amber-100 text-amber-900" },
  restrained: { label: "Restrained", className: "border-teal-300 bg-teal-100 text-teal-900" },
  stunned: { label: "Stunned", className: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900" },
  unconscious: { label: "Unconscious", className: "border-blue-300 bg-blue-100 text-blue-900" },
};

/** Conditions are free strings in the data model; a carried-over non-standard one gets a neutral chip. */
function conditionChip(condition: string): { label: string; className: string } {
  const known = ConditionSchema.safeParse(condition);
  return known.success ? CONDITION_CHIP[known.data] : { label: condition, className: "border-stone-400 bg-white text-stone-800" };
}

const captionClass = "block text-[11px] font-semibold leading-4 text-stone-600";

/**
 * One player's turn details, collapsible. Line 1 (name and AC, HP, Cover, Hit you) always shows;
 * open adds the zone strip with exact feet, conditions as removable chips, and "with" toggles.
 * Emits the whole updated turn; the caller keeps "clustered with" symmetric (see `updatePlayerTurn`),
 * so ticking a player here also ticks this one on their row.
 */
export function PlayerRow({
  player,
  turn,
  others,
  onChange,
}: {
  player: Player;
  turn: PlayerTurn;
  /** The other roster players, offered for "with". */
  others: readonly Player[];
  onChange: (turn: PlayerTurn) => void;
}) {
  const [open, setOpen] = useState(true);
  const zoneId = useId();
  const conditionsId = useId();
  const withId = useId();
  const set = (patch: Partial<Omit<PlayerTurn, "playerId">>) => onChange({ ...turn, ...patch });
  const name = player.name || "Unnamed player";
  const unpicked = CONDITIONS.filter((c) => !turn.conditions.includes(c));

  function addCondition(value: string) {
    // "Pick one" is the select's resting value, so choosing it adds nothing.
    if (value === "") return;
    set({ conditions: [...turn.conditions, ConditionSchema.parse(value)] });
  }

  return (
    <article aria-label={name} className={`flex min-w-0 flex-col gap-1.5 rounded-md border border-(--accent-line) px-2 pt-1 ${open ? "pb-2" : "pb-1"}`}>
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 text-left hover:bg-(--accent-soft)"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span aria-hidden="true" className={`shrink-0 text-xs text-(--accent-strong) transition-transform ${open ? "rotate-90" : ""}`}>
            ▸
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-(--accent-strong)">{name}</span>
            <span className="block text-xs text-stone-600">
              AC {player.ac ?? "?"}
              {!open && ` · ${ZONE_NAME[turn.zone]}`}
            </span>
          </span>
        </button>
        <label className="flex w-24 shrink-0 flex-col">
          <span className={captionClass}>HP</span>
          <select className={inputClass} value={turn.apparentHp} onChange={(e) => set({ apparentHp: ApparentHpSchema.parse(e.target.value) })}>
            {ApparentHpSchema.options.map((h) => (
              <option key={h} value={h}>
                {HP_LABEL[h]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[4.5rem] shrink-0 flex-col">
          <span className={captionClass}>Cover</span>
          <select className={inputClass} value={turn.cover} onChange={(e) => set({ cover: CoverSchema.parse(e.target.value) })}>
            {CoverSchema.options.map((c) => (
              <option key={c} value={c}>
                {COVER_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-11 shrink-0 flex-col items-center">
          <span className={captionClass}>Hit you</span>
          <span className="flex min-h-11 items-center">
            <input
              type="checkbox"
              className="size-5"
              checked={turn.hitMonsterLastRound}
              onChange={(e) => set({ hitMonsterLastRound: e.target.checked })}
            />
          </span>
        </label>
      </div>

      {open && (
        <>
          <div>
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <span id={zoneId} className={captionClass}>
                  Zone
                </span>
                <div role="group" aria-labelledby={zoneId} className="grid grid-cols-4 overflow-hidden rounded-md border border-(--accent)">
                  {ZoneSchema.options.map((z, i) => {
                    const picked = turn.zone === z;
                    return (
                      <button
                        key={z}
                        type="button"
                        aria-pressed={picked}
                        className={`min-h-11 min-w-0 px-0.5 text-xs font-semibold ${i > 0 ? "border-l border-(--accent-line)" : ""} ${picked ? "bg-(--accent) text-white" : "bg-white text-(--accent-strong) hover:bg-(--accent-soft)"}`}
                        onClick={() => onChange(setZone(turn, z))}
                      >
                        {ZONE_NAME[z]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="w-16 shrink-0">
                <span aria-hidden="true" className={captionClass}>
                  Exact ft.
                </span>
                <NumberField
                  label="Exact ft."
                  hideLabel
                  digitsOnly
                  optional
                  value={turn.distanceFt}
                  placeholder={`${ZONE_DEFAULT_FT[turn.zone]}`}
                  onChange={(ft) => onChange(setDistance(turn, ft))}
                />
              </div>
            </div>
          </div>

          <div>
            <span id={conditionsId} className={captionClass}>
              Conditions
            </span>
            <div className="flex items-center gap-1.5">
              {/* The width is on a wrapper: inputClass is w-full, which would win over a width on the select itself. */}
              <div className="w-[5.625rem] shrink-0">
                <select aria-labelledby={conditionsId} className={inputClass} value="" onChange={(e) => addCondition(e.target.value)}>
                  <option value="">Pick one</option>
                  {unpicked.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_CHIP[c].label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Three columns of two rows sit beside the select, so six conditions fit without growing the row. */}
              {turn.conditions.length > 0 && (
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-0.5">
                  {turn.conditions.map((c) => {
                    const chip = conditionChip(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        title={chip.label}
                        aria-label={`Remove ${chip.label}`}
                        className={`flex h-[21px] min-w-0 items-center justify-between gap-0.5 rounded-full border pr-[3px] pl-[5px] text-[11px] font-semibold hover:brightness-95 ${chip.className}`}
                        onClick={() => set({ conditions: turn.conditions.filter((x) => x !== c) })}
                      >
                        <span className="truncate">{chip.label}</span>
                        <svg aria-hidden="true" className="size-2 shrink-0" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M2 2l6 6M8 2l-6 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {others.length > 0 && (
            <div role="group" aria-labelledby={withId} className="flex flex-wrap items-center gap-1.5">
              <span id={withId} className={`${captionClass} w-8`}>
                With
              </span>
              {others.map((o) => (
                <ToggleChip
                  key={o.id}
                  pressed={turn.clusteredWith.includes(o.id)}
                  onToggle={(on) => set({ clusteredWith: toggled(turn.clusteredWith, o.id, on) })}
                >
                  {o.name || "Unnamed player"}
                </ToggleChip>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}
