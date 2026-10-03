"use client";

import { useState, type ChangeEvent } from "react";
import { normalize, withCr, type NormalizeResult } from "@/lib/monster/normalize";
import { Button, Panel, inputClass, labelClass } from "./ui";

/** Paste or upload a statblock; runs the normalizer and asks for CR when it can't find one. */
export function MonsterLoader({ onLoaded, onCancel }: { onLoaded: (result: NormalizeResult) => void; onCancel?: () => void }) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pendingCr, setPendingCr] = useState<NormalizeResult | null>(null);
  const [cr, setCr] = useState("");

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
    setError(null);
  }

  function load() {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setError(`That isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setError(null);
    const result = normalize(raw, { filename });
    if (result.needsCr) setPendingCr(result);
    else onLoaded(result);
  }

  function submitCr() {
    if (!pendingCr || !/^\d+(\/\d+)?$/.test(cr.trim())) return;
    onLoaded(withCr(pendingCr, cr.trim()));
  }

  if (pendingCr) {
    return (
      <Panel title="Challenge rating needed">
        <p className="mb-3 text-sm">
          This monster has legendary content but no challenge rating, and the filename doesn&apos;t include one
          (<code>Name.CR&lt;n&gt;.2014.json</code>). Enter its CR to derive the proficiency bonus.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className={labelClass}>
            Challenge rating
            <input className={`${inputClass} w-28`} value={cr} onChange={(e) => setCr(e.target.value)} placeholder="e.g. 5 or 1/2" autoFocus />
          </label>
          <Button variant="primary" onClick={submitCr} disabled={!/^\d+(\/\d+)?$/.test(cr.trim())}>
            Continue
          </Button>
          <Button onClick={() => setPendingCr(null)}>Back</Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Load a monster" actions={onCancel && <Button onClick={onCancel}>Cancel</Button>}>
      <div className="space-y-3">
        <label className={labelClass}>
          Upload a statblock JSON
          <input type="file" accept=".json,application/json" onChange={onFile} className="min-h-11 text-sm" />
        </label>
        <label className={labelClass}>
          …or paste it
          <textarea
            className="min-h-48 w-full rounded border border-stone-300 p-2 font-mono text-xs"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFilename(undefined);
            }}
            placeholder='{ "CharacterName": "Goblin", … }'
          />
        </label>
        {filename && <p className="text-xs text-stone-500">File: {filename}</p>}
        {error && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <Button variant="primary" onClick={load} disabled={text.trim() === ""}>
          Check monster
        </Button>
      </div>
    </Panel>
  );
}
