"use client";

import { useRef, useState } from "react";
import { FixScreen } from "@/components/FixScreen";
import { MonsterLoader } from "@/components/MonsterLoader";
import { PartyRoster } from "@/components/PartyRoster";
import { RecommendationCard } from "@/components/RecommendationCard";
import { ReviewScreen } from "@/components/ReviewScreen";
import { SituationForm } from "@/components/SituationForm";
import { Button, Panel, panelFrame } from "@/components/ui";
import { type BlockedRecommendation, type DecideRequest, DecideResponseSchema, type Recommendation } from "@/lib/decide/types";
import { createTracker, syncSituation } from "@/lib/encounter/state";
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
  const { loaded, trackers, selected, select, upsert, storageWarning, dismissWarning } = useTrackers();
  const [flow, setFlow] = useState<LoadFlow | null>(null);
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

  async function recommend(tracker: Tracker, situation: Situation) {
    const request = ++latestRequest.current;
    setDecision({ trackerId: tracker.id, situation, outcome: null });
    const outcome = await requestDecision(tracker, situation);
    if (request !== latestRequest.current) return;
    setDecision({ trackerId: tracker.id, situation, outcome });
  }

  function onApplied(next: Tracker) {
    upsert(next);
    setDecision(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-linear-to-r from-rose-700 via-violet-700 to-blue-700 px-4 py-3 text-white shadow">
        <h1 className="text-lg font-bold tracking-wide">Monster Turn Advisor</h1>
      </header>

      {storageWarning && (
        <div role="alert" className="flex items-start justify-between gap-4 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>{storageWarning}</span>
          <button className="min-h-11 px-2 underline" onClick={dismissWarning}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[14rem_1fr] xl:grid-cols-[14rem_1fr_1fr_1fr]">
        <aside aria-label="Trackers" className={`accent-monster ${panelFrame} p-3`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-(--accent-strong)">Trackers</h2>
            <Button onClick={() => setFlow({ step: "load" })}>Add monster</Button>
          </div>
          {!loaded ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : trackers.length === 0 ? (
            <p className="text-sm text-stone-500">No trackers yet.</p>
          ) : (
            <ul className="space-y-1">
              {trackers.map((t) => (
                <li key={t.id}>
                  <button
                    className={`min-h-11 w-full rounded px-2 text-left ${t.id === selected?.id && !flow ? "bg-(--accent) font-semibold text-white" : "hover:bg-(--accent-soft)"}`}
                    onClick={() => {
                      setFlow(null);
                      select(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {loaded && loading ? (
          <div className="xl:col-span-3">
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
              <section aria-label="Monster and tracker" className={`accent-monster ${panelFrame} p-3`}>
                <h2 className="font-semibold text-(--accent-strong)">{selected ? selected.name : "Monster"}</h2>
                {selected ? (
                  <p className="text-sm text-stone-600">
                    HP {selected.state.hp}/{selected.state.hpMax} · round {selected.state.round} · {selected.reviewed.abilities.length} abilities
                  </p>
                ) : (
                  <p className="text-sm text-stone-500">Select a tracker.</p>
                )}
              </section>
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
