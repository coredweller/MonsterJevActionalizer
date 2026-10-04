import { describe, expect, it } from "vitest";
import { blankSituation, defaultPlayerTurn, syncSituation, updatePlayerTurn } from "@/lib/encounter/state";
import { SituationSchema, type Player, type PlayerTurn, type Situation } from "@/lib/encounter/types";

const player = (id: string): Player => ({ id, name: id.toUpperCase(), role: "melee", class: "Fighter" });
const turn = (playerId: string, patch: Partial<PlayerTurn> = {}): PlayerTurn => ({ ...defaultPlayerTurn(playerId), ...patch });
const withPlayers = (players: PlayerTurn[]): Situation => ({ ...blankSituation(), players });
const links = (s: Situation) => Object.fromEntries(s.players.map((p) => [p.playerId, [...p.clusteredWith].sort()]));

describe("defaultPlayerTurn", () => {
  it("is near, healthy, no conditions, no cover, didn't hit, not clustered", () => {
    expect(defaultPlayerTurn("a")).toEqual({
      playerId: "a",
      zone: "near",
      apparentHp: "healthy",
      conditions: [],
      cover: "none",
      hitMonsterLastRound: false,
      clusteredWith: [],
    });
  });
});

describe("syncSituation", () => {
  it("adds a default turn per roster player, in roster order", () => {
    const s = syncSituation(blankSituation(), [player("a"), player("b")]);
    expect(s.players).toEqual([defaultPlayerTurn("a"), defaultPlayerTurn("b")]);
    expect(SituationSchema.safeParse(s).success).toBe(true);
  });

  it("keeps carried-over turns, reorders them to the roster and defaults new players", () => {
    const carried = withPlayers([turn("b", { zone: "far", apparentHp: "bloodied", distanceFt: 45 }), turn("a", { cover: "half" })]);
    const s = syncSituation(carried, [player("a"), player("c"), player("b")]);
    expect(s.players).toEqual([turn("a", { cover: "half" }), defaultPlayerTurn("c"), turn("b", { zone: "far", apparentHp: "bloodied", distanceFt: 45 })]);
  });

  it("drops a removed player's turn and removes them from everyone's clusteredWith", () => {
    const carried = withPlayers([turn("a", { clusteredWith: ["b", "c"] }), turn("b", { clusteredWith: ["a"] }), turn("c", { clusteredWith: ["a"] })]);
    const s = syncSituation(carried, [player("a"), player("c")]);
    expect(s.players.map((p) => p.playerId)).toEqual(["a", "c"]);
    expect(links(s)).toEqual({ a: ["c"], c: ["a"] });
  });

  it("makes one-sided links symmetric and drops self links, unknown ids and duplicates", () => {
    const carried = withPlayers([turn("a", { clusteredWith: ["b", "b", "a", "ghost"] }), turn("b"), turn("c", { clusteredWith: ["b"] })]);
    const s = syncSituation(carried, [player("a"), player("b"), player("c")]);
    expect(links(s)).toEqual({ a: ["b"], b: ["a", "c"], c: ["b"] });
  });

  it("keeps allies, terrain and notes, and does not mutate its input", () => {
    const carried: Situation = {
      players: [turn("a", { clusteredWith: ["b"] }), turn("b")],
      allies: { present: true, count: 3 },
      terrain: { difficult: true, chokepoint: false, escapeRoute: true, flyingPossible: false },
      notes: "bridge",
    };
    const before = structuredClone(carried);
    const s = syncSituation(carried, [player("a"), player("b")]);
    expect(s.allies).toEqual(carried.allies);
    expect(s.terrain).toEqual(carried.terrain);
    expect(s.notes).toBe("bridge");
    expect(carried).toEqual(before);
  });

  it("returns no players for an empty roster", () => {
    expect(syncSituation(withPlayers([turn("a")]), []).players).toEqual([]);
  });
});

describe("updatePlayerTurn", () => {
  const base = withPlayers([turn("a"), turn("b"), turn("c")]);

  it("replaces the matching player's fields and leaves the others alone", () => {
    const s = updatePlayerTurn(base, turn("b", { zone: "engaged", hitMonsterLastRound: true, conditions: ["prone"] }));
    expect(s.players[1]).toEqual(turn("b", { zone: "engaged", hitMonsterLastRound: true, conditions: ["prone"] }));
    expect(s.players[0]).toEqual(base.players[0]);
    expect(s.players[2]).toEqual(base.players[2]);
  });

  it("clears an exact distance when the new turn has none", () => {
    const s = updatePlayerTurn(withPlayers([turn("a", { distanceFt: 20 })]), turn("a"));
    expect(s.players[0]).not.toHaveProperty("distanceFt");
  });

  it("mirrors an added cluster link onto the other player", () => {
    const s = updatePlayerTurn(base, turn("a", { clusteredWith: ["c"] }));
    expect(links(s)).toEqual({ a: ["c"], b: [], c: ["a"] });
  });

  it("mirrors a removed cluster link onto the other player", () => {
    const linked = updatePlayerTurn(base, turn("a", { clusteredWith: ["b", "c"] }));
    const s = updatePlayerTurn(linked, turn("a", { clusteredWith: ["b"] }));
    expect(links(s)).toEqual({ a: ["b"], b: ["a"], c: [] });
  });

  it("keeps the other players' links to third parties", () => {
    const linked = updatePlayerTurn(base, turn("b", { clusteredWith: ["c"] }));
    const s = updatePlayerTurn(linked, turn("a", { clusteredWith: ["b"] }));
    expect(links(s)).toEqual({ a: ["b"], b: ["a", "c"], c: ["b"] });
  });

  it("drops self links, unknown ids and duplicates from the new turn", () => {
    const s = updatePlayerTurn(base, turn("a", { clusteredWith: ["a", "ghost", "b", "b"] }));
    expect(links(s)).toEqual({ a: ["b"], b: ["a"], c: [] });
    expect(SituationSchema.safeParse(s).success).toBe(true);
  });

  it("throws for a player who is not in the situation", () => {
    expect(() => updatePlayerTurn(base, turn("ghost"))).toThrow(/ghost/);
  });
});
