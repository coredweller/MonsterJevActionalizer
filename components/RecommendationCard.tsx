"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { buildClusters, type Cluster } from "@/lib/decide/clusters";
import {
  PART_LABEL,
  buildChoice,
  initialDraft,
  rankKeys,
  recommendationProblem,
  runnerUp,
  sameDraft,
  sameIds,
  switchPick,
  targetMode,
  type Draft,
  type Part,
  type PickDraft,
} from "@/lib/decide/draft";
import { MOVEMENT_LABELS } from "@/lib/decide/explain";
import type { BlockedRecommendation, Confidence, Recommendation } from "@/lib/decide/types";
import { apply, sameSituation } from "@/lib/encounter/state";
import type { Movement, Situation, Tracker } from "@/lib/encounter/types";
import { errorText, log } from "@/lib/log";
import { buildLegalOptions, type Option } from "@/lib/monster/options";
import { Badge, Button, Panel, ToggleChip } from "./ui";

const CONFIDENCE: Record<Confidence, { label: string; tone: "green" | "amber" | "red" }> = {
  high: { label: "High confidence", tone: "green" },
  medium: { label: "Medium confidence", tone: "amber" },
  dmsCall: { label: "DM's call", tone: "red" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const movementLabel = (m: Movement) => capitalize(MOVEMENT_LABELS[m]);
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** One question's distribution from the recommendation, by key. */
type Dist = Readonly<Record<string, number>>;

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface Choice<T> {
  value: T;
  label: string;
  /** The recommendation's probability; absent by hand, or for a question that wasn't asked. */
  p?: number;
}

/** A select's choices: most probable first with their %, when the question was answered; else in legal order. */
function rankedChoices<K extends string>(keys: readonly K[], label: (key: K) => string, dist: Dist | undefined): Choice<K>[] {
  if (!dist) return keys.map((key) => ({ value: key, label: label(key) }));
  return rankKeys(keys, dist).map(({ key, p }) => ({ value: key, label: label(key), p }));
}

const choiceText = (c: Choice<unknown>) => (c.p === undefined ? c.label : `${c.label} · ${pct(c.p)}`);

function Caption({ htmlFor, id, label, changed }: { htmlFor?: string; id?: string; label: string; changed: boolean }) {
  const text = "text-xs font-semibold text-stone-600";
  return (
    <span className="flex items-center gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={text}>
          {label}
        </label>
      ) : (
        <span id={id} className={text}>
          {label}
        </span>
      )}
      {changed && <Badge tone="amber">Changed</Badge>}
    </span>
  );
}

/**
 * One part of the turn: a caption, a select and, beside it, one chip. While the row holds the
 * recommendation's value, the chip offers `alternative` (the runner-up); once changed, it offers the
 * recommendation back. A single choice that is already picked is plain text.
 */
