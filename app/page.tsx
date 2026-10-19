"use client";

import { useId, useRef, useState } from "react";
import { EncounterTracker } from "@/components/EncounterTracker";
import { FixScreen } from "@/components/FixScreen";
import { MonsterLoader } from "@/components/MonsterLoader";
import { PartyRoster } from "@/components/PartyRoster";
import { RecommendationCard } from "@/components/RecommendationCard";
import { ReminderCards } from "@/components/ReminderCards";
import { ReviewScreen } from "@/components/ReviewScreen";
import { SituationForm } from "@/components/SituationForm";
import { TrackerSidebar } from "@/components/TrackerSidebar";
import { TurnLog } from "@/components/TurnLog";
import { Panel } from "@/components/ui";
import { type BlockedRecommendation, type DecideRequest, DecideResponseSchema, type Recommendation } from "@/lib/decide/types";
import { createTracker, duplicate, syncSituation } from "@/lib/encounter/state";
import type { Situation, Tracker } from "@/lib/encounter/types";
import { errorText, log } from "@/lib/log";
import { extractAbilities, type ReviewDraft } from "@/lib/monster/extract";
import type { NormalizeResult } from "@/lib/monster/normalize";
import type { ReviewedMonster } from "@/lib/monster/types";
import { useTrackers } from "./useTrackers";

type LoadFlow =
  | { step: "load" }
  | { step: "fix"; result: NormalizeResult }
  | { step: "review"; draft: ReviewDraft; result: NormalizeResult };

/** Which decision model answered, how long it took and what it used, for the debug footer. */
interface DecisionModelMeta {
  readonly model: string;
  readonly latencyMs: number;
  readonly usage?: Readonly<Record<string, number>>;
}

/** What `/api/decide` gave back. `failed` (an error answer or no answer at all) means the DM picks by hand. */
type DecideOutcome =
  | { readonly kind: "recommended"; readonly recommendation: Recommendation; readonly meta: DecisionModelMeta }
  | { readonly kind: "blocked"; readonly recommendation: BlockedRecommendation }
  | { readonly kind: "failed"; readonly message: string };

/** One Recommend press: the tracker and situation it was decided on, and the answer once it arrives. */
interface Decision {
  readonly trackerId: string;
  readonly situation: Situation;
  readonly outcome: DecideOutcome | null;
}

const UNEXPECTED_ANSWER = "The server's answer wasn't in the expected shape.";

async function requestDecision(tracker: Tracker, situation: Situation): Promise<DecideOutcome> {
  const { reviewed, state, settings, roster, log: turns } = tracker;
  const body: DecideRequest = { tracker: { reviewed, state, settings, roster, log: turns }, situation };
  let json: unknown;
  try {
    const response = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    json = await response.json();
  } catch (e) {
    log.error("decide.request_failed", { error: errorText(e) });
    return { kind: "failed", message: `Couldn't get a recommendation from the server: ${errorText(e)}` };
  }
  const parsed = DecideResponseSchema.safeParse(json);
  if (!parsed.success) {
    log.error("decide.response_invalid", { issues: parsed.error.issues.length, paths: parsed.error.issues.map((i) => i.path.join(".")).join(",") });
    return { kind: "failed", message: UNEXPECTED_ANSWER };
  }
  const answer = parsed.data;
  if (!answer.ok) {
    log.warn("decide.error_answer", { kind: answer.error.kind });
    return { kind: "failed", message: answer.error.message };
  }
  if ("blocked" in answer.recommendation) return { kind: "blocked", recommendation: answer.recommendation };
  // The schema pairs a full recommendation with the model's meta, but zod's union doesn't tie the two
  // fields together for TypeScript, so the meta is narrowed on its own.
  if (!("latencyMs" in answer.meta)) {
    log.error("decide.response_invalid", { reason: "recommendation without model meta" });
    return { kind: "failed", message: UNEXPECTED_ANSWER };
  }
  return { kind: "recommended", recommendation: answer.recommendation, meta: answer.meta };
}

