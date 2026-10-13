"use client";

import { useEffect, useMemo, useState } from "react";
import { buildClusters, type Cluster } from "@/lib/decide/clusters";
import {
  PART_LABEL,
  buildChoice,
  initialDraft,
  recommendationProblem,
  sameDraft,
  sameIds,
  switchPick,
  targetMode,
  type Draft,
  type Part,
  type PickDraft,
} from "@/lib/decide/draft";
import { MOVEMENT_LABELS } from "@/lib/decide/explain";
import type { BlockedRecommendation, Confidence, Recommendation, RunnerUp } from "@/lib/decide/types";
import { apply, sameSituation } from "@/lib/encounter/state";
import type { Movement, Situation, Tracker } from "@/lib/encounter/types";
import { errorText, log } from "@/lib/log";
import { buildLegalOptions, type LegalOptions, type Option } from "@/lib/monster/options";
import { Badge, Button, Panel, ToggleChip, inputClass, labelClass } from "./ui";

const CONFIDENCE: Record<Confidence, { label: string; tone: "green" | "amber" | "red" }> = {
  high: { label: "High confidence", tone: "green" },
  medium: { label: "Medium confidence", tone: "amber" },
  dmsCall: { label: "DM's call", tone: "red" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const movementLabel = (m: Movement) => capitalize(MOVEMENT_LABELS[m]);
const pct = (p: number) => `${Math.round(p * 100)}%`;

function runnerUpLabel(r: RunnerUp, options: LegalOptions): string {
  const nameIn = (list: readonly Option[]) => list.find((o) => o.key === r.key)?.name ?? r.key;
  const movement = options.movements.find((m) => m === r.key);
  switch (r.question) {
    case "action":
      return `Action: ${nameIn(options.actions)}`;
    case "bonus_action":
      return `Bonus action: ${nameIn(options.bonusActions)}`;
    case "move_before":
      return `Move before: ${movement ? movementLabel(movement) : r.key}`;
    case "move_after":
      return `Move after: ${movement ? movementLabel(movement) : r.key}`;
    default:
      return `${r.question}: ${r.key}`;
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface Choice<T> {
  value: T;
  label: string;
}

/**
 * One override select. `recommended` (absent by hand) shows what the recommendation picked and
 * flags an override. `allowEmpty` makes the empty entry a real choice ("No group"); otherwise it
 * only shows while nothing is picked.
 */
function ChoiceSelect<T extends string | number>({
  label,
  value,
  choices,
  emptyLabel,
  allowEmpty = false,
  recommended,
  onChange,
}: {
  label: string;
  value: T | null;
  choices: readonly Choice<T>[];
  emptyLabel: string;
  allowEmpty?: boolean;
  recommended?: { value: T | null };
  onChange: (value: T | null) => void;
}) {
  const labelOf = (v: T | null) => (v === null ? emptyLabel : (choices.find((c) => c.value === v)?.label ?? String(v)));
  return (
    <label className={labelClass}>
      <span className="flex flex-wrap items-center gap-2">
        {label}
        {recommended && recommended.value !== value && <Badge tone="amber">Overridden</Badge>}
      </span>
      <select
        className={inputClass}
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : (choices.find((c) => String(c.value) === e.target.value)?.value ?? null))}
      >
        {(value === null || allowEmpty) && (
          <option value="" disabled={!allowEmpty}>
            {emptyLabel}
          </option>
        )}
        {choices.map((c) => (
          <option key={String(c.value)} value={String(c.value)}>
            {c.label}
          </option>
        ))}
      </select>
      {recommended && <span className="text-xs text-stone-600">Recommended: {labelOf(recommended.value)}</span>}
    </label>
  );
}

interface PlayerChoice {
  id: string;
  name: string;
}

/** Every player in the situation, downed ones included, with no warning (F18: the DM has the final say). */
function TargetChips({
  label,
  players,
  value,
  recommended,
  onChange,
}: {
  label: string;
  players: readonly PlayerChoice[];
  value: readonly string[];
  recommended: readonly string[] | null;
  onChange: (ids: string[]) => void;
}) {
  const names = (ids: readonly string[]) => players.filter((p) => ids.includes(p.id)).map((p) => p.name).join(", ") || "nobody";
  return (
    <div>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
        {label}
        {recommended && !sameIds(recommended, value) && <Badge tone="amber">Overridden</Badge>}
      </p>
      {players.length === 0 ? (
        <p className="text-sm text-stone-500">No players in this situation.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <ToggleChip
              key={p.id}
              pressed={value.includes(p.id)}
              onToggle={(on) => onChange(players.filter((o) => (o.id === p.id ? on : value.includes(o.id))).map((o) => o.id))}
            >
              {p.name}
            </ToggleChip>
          ))}
        </div>
      )}
      {recommended && <p className="mt-1 text-xs text-stone-600">Recommended: {names(recommended)}</p>}
    </div>
  );
}