function ChoiceRow<T extends string | number>({
  label,
  value,
  choices,
  emptyLabel,
  allowEmpty = false,
  recommended,
  alternative,
  onChange,
}: {
  label: string;
  value: T | null;
  choices: readonly Choice<T>[];
  emptyLabel: string;
  /** Makes the empty entry a real choice ("No group"); otherwise it only shows while nothing is picked. */
  allowEmpty?: boolean;
  /** The recommendation's value; absent by hand. */
  recommended?: { value: T | null };
  /** The runner-up, offered while the row holds the recommended value; null when there is none. */
  alternative?: T | null;
  onChange: (value: T | null) => void;
}) {
  const selectId = useId();
  const only = choices.length === 1 && !allowEmpty ? choices[0] : undefined;
  if (only && only.value === value) {
    return (
      <div className="flex items-baseline gap-2">
        <Caption id={selectId} label={label} changed={false} />
        <span className="text-sm">
          {only.label} <span className="text-stone-600">(only choice)</span>
        </span>
      </div>
    );
  }

  const changed = recommended !== undefined && recommended.value !== value;
  const back = changed && recommended.value !== null ? choices.find((c) => c.value === recommended.value) : undefined;
  const offer = changed ? back : alternative != null ? choices.find((c) => c.value === alternative) : undefined;
  return (
    <div>
      <Caption htmlFor={selectId} label={label} changed={changed} />
      <div className="flex items-center gap-1.5">
        <select
          id={selectId}
          className="min-h-11 w-full min-w-0 rounded border border-stone-500 bg-white px-2 text-sm"
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
              {choiceText(c)}
            </option>
          ))}
        </select>
        {offer && (
          <button
            type="button"
            aria-label={`${back ? "Back to the recommended pick" : "Use runner-up"}: ${choiceText(offer)}`}
            className="flex min-h-11 w-36 flex-none items-center gap-1 rounded-md border border-dashed border-(--accent) bg-white px-2 text-left text-xs text-(--accent-strong) hover:bg-(--accent-soft)"
            onClick={() => onChange(offer.value)}
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {back ? "back to" : "or"} {offer.label}
            </span>
            {offer.p !== undefined && <span className="flex-none tabular-nums">{pct(offer.p)}</span>}
          </button>
        )}
      </div>
    </div>
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
  chances,
  onChange,
}: {
  label: string;
  players: readonly PlayerChoice[];
  value: readonly string[];
  /** The recommendation's targets for this option; null by hand, or for another option than its pick. */
  recommended: readonly string[] | null;
  /** Jev's probability for each player as this option's target, when its target question was answered. */
  chances: Dist | undefined;
  onChange: (ids: string[]) => void;
}) {
  const captionId = useId();
  return (
    <div>
      <Caption id={captionId} label={label} changed={recommended !== null && !sameIds(recommended, value)} />
      {players.length === 0 ? (
        <p className="text-sm text-stone-500">No players in this situation.</p>
      ) : (
        <div role="group" aria-labelledby={captionId} className="flex flex-wrap gap-1.5">
          {players.map((p) => {
            const chance = chances?.[p.id];
            return (
              <ToggleChip
                key={p.id}
                pressed={value.includes(p.id)}
                onToggle={(on) => onChange(players.filter((o) => (o.id === p.id ? on : value.includes(o.id))).map((o) => o.id))}
              >
                {p.name}
                {chance !== undefined && <span className="ml-1 font-normal tabular-nums">{pct(chance)}</span>}
              </ToggleChip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The action or bonus action row, plus its target, group and slot rows for the selected option. */
function PickStep({
  part,
  list,
  pick,
  recommended,
  dist,
  targetP,
  clusters,
  players,
  onChange,
}: {
  part: Part;
  list: readonly Option[];
  pick: PickDraft;
  /** The recommendation's pick, or null by hand. */
  recommended: PickDraft | null;
  /** Jev's distribution for this part's question, when it was asked. */
  dist: Dist | undefined;
  /** Jev's target probabilities for this list, by option key then player id. */
  targetP: Readonly<Record<string, Dist>> | undefined;
  clusters: readonly Cluster[];
  players: readonly PlayerChoice[];
  onChange: (pick: PickDraft) => void;
}) {
  const option = list.find((o) => o.key === pick.key);
  const mode = option ? targetMode(option, part) : "none";
  const keys = list.map((o) => o.key);
  // Sub-pick hints only compare like with like: the recommendation's own option.
  const sub = recommended !== null && recommended.key === pick.key ? recommended : null;
  const groupLabel = (c: Cluster) => `${players.filter((p) => c.playerIds.includes(p.id)).map((p) => p.name).join(", ")} (catches ${c.playerIds.length})`;
  const alternative = dist && recommended?.key ? (runnerUp(keys, dist, recommended.key)?.key ?? null) : null;

  return (
    <div className="space-y-2">
      <ChoiceRow
        label={PART_LABEL[part]}
        value={pick.key}
        choices={rankedChoices(keys, (key) => list.find((o) => o.key === key)?.name ?? key, dist)}
        emptyLabel={part === "action" ? "Pick an action" : "Pick a bonus action"}
        recommended={recommended ? { value: recommended.key } : undefined}
        alternative={alternative}
        onChange={(key) => onChange(switchPick(key, list, recommended))}
      />
      {option && mode === "cluster" && (
        <ChoiceRow
          label={`${option.name} group`}
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
          label={`${option.name} targets`}
          players={players}
          value={pick.targetIds}
          recommended={sub ? sub.targetIds : null}
          chances={pick.key === null ? undefined : targetP?.[pick.key]}
          onChange={(targetIds) => onChange({ ...pick, targetIds })}
        />
      )}
      {option?.leveledSpell && (
        <ChoiceRow
          label={`${option.name} slot level`}
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
  dist,
  onChange,
}: {
  label: string;
  value: Movement | null;
  movements: readonly Movement[];
  /** Code holds the monster still (hard-blocked with `movementBy: "code"`). */
  fixed: boolean;
  /** The recommendation's movement; absent by hand, or when a blocked turn leaves it to the DM. */
  recommended: Movement | undefined;
  /** Jev's distribution for this movement question, when it was asked. */
  dist: Dist | undefined;
  onChange: (m: Movement | null) => void;
}) {
  if (fixed) {
    return (
      <p className="text-sm">
        {label}: <strong>{movementLabel("hold")}</strong> <span className="text-stone-600">(it can&apos;t move)</span>
      </p>
    );
  }
  return (
    <ChoiceRow
      label={label}
      value={value}
      choices={rankedChoices(movements, movementLabel, dist)}
      emptyLabel="Pick a movement"
      recommended={recommended === undefined ? undefined : { value: recommended }}
      alternative={dist && recommended ? (runnerUp(movements, dist, recommended)?.key ?? null) : null}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * This turn's recommendation with an override for every part, and Apply (constitution Principle III).
 * The plan line leads; each part is then one row with its runner-up beside it. Legal options are
 * recomputed here with `buildLegalOptions`, so the overrides never depend on the server's answer.
 * With `recommendation: null` (the decide call failed) the same rows start empty and the DM picks
 * by hand. Blocked turns come from those local options too.
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
  const dist = (question: string): Dist | undefined => full?.probabilities[question];

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
    <Panel title={usable ? "Recommendation" : "Pick by hand"} accent="recommendation">
      <div className="space-y-3">
        {full && (
          <div className="flex items-start gap-2 rounded-md bg-amber-100 p-2 text-sm text-amber-950">
            <span className="flex-none">
              <Badge tone={CONFIDENCE[full.confidence].tone}>{CONFIDENCE[full.confidence].label}</Badge>
            </span>
            <p>
              <strong>
                {full.plan.lead}
                {full.plan.detail && ":"}
              </strong>{" "}
              {full.plan.detail}
            </p>
          </div>
        )}
        {problem !== null && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
            The recommendation doesn&apos;t match this turn&apos;s options ({problem}). Pick by hand.
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

        <ol className="space-y-3">
          <li>
            <MovementStep
              label="Move before"
              value={current.moveBefore}
              movements={options.movements}
              fixed={movementFixed}
              recommended={usable?.moveBefore ?? undefined}
              dist={dist("move_before")}
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
                  dist={dist("action")}
                  targetP={full?.targetP.actions}
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
                  dist={dist("bonus_action")}
                  targetP={full?.targetP.bonusActions}
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
              dist={dist("move_after")}
              onChange={(moveAfter) => set({ moveAfter })}
            />
          </li>
        </ol>

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
