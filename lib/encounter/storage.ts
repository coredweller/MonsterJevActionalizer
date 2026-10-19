/**
 * Pure serialize/parse for saved trackers (contracts/cli-and-storage.md). The localStorage
 * calls themselves live in app/useTrackers.ts.
 */
import { z } from "zod";
import { TrackerSchema } from "./types";

export const StoreSchema = z.object({
  version: z.literal(1),
  selectedId: z.string().nullable(),
  trackers: z.array(TrackerSchema),
});
export type Store = z.infer<typeof StoreSchema>;

export const EMPTY_STORE: Store = Object.freeze({ version: 1, selectedId: null, trackers: [] }) as Store;

export type ParseResult = { ok: true; store: Store } | { ok: false; empty: Store; raw: string };

export function serialize(store: Store): string {
  return JSON.stringify(store);
}

/** `null` (nothing saved) is the empty store. Unreadable or invalid text is reported with the raw blob. */
export function parse(text: string | null): ParseResult {
  if (text === null) return { ok: true, store: emptyStore() };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, empty: emptyStore(), raw: text };
  }
  const result = StoreSchema.safeParse(json);
  return result.success ? { ok: true, store: result.data } : { ok: false, empty: emptyStore(), raw: text };
}

function emptyStore(): Store {
  return { version: 1, selectedId: null, trackers: [] };
}
