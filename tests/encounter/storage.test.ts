import { describe, expect, it } from "vitest";
import { createTracker } from "@/lib/encounter/state";
import { EMPTY_STORE, parse, serialize } from "@/lib/encounter/storage";
import { ability, handReviewed } from "../helpers/reviewed";

const tracker = createTracker(handReviewed("TunnelWasp", [ability({ id: "act_sting", name: "Sting" })]), "t1", "2026-10-03T00:00:00.000Z");

describe("storage", () => {
  it("round-trips a store through serialize and parse", () => {
    const store = { version: 1 as const, selectedId: "t1", trackers: [tracker] };
    const result = parse(serialize(store));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.store).toEqual(store);
  });

  it("returns the empty default for a missing value", () => {
    expect(parse(null)).toEqual({ ok: true, store: EMPTY_STORE });
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a wrong version", JSON.stringify({ version: 2, selectedId: null, trackers: [] })],
    ["schema-invalid data", JSON.stringify({ version: 1, selectedId: null, trackers: [{ id: "x" }] })],
  ])("returns { ok: false, empty, raw } for %s", (_, text) => {
    const result = parse(text);
    expect(result).toEqual({ ok: false, empty: { version: 1, selectedId: null, trackers: [] }, raw: text });
  });
});