/** The action or bonus action select, plus its target, group and slot controls for the selected option. */
function PickStep({
  part,
  list,
  pick,
  recommended,
  clusters,
  players,
  onChange,
}: {
  part: Part;
  list: readonly Option[];
  pick: PickDraft;
  /** The recommendation's pick, or null by hand. */
  recommended: PickDraft | null;
  clusters: readonly Cluster[];
  players: readonly PlayerChoice[];
  onChange: (pick: PickDraft) => void;
}) {
  const option = list.find((o) => o.key === pick.key);
  const mode = option ? targetMode(option, part) : "none";
  // Sub-pick hints only compare like with like: the recommendation's own option.
  const sub = recommended !== null && recommended.key === pick.key ? recommended : null;
  const groupLabel = (c: Cluster) => `${players.filter((p) => c.playerIds.includes(p.id)).map((p) => p.name).join(", ")} (catches ${c.playerIds.length})`;

  return (
    <div className="space-y-3">
      <ChoiceSelect
        label={PART_LABEL[part]}
        value={pick.key}
        choices={list.map((o) => ({ value: o.key, label: o.name }))}
        emptyLabel={part === "action" ? "Pick an action" : "Pick a bonus action"}
        recommended={recommended ? { value: recommended.key } : undefined}
        onChange={(key) => onChange(switchPick(key, list, recommended))}
      />
      {option && option.kind !== "none" && <p className="text-xs text-stone-600">{option.summary}</p>}
      {option && mode === "cluster" && (
        <ChoiceSelect
          label="Group"
          value={pick.clusterId}
          choices={clusters.map((c) => ({ value: c.id, label: groupLabel(c) }))}
          emptyLabel="No group"
          allowEmpty
          recommended={sub ? { value: sub.clusterId } : undefined}
          onChange={(clusterId) => onChange({ ...pick, clusterId })}
        />
      )}
      {option && mode === "players" && (
        <TargetChips
          label={`${PART_LABEL[part]} targets`}
          players={players}
          value={pick.targetIds}
          recommended={sub ? sub.targetIds : null}
          onChange={(targetIds) => onChange({ ...pick, targetIds })}
        />
      )}
      {option?.leveledSpell && (
        <ChoiceSelect
          label="Slot level"
          value={pick.slotLevel}
          choices={option.leveledSpell.availableLevels.map((n) => ({ value: n, label: `Level ${n}` }))}
          emptyLabel="Pick a slot level"
          recommended={sub ? { value: sub.slotLevel } : undefined}
          onChange={(slotLevel) => onChange({ ...pick, slotLevel })}
        />
      )}
    </div>
  );
}

