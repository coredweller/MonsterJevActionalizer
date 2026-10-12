"use client";

import { mismatchedZone } from "@/lib/encounter/state";
import {
  ApparentHpSchema,
  CONDITIONS,
  PlayerTurnSchema,
  ZONE_DEFAULT_FT,
  ZoneSchema,
  type ApparentHp,
  type Player,
  type PlayerTurn,
  type Zone,
} from "@/lib/encounter/types";
import { CheckboxField, NumberField, ToggleChip, inputClass, labelClass } from "./ui";

const CoverSchema = PlayerTurnSchema.shape.cover;
type Cover = PlayerTurn["cover"];

const ZONE_LABEL: Record<Zone, string> = {
  engaged: `Engaged (${ZONE_DEFAULT_FT.engaged} ft)`,
  near: `Near (≤ ${ZONE_DEFAULT_FT.near} ft)`,
  far: `Far (≤ ${ZONE_DEFAULT_FT.far} ft)`,
  veryFar: `Very far (> ${ZONE_DEFAULT_FT.far} ft)`,
};
const HP_LABEL: Record<ApparentHp, string> = { healthy: "Healthy", bloodied: "Bloodied", nearDown: "Near down", down: "Down" };
const COVER_LABEL: Record<Cover, string> = { none: "None", half: "Half", threeQuarters: "Three-quarters", total: "Total" };

/** Adds or removes one value, keeping the list's order. */
function toggled(list: readonly string[], value: string, on: boolean): string[] {
  return on ? (list.includes(value) ? [...list] : [...list, value]) : list.filter((v) => v !== value);
}

/**
 * One player's turn details. Emits the whole updated turn; the caller keeps "clustered with"
 * symmetric (see `updatePlayerTurn`), so ticking a player here also ticks this one on their row.
 */
export function PlayerRow({
  player,
  turn,
  others,
  onChange,
}: {
  player: Player;
  turn: PlayerTurn;
  /** The other roster players, offered for "clustered with". */
  others: readonly Player[];
  onChange: (turn: PlayerTurn) => void;
}) {
  const set = (patch: Partial<Omit<PlayerTurn, "playerId">>) => onChange({ ...turn, ...patch });
  // Conditions are free strings in the data model; keep any carried-over non-standard ones toggleable.
  const conditionChoices = [...CONDITIONS, ...turn.conditions.filter((c) => !CONDITIONS.some((k) => k === c))];
  const zoneHint = mismatchedZone(turn);

  function setDistance(distanceFt: number | undefined) {
    const { distanceFt: _previous, ...rest } = turn;
    onChange(distanceFt === undefined ? rest : { ...rest, distanceFt });
  }

  return (
    <fieldset className="min-w-0 rounded border border-stone-200 p-3">
      <legend className="px-1 font-medium">
        {player.name || "Unnamed player"}
        <span className="ml-2 text-sm font-normal text-stone-600">
          {player.role}
          {player.class && `, ${player.class}`}
          {player.ac !== undefined && `, AC ${player.ac}`}
        </span>
      </legend>

      {/* Two columns only on md+ screens AND when this row is itself wide enough: the page's xl grid makes the situation column narrow. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 md:@lg:grid-cols-2">
          <div className="min-w-0">
            <div className="flex min-w-0 gap-2">
              <label className={`${labelClass} min-w-0 flex-1`}>
                Zone
                <select className={inputClass} value={turn.zone} onChange={(e) => set({ zone: ZoneSchema.parse(e.target.value) })}>
                  {ZoneSchema.options.map((z) => (
                    <option key={z} value={z}>
                      {ZONE_LABEL[z]}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                className="w-24 shrink-0"
                label="Exact ft."
                optional
                value={turn.distanceFt}
                placeholder={`${ZONE_DEFAULT_FT[turn.zone]}`}
                onChange={setDistance}
              />
            </div>
            {zoneHint && (
              <p role="status" className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
                {turn.distanceFt} ft. is {ZONE_LABEL[zoneHint]}, not {ZONE_LABEL[turn.zone]}. Range checks use the {turn.distanceFt} ft.; update the zone to match.
              </p>
            )}
          </div>
  
          <label className={labelClass}>
            Apparent HP
            <select className={inputClass} value={turn.apparentHp} onChange={(e) => set({ apparentHp: ApparentHpSchema.parse(e.target.value) })}>
              {ApparentHpSchema.options.map((h) => (
                <option key={h} value={h}>
                  {HP_LABEL[h]}
                </option>
              ))}
            </select>
          </label>
  
          <label className={labelClass}>
            Cover
            <select className={inputClass} value={turn.cover} onChange={(e) => set({ cover: CoverSchema.parse(e.target.value) })}>
              {CoverSchema.options.map((c) => (
                <option key={c} value={c}>
                  {COVER_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
  
          <div className="flex items-end">
            <CheckboxField label="Hit the monster last round" checked={turn.hitMonsterLastRound} onChange={(hitMonsterLastRound) => set({ hitMonsterLastRound })} />
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm">
          Conditions: {turn.conditions.length > 0 ? turn.conditions.join(", ") : "none"}
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {conditionChoices.map((c) => (
            <ToggleChip key={c} pressed={turn.conditions.includes(c)} onToggle={(on) => set({ conditions: toggled(turn.conditions, c, on) })}>
              {c}
            </ToggleChip>
          ))}
        </div>
      </details>

      {others.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-sm">Clustered with</p>
          <div className="flex flex-wrap gap-2">
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
        </div>
      )}
    </fieldset>
  );
}
