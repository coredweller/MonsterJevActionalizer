"use client";

import { useState } from "react";
import { FixScreen } from "@/components/FixScreen";
import { MonsterLoader } from "@/components/MonsterLoader";
import { ReviewScreen } from "@/components/ReviewScreen";
import { Button } from "@/components/ui";
import { createTracker } from "@/lib/encounter/state";
import { extractAbilities, type ReviewDraft } from "@/lib/monster/extract";
import type { NormalizeResult } from "@/lib/monster/normalize";
import type { ReviewedMonster } from "@/lib/monster/types";
import { useTrackers } from "./useTrackers";

type LoadFlow =
  | { step: "load" }
  | { step: "fix"; result: NormalizeResult }
  | { step: "review"; draft: ReviewDraft; result: NormalizeResult };

export default function Home() {
  const { loaded, trackers, selected, select, upsert, storageWarning, dismissWarning } = useTrackers();
  const [flow, setFlow] = useState<LoadFlow | null>(null);
  const loading = flow !== null || (loaded && trackers.length === 0);
  const current: LoadFlow = flow ?? { step: "load" };

  function onConfirmed(reviewed: ReviewedMonster) {
    const tracker = createTracker(reviewed, crypto.randomUUID(), new Date().toISOString());
    upsert(tracker);
    select(tracker.id);
    setFlow(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Monster Turn Advisor</h1>
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
        <aside aria-label="Trackers" className="rounded border border-stone-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Trackers</h2>
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
                    className={`min-h-11 w-full rounded px-2 text-left ${t.id === selected?.id && !flow ? "bg-stone-200" : "hover:bg-stone-100"}`}
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
            <section aria-label="Monster and tracker" className="rounded border border-stone-200 bg-white p-3">
              <h2 className="font-semibold">{selected ? selected.name : "Monster"}</h2>
              {selected ? (
                <p className="text-sm text-stone-600">
                  HP {selected.state.hp}/{selected.state.hpMax} · round {selected.state.round} · {selected.reviewed.abilities.length} abilities
                </p>
              ) : (
                <p className="text-sm text-stone-500">Select a tracker.</p>
              )}
            </section>

            <section aria-label="Situation" className="rounded border border-stone-200 bg-white p-3">
              <h2 className="font-semibold">Situation</h2>
            </section>

            <section aria-label="Recommendation" className="rounded border border-stone-200 bg-white p-3">
              <h2 className="font-semibold">Recommendation</h2>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