function MovementStep({
  label,
  value,
  movements,
  fixed,
  recommended,
  onChange,
}: {
  label: string;
  value: Movement | null;
  movements: readonly Movement[];
  /** Code holds the monster still (hard-blocked with `movementBy: "code"`). */
  fixed: boolean;
  /** The recommendation's movement; absent by hand, or when a blocked turn leaves it to the DM. */
  recommended: Movement | undefined;
  onChange: (m: Movement | null) => void;
}) {
  if (fixed) {
    return (
      <p className="text-sm">
        {label}: <strong>{movementLabel("hold")}</strong> <span className="text-stone-600">(it can't move)</span>
      </p>
    );
  }
  return (
    <ChoiceSelect
      label={label}
      value={value}
      choices={movements.map((m) => ({ value: m, label: movementLabel(m) }))}
      emptyLabel="Pick a movement"
      recommended={recommended === undefined ? undefined : { value: recommended }}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * This turn's recommendation with an override for every part, and Apply (constitution Principle III).
 * Legal options are recomputed here with `buildLegalOptions`, so the overrides never depend on the
 * server's answer. With `recommendation: null` (the decide call failed) the same controls start
 * empty and the DM picks by hand. Blocked turns come from those local options too.
 *
 * Apply passes the DM's final picks to `apply` and hands the updated tracker to `onApply`. The card
 * resets whenever `recommendation`, `situation` or the tracker's state changes; after Apply the
 * caller should stop rendering it (or render the next turn's), since the tracker has moved on.
 */
export function RecommendationCard({
  tracker,
  situation,
  recommendation,
  onApply,
}: {
  tracker: Tracker;
  /**
   * The situation the turn was decided on (the one sent to `/api/decide`). Options and targets come
   * from it; Apply carries the tracker's latest situation forward instead, so later edits aren't lost (G08).
   */
  situation: Situation;
  /** null: no recommendation (the decide call failed), so the DM picks by hand. */
  recommendation: Recommendation | BlockedRecommendation | null;
  onApply: (tracker: Tracker) => void;
}) {
  const { reviewed, state, settings, roster } = tracker;
  const options = useMemo(() => buildLegalOptions(reviewed, state, situation, settings.temperament), [reviewed, state, situation, settings.temperament]);
  const clusters = useMemo(() => buildClusters(situation), [situation]);
  const problem = useMemo(
    () => (recommendation === null ? null : recommendationProblem(recommendation, options, clusters, situation)),
    [recommendation, options, clusters, situation],
  );
  const usable = problem === null ? recommendation : null;
  const full = usable !== null && !("blocked" in usable) ? usable : null;
  const initial = useMemo(() => initialDraft(full, options, situation), [full, options, situation]);

  // Reset on new inputs (React's "adjust state on prop change" pattern). `current` is used below so
  // this render never pairs the old draft with the new options.
  const [draft, setDraft] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  const [applyError, setApplyError] = useState<string | null>(null);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setDraft(initial);
    setApplyError(null);
  }
  const current = initial === lastInitial ? draft : initial;

  useEffect(() => {
    if (problem !== null) log.error("recommendation.mismatch", { problem });
  }, [problem]);

  const players: PlayerChoice[] = situation.players.map((t) => {
    const player = roster.find((p) => p.id === t.playerId);
    return { id: t.playerId, name: player ? player.name || "Unnamed player" : t.playerId };
  });
  const recommended = usable !== null && sameDraft(current, initial);
  const built = buildChoice(current, options, clusters, tracker.situation, recommended);
  const situationChanged = !sameSituation(tracker.situation, situation);
  const { blocked } = options;
  const movementFixed = blocked?.movementBy === "code";
  const set = (patch: Partial<Draft>) => setDraft({ ...current, ...patch });

  function applyTurn() {
    if (!built.ok) return;
    setApplyError(null);
    try {
      const next = apply(tracker, built.choice);
      log.info("turn.applied", {
        round: tracker.state.round,
        action: built.choice.action?.key ?? "none",
        bonusAction: built.choice.bonusAction?.key ?? "none",
        recommended,
      });
      onApply(next);
    } catch (e) {
      log.error("turn.apply_failed", { round: tracker.state.round, error: errorText(e) });
      setApplyError(`Couldn't apply this turn: ${errorText(e)}`);
    }
  }

  return (
    <Panel title={usable ? "Recommendation" : "Pick by hand"} accent="recommendation" actions={full && <Badge tone={CONFIDENCE[full.confidence].tone}>{CONFIDENCE[full.confidence].label}</Badge>}>
      <div className="space-y-4">
        {problem !== null && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
            The recommendation doesn't match this turn&apos;s options ({problem}). Pick by hand.
          </p>
        )}
        {recommendation === null && <p className="text-sm text-stone-600">No recommendation this turn. Every legal option is listed below.</p>}
        {situationChanged && (
          <p role="status" className="rounded bg-sky-50 p-2 text-sm text-sky-900">
            The situation changed since you pressed Recommend. These options still use the earlier one; press Recommend again to use your edits.
          </p>
        )}
        {blocked && (
          <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
            {blocked.reason}
          </p>
        )}
        {full && full.warnings.length > 0 && (
          <ul role="status" className="space-y-1 rounded bg-amber-50 p-2 text-sm text-amber-900">
            {full.warnings.map((w, i) => (
              <li key={`${i}:${w}`}>{w}</li>
            ))}
          </ul>
        )}

        <ol className="space-y-4">
          <li>
            <MovementStep
              label="Move before"
              value={current.moveBefore}
              movements={options.movements}
              fixed={movementFixed}
              recommended={usable?.moveBefore ?? undefined}
              onChange={(moveBefore) => set({ moveBefore })}
            />
          </li>
          {blocked ? (
            <li className="text-sm text-stone-600">No action or bonus action this turn.</li>
          ) : (
            <>
              <li>
                <PickStep
                  part="action"
                  list={options.actions}
                  pick={current.action}
                  recommended={full ? initial.action : null}
                  clusters={clusters}
                  players={players}
                  onChange={(action) => set({ action })}
                />
              </li>
              <li>
                <PickStep
                  part="bonus"
                  list={options.bonusActions}
                  pick={current.bonus}
                  recommended={full ? initial.bonus : null}
                  clusters={clusters}
                  players={players}
                  onChange={(bonus) => set({ bonus })}
                />
              </li>
            </>
          )}
          <li>
            <MovementStep
              label="Move after"
              value={current.moveAfter}
              movements={options.movements}
              fixed={movementFixed}
              recommended={usable?.moveAfter ?? undefined}
              onChange={(moveAfter) => set({ moveAfter })}
            />
          </li>
        </ol>

        {full && (
          <div>
            <h3 className="text-sm font-semibold text-(--accent-strong)">Why</h3>
            <p className="whitespace-pre-line text-sm text-stone-700">{full.explanation}</p>
          </div>
        )}

        {full && full.runnersUp.length > 0 && (
          // Low confidence surfaces the alternatives (Principle III), so "DM's call" starts open.
          <details open={full.confidence === "dmsCall"}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm">Runners-up ({full.runnersUp.length})</summary>
            <ul className="space-y-1 text-sm">
              {full.runnersUp.map((r) => (
                <li key={`${r.question}:${r.key}`} className="flex justify-between gap-2">
                  <span>{runnerUpLabel(r, options)}</span>
                  <span className="tabular-nums text-stone-600">{pct(r.p)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {applyError && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
            {applyError}
          </p>
        )}
        {!built.ok && <p className="text-sm text-stone-600">Still to pick: {built.missing.join(", ")}.</p>}
        <Button variant="primary" className="w-full md:w-auto" disabled={!built.ok} onClick={applyTurn}>
          {recommended ? "Apply as recommended" : "Apply"}
        </Button>
      </div>
    </Panel>
  );
}
