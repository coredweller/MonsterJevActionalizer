"use client";

import { useEffect, useState } from "react";
import { editField, moveUnknownToNotes, reapply, revert, type Change, type FieldError, type NormalizeResult } from "@/lib/monster/normalize";
import { parseMonster, type Monster } from "@/lib/monster/schema";
import { Badge, Button, Panel, inputClass } from "./ui";

function valueAt(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>((node, seg) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[seg] : undefined), root);
}

const show = (v: unknown) => (v === undefined ? "(missing)" : typeof v === "string" ? `"${v}"` : JSON.stringify(v));

/** Turn the DM's typed text into the type zod expects for that field. */
function coerce(text: string, error: FieldError, current: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  const expected = error.expected ?? (typeof current === "number" ? "number" : typeof current === "object" && current !== null ? "object" : "string");
  if (expected === "number") {
    const n = Number(text);
    return Number.isFinite(n) && text.trim() !== "" ? { ok: true, value: n } : { ok: false, message: "Enter a number." };
  }
  if (expected === "object" || expected === "array") {
    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, message: `Enter JSON, e.g. ${expected === "array" ? "[]" : "{}"}.` };
    }
  }
  return { ok: true, value: text };
}

function ErrorEditor({ error, result, onChange }: { error: FieldError; result: NormalizeResult; onChange: (r: NormalizeResult) => void }) {
  const current = valueAt(result.fixed, error.path);
  const [text, setText] = useState(typeof current === "string" ? current : current === undefined ? "" : JSON.stringify(current));
  const [problem, setProblem] = useState<string | null>(null);
  const label = error.path.join(".") || "(whole monster)";

  function apply() {
    const parsed = coerce(text, error, current);
    if (!parsed.ok) return setProblem(parsed.message);
    setProblem(null);
    onChange(editField(result, error.path, parsed.value));
  }

  return (
    <li className="rounded border border-red-200 bg-red-50 p-2">
      <div className="text-sm">
        <span className="font-mono font-semibold">{label}</span>: {error.message}
      </div>
      <div className="text-xs text-stone-600">Current value: {show(current)}</div>
      {error.path.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className={`${inputClass} max-w-md flex-1`} value={text} onChange={(e) => setText(e.target.value)} aria-label={`New value for ${label}`} />
          <Button onClick={apply}>Set</Button>
        </div>
      )}
      {problem && <p className="mt-1 text-xs text-red-800">{problem}</p>}
    </li>
  );
}

export function FixScreen({
  result,
  onChange,
  onContinue,
  onCancel,
}: {
  result: NormalizeResult;
  onChange: (r: NormalizeResult) => void;
  onContinue: (monster: Monster) => void;
  onCancel: () => void;
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  // Remember every change seen so reverted ones can still be listed and re-applied.
  const [seen, setSeen] = useState<Record<string, Change>>({});
  useEffect(() => {
    setSeen((s) => {
      const next = { ...s };
      for (const c of result.changes) next[c.id] = c;
      return next;
    });
  }, [result]);

  const reverted = (result.options.skip ?? []).map((id) => seen[id]).filter((c): c is Change => Boolean(c));
  const valid = result.errors.length === 0;
  const name = valueAt(result.fixed, ["CharacterName"]);

  function download() {
    const blob = new Blob([`${JSON.stringify(result.fixed, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.options.filename ?? `${typeof name === "string" && name ? name.replace(/\W+/g, "") : "monster"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function next() {
    const parsed = parseMonster(result.fixed);
    if (parsed.success) onContinue(parsed.data);
  }

  return (
    <Panel
      title={`Check ${typeof name === "string" && name ? name : "monster"}`}
      actions={
        <>
          <Button onClick={download}>Download fixed JSON</Button>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={next} disabled={!valid} title={valid ? undefined : "Fix the errors below first"}>
            Continue to review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          Template: <Badge tone={result.kind === "legendary" ? "blue" : "stone"}>{result.kind}</Badge>{" "}
          {valid ? <Badge tone="green">valid</Badge> : <Badge tone="red">{result.errors.length} error(s)</Badge>}
        </p>

        <div>
          <h3 className="mb-1 font-medium">Automatic fixes ({result.changes.length})</h3>
          {result.changes.length === 0 ? (
            <p className="text-sm text-stone-500">None needed.</p>
          ) : (
            <ul className="space-y-1">
              {result.changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-200 p-2 text-sm">
                  <span>
                    {c.message} <span className="text-xs text-stone-500">({c.kind})</span>
                  </span>
                  <span className="flex gap-2">
                    {accepted.has(c.id) ? (
                      <Badge tone="green">accepted</Badge>
                    ) : (
                      <Button onClick={() => setAccepted((s) => new Set(s).add(c.id))}>Accept</Button>
                    )}
                    <Button onClick={() => onChange(revert(result, c.id))}>Revert</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {reverted.length > 0 && (
            <ul className="mt-2 space-y-1">
              {reverted.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-stone-300 p-2 text-sm text-stone-500">
                  <span>
                    Reverted: <s>{c.message}</s>
                  </span>
                  <Button onClick={() => onChange(reapply(result, c.id))}>Re-apply</Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {result.unknownKeys.length > 0 && (
          <div>
            <h3 className="mb-1 font-medium">Unknown keys (kept as-is)</h3>
            <ul className="space-y-1">
              {result.unknownKeys.map((path) => (
                <li key={path.join("/")} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm">
                  <span>
                    <span className="font-mono">{path.join(".")}</span> = {show(valueAt(result.fixed, path))}
                  </span>
                  <Button onClick={() => onChange(moveUnknownToNotes(result, path))}>Move to Notes</Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!valid && (
          <div>
            <h3 className="mb-1 font-medium">Errors to fix</h3>
            <ul className="space-y-2">
              {result.errors.map((e) => (
                <ErrorEditor key={`${e.path.join("/")}:${e.message}:${show(valueAt(result.fixed, e.path))}`} error={e} result={result} onChange={onChange} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
