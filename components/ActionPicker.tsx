"use client";

import { useId, useState } from "react";
import { OPTION_KIND_LABEL, type OptionKind, optionSubtitle, pickerTiles, rankedOptions, searchRows } from "@/lib/decide/draft";
import { pct } from "@/lib/decide/explain";
import type { Option } from "@/lib/monster/options";
import type { Ability } from "@/lib/monster/types";
import { Badge, ToggleChip } from "./ui";

const KINDS: readonly ("all" | OptionKind)[] = ["all", "ability", "spell", "basic"];

/**
 * The action row for long lists (PLAN.md "Recommendation card"): three tiles (the recommended pick, then
 * the likeliest others) and a search panel over every legal action. The card uses it above
 * DROPDOWN_MAX_OPTIONS; shorter lists keep the dropdown.
 */
export function ActionPicker({
  label,
  list,
  value,
  recommendedKey,
  dist,
  abilities,
  onChange,
}: {
  label: string;
  list: readonly Option[];
  value: string | null;
  /** The recommendation's pick; null by hand. */
  recommendedKey: string | null;
  /** Jev's distribution for the action question, when it was asked. */
  dist: Readonly<Record<string, number>> | undefined;
  abilities: readonly Ability[];
  onChange: (key: string) => void;
}) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<OptionKind | "all" | null>(null);

  const ranked = rankedOptions(list, dist, abilities);
  const tiles = pickerTiles(ranked, recommendedKey);
  const rows = searchRows(ranked, tiles, query, kind, abilities);
  const filtering = query.trim() !== "" || kind !== null;
  const picked = list.find((o) => o.key === value);
  const changed = recommendedKey !== null && value !== recommendedKey;
  const p = (o: Option) => (dist ? (dist[o.key] ?? 0) : undefined);
  const kindLabel = (k: OptionKind | "all") => (k === "all" ? `All ${list.length}` : OPTION_KIND_LABEL[k]);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
        {label}
        {changed && <Badge tone="amber">Changed</Badge>}
      </legend>
      {tiles.map((o) => {
        const chance = p(o);
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`flex min-h-11 w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left ${on ? "border-2 border-(--accent) bg-(--accent-soft)" : "border border-stone-400 bg-white hover:bg-stone-50"}`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{o.name}</span>
              {chance !== undefined && <span className="text-sm tabular-nums text-stone-700">{pct(chance)}</span>}
            </span>
            <span className="text-xs text-stone-600">{optionSubtitle(o, abilities)}</span>
            {chance !== undefined && (
              <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-stone-200">
                <span className="block h-1 bg-(--accent)" style={{ width: pct(chance) }} />
              </span>
            )}
          </button>
        );
      })}
      {picked && !tiles.includes(picked) && (
        <div className="flex min-h-11 items-center justify-between rounded-lg border-2 border-(--accent) bg-(--accent-soft) px-3 text-sm font-semibold">
          <span>
            {picked.name}
            {p(picked) !== undefined && <span className="ml-1 font-normal tabular-nums">{pct(p(picked) ?? 0)}</span>}
          </span>
          {changed && <span className="text-xs font-medium text-(--accent-strong)">Changed</span>}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-500 bg-stone-50 text-sm hover:bg-stone-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        {open ? "Close search" : `Search all ${list.length} actions`}
      </button>

      {open && (
        <div className="space-y-2.5 rounded-lg border border-indigo-200 bg-white p-3">
          <div className="space-y-1">
            <label htmlFor={searchId} className="text-xs font-semibold text-stone-600">
              Search all {list.length} actions
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="Type a name, e.g. “dom”"
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-11 w-full rounded-md border-2 border-(--accent) bg-white px-2 text-sm"
            />
          </div>
          <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <ToggleChip key={k} pressed={kind === k} onToggle={(on) => setKind(on ? k : null)}>
                {kindLabel(k)}
              </ToggleChip>
            ))}
          </div>
          <div className="overflow-hidden rounded-md border border-stone-400">
            {rows.map((o) => {
              const chance = p(o);
              const on = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(o.key)}
                  className={`flex min-h-12 w-full items-center justify-between gap-2 border-b border-stone-100 px-2.5 py-1 text-left text-sm ${on ? "bg-(--accent-soft) font-semibold shadow-[inset_3px_0_0_var(--accent)]" : "bg-white hover:bg-stone-50"}`}
                >
                  <span className="flex flex-col gap-0.5">
                    <span>{o.name}</span>
                    <span className="text-xs font-normal text-stone-600">{optionSubtitle(o, abilities)}</span>
                  </span>
                  {chance !== undefined && <span className="text-sm font-normal tabular-nums text-stone-600">{pct(chance)}</span>}
                </button>
              );
            })}
            {rows.length === 0 && <p className="px-2.5 py-3 text-sm text-stone-600">No legal action matches.</p>}
            <p className="border-t border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600">
              {filtering
                ? `${rows.length} of ${list.length} match`
                : `The next ${rows.length} likeliest. Type or pick a kind to search all ${list.length}.`}
            </p>
          </div>
        </div>
      )}
    </fieldset>
  );
}
