"use client";

/**
 * The ONLY localStorage access in the app. Every getItem/setItem is wrapped in try/catch;
 * unreadable data is kept under the `.corrupt` key and the app starts empty.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parse, serialize, type Store } from "@/lib/encounter/storage";
import type { Tracker } from "@/lib/encounter/types";

export const STORAGE_KEY = "mja.v1.trackers";
export const CORRUPT_KEY = "mja.v1.trackers.corrupt";

function emptyStore(): Store {
  return { version: 1, selectedId: null, trackers: [] };
}

function load(): { store: Store; warning: string | null } {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { store: emptyStore(), warning: "Saved trackers can't be read in this browser. Changes won't be kept." };
  }
  const result = parse(text);
  if (result.ok) return { store: result.store, warning: null };
  try {
    window.localStorage.setItem(CORRUPT_KEY, result.raw);
  } catch {
    // Best effort: the warning below still tells the DM their data wasn't loaded.
  }
  return {
    store: result.empty,
    warning: `Saved trackers were unreadable, so the app started empty. The old data is kept under "${CORRUPT_KEY}".`,
  };
}

export interface UseTrackers {
  loaded: boolean;
  trackers: Tracker[];
  selected: Tracker | null;
  select: (id: string | null) => void;
  upsert: (tracker: Tracker) => void;
  remove: (id: string) => void;
  storageWarning: string | null;
  dismissWarning: () => void;
}

export function useTrackers(): UseTrackers {
  const [store, setStore] = useState<Store>(emptyStore);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    const { store: initial, warning } = load();
    setStore(initial);
    setStorageWarning(warning);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Don't write back what was just loaded (that would overwrite nothing useful, or a corrupt blob's slot).
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, serialize(store));
    } catch {
      setStorageWarning("Couldn't save trackers (storage full or blocked). This session still works, but changes may be lost on reload.");
    }
  }, [store, loaded]);

  const select = useCallback((id: string | null) => setStore((s) => ({ ...s, selectedId: id })), []);

  const upsert = useCallback((tracker: Tracker) => {
    setStore((s) => {
      const exists = s.trackers.some((t) => t.id === tracker.id);
      return {
        ...s,
        trackers: exists ? s.trackers.map((t) => (t.id === tracker.id ? tracker : t)) : [...s.trackers, tracker],
      };
    });
  }, []);

  const remove = useCallback((id: string) => {
    setStore((s) => {
      const trackers = s.trackers.filter((t) => t.id !== id);
      return { ...s, trackers, selectedId: s.selectedId === id ? (trackers[0]?.id ?? null) : s.selectedId };
    });
  }, []);

  const dismissWarning = useCallback(() => setStorageWarning(null), []);

  const selected = store.trackers.find((t) => t.id === store.selectedId) ?? null;
  return { loaded, trackers: store.trackers, selected, select, upsert, remove, storageWarning, dismissWarning };
}
