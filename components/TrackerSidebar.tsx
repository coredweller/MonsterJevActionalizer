"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tracker } from "@/lib/encounter/types";
import { Button, panelFrame } from "./ui";

interface TrackerSidebarProps {
  /** The aside's id, for the header button's `aria-controls`. */
  readonly id: string;
  /** Whether the drawer is open. Only matters below `xl`, where the sidebar is a drawer; from `xl` up it's always shown. */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly loaded: boolean;
  readonly trackers: readonly Tracker[];
  /** The highlighted tracker, or null when none is (e.g. while a monster is being loaded). */
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (tracker: Tracker) => void;
  /** Shown under the trackers list (the selected tracker's party). Editing it leaves the drawer open. */
  readonly children?: ReactNode;
  /** Called only after the DM confirms. */
  readonly onDelete: (id: string) => void;
}

/**
 * The list of trackers, with `children` under it. Presentational: the caller owns the trackers and
 * the drawer's open state. The aside is rendered once and restyled by breakpoint: an off-canvas
 * drawer below `xl`, a grid column from `xl` up. Any action taken in the trackers list closes it.
 * While a tracker is selected only it is listed; "Show all" opens the rest, and picking, adding or
 * duplicating one collapses the list again.
 */
export function TrackerSidebar({ id, open, onClose, loaded, trackers, selectedId, onSelect, onAdd, onDuplicate, onDelete, children }: TrackerSidebarProps) {
  const drawer = useRef<HTMLElement>(null);
  // With a tracker selected, the list collapses to just that one until the DM asks for all of them.
  const [showAll, setShowAll] = useState(false);
  const selectedTracker = trackers.find((t) => t.id === selectedId);
  const collapsible = selectedTracker !== undefined && trackers.length > 1;
  const listed = collapsible && !showAll ? [selectedTracker] : trackers;

  // Moves focus into the drawer when it opens, so the keyboard starts there. No focus trap (kept simple).
  useEffect(() => {
    if (open) drawer.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function act(action: () => void) {
    action();
    setShowAll(false);
    onClose();
  }

  function remove(tracker: Tracker) {
    if (!window.confirm(`Delete ${tracker.name}? Its HP, resources, situation and turn log are lost.`)) return;
    act(() => onDelete(tracker.id));
  }

  return (
    <>
      {open && <div aria-hidden="true" className="fixed inset-0 z-30 bg-stone-900/40 xl:hidden" onClick={onClose} />}
      <aside
        ref={drawer}
        id={id}
        aria-label="Trackers"
        tabIndex={-1}
        className={`min-w-0 flex-col gap-4 focus:outline-none ${open ? "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] overflow-y-auto bg-paper p-3 shadow-lg xl:static xl:z-auto xl:w-auto xl:max-w-none xl:overflow-visible xl:bg-transparent xl:p-0 xl:shadow-none" : "hidden xl:flex"}`}
      >
        <div className={`accent-monster ${panelFrame} p-3`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-(--accent-strong)">Trackers</h2>
            <div className="flex gap-2">
              <Button onClick={() => act(onAdd)}>Add monster</Button>
              <Button variant="ghost" className="xl:hidden" aria-label="Close trackers" onClick={onClose}>
                ✕
              </Button>
            </div>
          </div>
          {!loaded ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : trackers.length === 0 ? (
            <p className="text-sm text-stone-500">No trackers yet.</p>
          ) : (
            <ul className="space-y-2">
              {listed.map((t) => {
                const selected = t.id === selectedId;
                return (
                  <li key={t.id} className="space-y-1">
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      className={`min-h-11 w-full rounded px-2 py-1 text-left ${selected ? "bg-(--accent) font-semibold text-white" : "hover:bg-(--accent-soft)"}`}
                      onClick={() => act(() => onSelect(t.id))}
                    >
                      <span className="block">{t.name}</span>
                      <span className={`block text-xs font-normal ${selected ? "" : "text-stone-600"}`}>
                        HP {t.state.hp}/{t.state.hpMax} · Round {t.state.round}
                      </span>
                    </button>
                    <div className="flex gap-1">
                      <Button variant="ghost" aria-label={`Duplicate ${t.name}`} onClick={() => act(() => onDuplicate(t))}>
                        Duplicate
                      </Button>
                      <Button variant="danger" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {collapsible && (
            <Button variant="ghost" className="mt-2 w-full" aria-expanded={showAll} onClick={() => setShowAll((all) => !all)}>
              {showAll ? "Show selected only" : `Show all (${trackers.length})`}
            </Button>
          )}
        </div>
        {children}
      </aside>
    </>
  );
}