export default function Home() {
  const { loaded, trackers, selected, select, upsert, remove, storageWarning, dismissWarning } = useTrackers();
  const [flow, setFlow] = useState<LoadFlow | null>(null);
  // The tracker drawer below the xl breakpoint; from xl up the sidebar is always shown.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarId = useId();
  const [decision, setDecision] = useState<Decision | null>(null);
  // Only the latest Recommend press may set the decision; an older answer that arrives late is dropped.
  const latestRequest = useRef(0);
  const loading = flow !== null || (loaded && trackers.length === 0);
  const current: LoadFlow = flow ?? { step: "load" };
  const shown = decision !== null && decision.trackerId === selected?.id ? decision : null;

  function onConfirmed(reviewed: ReviewedMonster) {
    const tracker = createTracker(reviewed, crypto.randomUUID(), new Date().toISOString());
    upsert(tracker);
    select(tracker.id);
    setFlow(null);
  }

  function onSelected(id: string) {
    setFlow(null);
    select(id);
  }

  function onDuplicated(tracker: Tracker) {
    const copy = duplicate(tracker, trackers.map((t) => t.name), crypto.randomUUID(), new Date().toISOString());
    upsert(copy);
    onSelected(copy.id);
  }

  async function recommend(tracker: Tracker, situation: Situation) {
    const request = ++latestRequest.current;
    setDecision({ trackerId: tracker.id, situation, outcome: null });
    const outcome = await requestDecision(tracker, situation);
    if (request !== latestRequest.current) return;
    setDecision({ trackerId: tracker.id, situation, outcome });
  }

  /** Drops the shown recommendation, and any answer still on its way. */
  function clearDecision() {
    latestRequest.current++;
    setDecision(null);
  }

  function onApplied(next: Tracker) {
    upsert(next);
    clearDecision();
  }

  function onTrackerEdited(previous: Tracker, next: Tracker) {
    upsert(next);
    // A new round means Start turn was pressed: the recommendation on screen was for the last turn.
    if (next.state.round !== previous.state.round) clearDecision();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-linear-to-r from-rose-700 via-violet-700 to-blue-700 px-4 py-3 text-white shadow">
        <h1 className="text-lg font-bold tracking-wide">Monster Turn Advisor</h1>
        <button
          type="button"
          className="min-h-11 rounded-md border border-white/60 px-3 text-sm font-semibold hover:bg-white/10 xl:hidden"
          aria-expanded={drawerOpen}
          aria-controls={sidebarId}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          Trackers
        </button>
      </header>

      {storageWarning && (
        <div role="alert" className="flex items-start justify-between gap-4 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>{storageWarning}</span>
          <button className="min-h-11 px-2 underline" onClick={dismissWarning}>
            Dismiss
          </button>
        </div>
      )}

      {/* Below xl the sidebar is a drawer outside the grid's flow, so the content columns get the full width. */}
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-[14rem_1fr_1fr_1fr]">
        <TrackerSidebar
          id={sidebarId}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          loaded={loaded}
          trackers={trackers}
          selectedId={flow ? null : (selected?.id ?? null)}
          onSelect={onSelected}
          onAdd={() => setFlow({ step: "load" })}
          onDuplicate={onDuplicated}
          onDelete={remove}
        />

        {loaded && loading ? (
          <div className="md:col-span-2 xl:col-span-3">
            {current.step === "load" && (
              <MonsterLoader
                onLoaded={(result) => setFlow({ step: "fix", result })}
                onCancel={trackers.length > 0 ? () => setFlow(null) : undefined}
              />
            )}
            {current.step === "fix" && (
              <FixScreen
                result={current.result}
                onChange={(result) => setFlow({ step: "fix", result })}
                onContinue={(monster) => setFlow({ step: "review", draft: extractAbilities(monster), result: current.result })}
                onCancel={() => setFlow(trackers.length > 0 ? null : { step: "load" })}
              />
            )}
            {current.step === "review" && (
              <ReviewScreen draft={current.draft} onConfirm={onConfirmed} onBack={() => setFlow({ step: "fix", result: current.result })} />
            )}
          </div>
        ) : (
          <>
            <div className="min-w-0 space-y-4">
              {selected ? (
                <EncounterTracker tracker={selected} onChange={(next) => onTrackerEdited(selected, next)} />
              ) : (
                <Panel title="Monster" accent="monster">
                  <p className="text-sm text-stone-500">Select a tracker.</p>
                </Panel>
              )}
              {selected && <ReminderCards tracker={selected} />}
              {selected && (
                <PartyRoster roster={selected.roster} onChange={(roster) => upsert({ ...selected, roster, situation: syncSituation(selected.situation, roster) })} />
              )}
            </div>

            <div className="min-w-0">
              {selected ? (
                <SituationForm
                  roster={selected.roster}
                  situation={selected.situation}
                  onChange={(situation) => upsert({ ...selected, situation })}
                  onRecommend={(situation) => void recommend(selected, situation)}
                  pending={shown !== null && shown.outcome === null}
                />
              ) : (
                <Panel title="Situation" accent="situation">
                  <p className="text-sm text-stone-500">Select a tracker.</p>
                </Panel>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              {selected && shown?.outcome ? (
                <>
                  {shown.outcome.kind === "failed" && (
                    <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
                      {shown.outcome.message}
                    </p>
                  )}
                  <RecommendationCard
                    tracker={selected}
                    situation={shown.situation}
                    recommendation={shown.outcome.kind === "failed" ? null : shown.outcome.recommendation}
                    onApply={onApplied}
                  />
                </>
              ) : (
                <Panel title="Recommendation" accent="recommendation">
                  <p className="text-sm text-stone-500">
                    {shown ? "Recommending…" : selected ? "Fill in the situation and press Recommend." : "Select a tracker."}
                  </p>
                </Panel>
              )}
              {selected && <TurnLog tracker={selected} onChange={upsert} />}
            </div>
          </>
        )}
      </div>

      {shown?.outcome?.kind === "recommended" && (
        <footer aria-label="Debug" className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
          {debugLine(shown.outcome.meta)}
        </footer>
      )}
    </div>
  );
}

function debugLine({ model, latencyMs, usage }: DecisionModelMeta): string {
  const used = usage ? Object.entries(usage).map(([name, count]) => `${name} ${count}`) : [];
  return [`Model ${model}`, `${latencyMs} ms`, used.length > 0 ? `usage: ${used.join(", ")}` : "no usage reported"].join(" · ");
}
