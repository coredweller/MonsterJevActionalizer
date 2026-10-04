import { describe, expect, it } from "vitest";
import { buildClusters } from "@/lib/decide/clusters";
import { playerTurn, situationWith } from "../helpers/reviewed";

const members = (clusters: ReturnType<typeof buildClusters>) => clusters.map((c) => c.playerIds);

describe("buildClusters", () => {
  it("is empty when there are no players", () => {
    expect(buildClusters(situationWith([]))).toEqual([]);
  });

  it("gives every unclustered player a singleton cluster", () => {
    const s = situationWith([playerTurn({ playerId: "a" }), playerTurn({ playerId: "b" })]);
    expect(members(buildClusters(s))).toEqual([["a"], ["b"]]);
  });

  it("joins connected players transitively, even when only one side lists the other", () => {
    const s = situationWith([
      playerTurn({ playerId: "a", clusteredWith: ["b"] }),
      playerTurn({ playerId: "b", clusteredWith: ["a"] }),
      playerTurn({ playerId: "c" }),
      playerTurn({ playerId: "d", clusteredWith: ["e"] }),
      playerTurn({ playerId: "e" }),
      playerTurn({ playerId: "f", clusteredWith: ["c"] }),
      playerTurn({ playerId: "g", clusteredWith: ["b"] }),
    ]);
    expect(members(buildClusters(s))).toEqual([["a", "b", "g"], ["c", "f"], ["d", "e"]]);
  });

  it("ignores self-references and players who aren't in the situation", () => {
    const s = situationWith([
      playerTurn({ playerId: "a", clusteredWith: ["a", "ghost"] }),
      playerTurn({ playerId: "b", clusteredWith: ["ghost"] }),
    ]);
    expect(members(buildClusters(s))).toEqual([["a"], ["b"]]);
  });

  it("includes and counts downed players", () => {
    const s = situationWith([
      playerTurn({ playerId: "caster", apparentHp: "down", zone: "far" }),
      playerTurn({ playerId: "x", clusteredWith: ["y"] }),
      playerTurn({ playerId: "y", apparentHp: "down" }),
    ]);
    const clusters = buildClusters(s);
    expect(members(clusters)).toEqual([["caster"], ["x", "y"]]);
    expect(clusters.map((c) => c.playerIds.length)).toEqual([1, 2]);
  });

  it("gives each cluster a unique id, stable for the same situation", () => {
    const s = situationWith([
      playerTurn({ playerId: "a", clusteredWith: ["b"] }),
      playerTurn({ playerId: "b" }),
      playerTurn({ playerId: "c" }),
    ]);
    const ids = buildClusters(s).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildClusters(s).map((c) => c.id)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });
});
