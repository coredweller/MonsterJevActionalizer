import { describe, expect, it } from "vitest";
import { buildClusters } from "@/lib/decide/clusters";
import { CLUSTER_CANDIDATES, HISTORY_TURNS, SLOT_CANDIDATES, TARGET_CANDIDATES } from "@/lib/decide/constants";
import { askedNoulKeys, buildJevRequest, buildJevState, rankOptions } from "@/lib/decide/questions";
import { createTracker } from "@/lib/encounter/state";
import type { EncounterState, PlayerTurn, Settings, Situation, Temperament, Tracker, TurnLogEntry } from "@/lib/encounter/types";
import type { ChoiceQuestion, Question } from "@/lib/jev/types";
import { describeUses } from "@/lib/monster/describe";
import { buildLegalOptions, type LegalOptions } from "@/lib/monster/options";
import type { Ability, ReviewedMonster } from "@/lib/monster/types";
import { ability, extractedReviewed, handReviewed, playerTurn, situationWith } from "../helpers/reviewed";

const NOW = "2026-10-03T00:00:00.000Z";

interface Built {
  tracker: Tracker;
  situation: Situation;
  options: LegalOptions;
  result: ReturnType<typeof buildJevRequest>;
}

function build(
  reviewed: ReviewedMonster,
  players: PlayerTurn[],
  edit: Partial<EncounterState> = {},
  log: TurnLogEntry[] = [],
  settings: Partial<Settings> = {},
): Built {
  const created = createTracker(reviewed, "t1", NOW);
  const base = { ...created, settings: { ...created.settings, ...settings } };
  const situation = situationWith(players);
  const tracker: Tracker = {
    ...base,
    state: { ...base.state, ...edit },
    roster: players.map((p, i) => ({ id: p.playerId, name: `Hero ${i}`, role: "melee", class: "Fighter" })),
    situation,
    log,
  };
  const options = buildLegalOptions(tracker.reviewed, tracker.state, situation, tracker.settings.temperament);
  return { tracker, situation, options, result: buildJevRequest(tracker, situation, options) };
}

function choiceQ(questions: Record<string, Question>, key: string): ChoiceQuestion {
  const q = questions[key];
  if (!q) throw new Error(`No question "${key}" in ${Object.keys(questions).join(", ")}`);
  if (q.type !== "choice") throw new Error(`${key} is ${q.type}, not choice`);
  return q;
}

const criteriaKeys = (q: ChoiceQuestion) => Object.keys(q.criteria);
const questionKeys = (b: Built) => Object.keys(b.result.request.questions);

const attack = (id: string, kind: "melee" | "ranged", ft: number, avg: number, extra: Partial<Ability> = {}) =>
  ability({
    id,
    name: id,
    attack: kind === "melee" ? { kind, bonus: 5, reach: ft } : { kind, bonus: 5, range: { normal: ft } },
    damage: [{ dice: "1d4", avg, type: "slashing" }],
    ...extra,
  });

const area = (id: string, size: number, avg: number, extra: Partial<Ability> = {}) =>
  ability({ id, name: id, singleTarget: false, area: { shape: "sphere", size }, damage: [{ dice: "1d4", avg, type: "fire" }], ...extra });

const warpriestParty = [
  playerTurn({ playerId: "p0", zone: "engaged" }),
  playerTurn({ playerId: "p1", zone: "engaged" }),
  playerTurn({ playerId: "p2", zone: "near" }),
];

const CONTRACT_KEY = /^(tactic|move_before|action|bonus_action|move_after|multiattack_fallback|should_retreat|spend_resource|target__\d+|cluster__\d+|slot_level__\d+)$/;
const NOUL_KEYS = ["multiattack_fallback", "should_retreat", "spend_resource"];

describe("buildJevRequest: question keys", () => {
  it("builds only contract keys, with the contract's question types", () => {
    const b = build(extractedReviewed("AshenWarpriest"), warpriestParty);
    for (const key of questionKeys(b)) {
      expect(key).toMatch(CONTRACT_KEY);
      expect(b.result.request.questions[key]?.type).toBe(NOUL_KEYS.includes(key) ? "noul" : "choice");
    }
    expect(questionKeys(b)).toEqual(
      expect.arrayContaining(["tactic", "move_before", "action", "bonus_action", "move_after", "multiattack_fallback", "should_retreat", "spend_resource"]),
    );
  });

  it("tactic offers the six contract tactics", () => {
    const b = build(extractedReviewed("TunnelWasp"), warpriestParty);
    expect(criteriaKeys(choiceQ(b.result.request.questions, "tactic"))).toEqual([
      "aggressive",
      "focus_weakest",
      "focus_threat",
      "control",
      "defensive",
      "flee",
    ]);
  });

  it("leaves model out: the client fills it from JEV_MODEL", () => {
    const b = build(extractedReviewed("TunnelWasp"), warpriestParty);
    expect(Object.keys(b.result.request).sort()).toEqual(["questions", "state"]);
  });
});

describe("buildJevRequest: criteria come from the legal options", () => {
  it("action, bonus_action and movement criteria are exactly the legal keys", () => {
    const b = build(extractedReviewed("AshenWarpriest"), warpriestParty);
    const q = b.result.request.questions;
    expect(criteriaKeys(choiceQ(q, "action"))).toEqual(b.options.actions.map((o) => o.key));
    expect(criteriaKeys(choiceQ(q, "bonus_action"))).toEqual(b.options.bonusActions.map((o) => o.key));
    expect(criteriaKeys(choiceQ(q, "move_before"))).toEqual(b.options.movements);
    expect(criteriaKeys(choiceQ(q, "move_after"))).toEqual(b.options.movements);
  });

  it("an action criterion is its one-line summary plus a range flag", () => {
    const b = build(handReviewed("TunnelWasp", [attack("act_bite", "melee", 5, 7)]), [playerTurn({ playerId: "p0", zone: "far" })]);
    const text = choiceQ(b.result.request.questions, "action").criteria.act_bite;
    expect(text).toContain(b.options.actions[0]?.summary);
    expect(text).toMatch(/out of range/);
    expect(text).not.toMatch(/\n/);
  });

  it("every target, cluster and slot criterion maps back to something legal for its option", () => {
    const b = build(extractedReviewed("MaestroDrazzuk"), [
      playerTurn({ playerId: "p0", zone: "engaged" }),
      playerTurn({ playerId: "p1", zone: "near", clusteredWith: ["p2"] }),
      playerTurn({ playerId: "p2", zone: "near" }),
      playerTurn({ playerId: "p3", zone: "far", apparentHp: "down" }),
    ]);
    const { questions } = b.result.request;
    const { candidates } = b.result;
    const all = [...b.options.actions, ...b.options.bonusActions];
    const clusters = buildClusters(b.situation);
    let asked = 0;
    for (const c of candidates.targets) {
      const opt = all.find((o) => o.key === c.optionKey);
      expect(opt?.singleTarget).toBe(true);
      if (!c.asked) continue;
      asked++;
      const ids = criteriaKeys(choiceQ(questions, c.key)).map((k) => candidates.players[k]);
      expect(ids).toEqual(c.playerIds);
      if (opt?.range.kind === "ft") for (const id of ids) expect(opt.range.inRangeAfterMove).toContain(id);
    }
    for (const c of candidates.clusters) {
      expect(all.find((o) => o.key === c.optionKey)?.area).toBe(true);
      if (!c.asked) continue;
      asked++;
      const ids = criteriaKeys(choiceQ(questions, c.key)).map((k) => candidates.clusterKeys[k]?.id);
      expect(ids).toEqual(c.clusterIds);
      for (const id of ids) expect(clusters.map((x) => x.id)).toContain(id);
    }
    for (const c of candidates.slotLevels) {
      const levels = all.find((o) => o.key === c.optionKey)?.leveledSpell?.availableLevels;
      expect(c.levels).toEqual(levels);
      if (!c.asked) continue;
      asked++;
      expect(criteriaKeys(choiceQ(questions, c.key))).toEqual(c.levels.map((n) => `level__${n}`));
    }
    expect(asked).toBeGreaterThan(0);
  });
});

describe("buildJevRequest: downed players (PLAN.md 'Legal options')", () => {
  // Bite reaches everyone engaged; Curse targets a creature but has no readable range.
  const curse = ability({ id: "act_curse", name: "Curse", raw: "The monster curses one creature it can see." });
  const reviewed = handReviewed("TunnelWasp", [attack("act_bite", "melee", 5, 7), curse]);
  const players = [
    playerTurn({ playerId: "p0", zone: "engaged", apparentHp: "down" }),
    playerTurn({ playerId: "p1", zone: "engaged" }),
    playerTurn({ playerId: "p2", zone: "engaged" }),
  ];

  it.each([
    ["mindless", ["p1", "p2"]],
    ["cunning", ["p1", "p2"]],
    ["feral", ["p0", "p1", "p2"]],
    ["genius", ["p0", "p1", "p2"]],
  ] as const satisfies readonly (readonly [Temperament, readonly string[]])[])("%s: target questions offer %j", (temperament, expected) => {
    const b = build(reviewed, players, {}, [], { temperament });
    const { targets, players: keyToId } = b.result.candidates;
    expect(targets.map((c) => c.optionKey)).toEqual(["act_bite", "act_curse"]);
    for (const c of targets) {
      expect(c.playerIds).toEqual(expected);
      expect(criteriaKeys(choiceQ(b.result.request.questions, c.key)).map((k) => keyToId[k])).toEqual(expected);
    }
  });
});

describe("buildJevRequest: total cover (F31)", () => {
  const curse = ability({ id: "act_curse", name: "Curse", raw: "The monster curses one creature it can see." });
  const reviewed = handReviewed("TunnelWasp", [attack("act_bite", "melee", 5, 7), curse]);
  const players = [
    playerTurn({ playerId: "p0", zone: "engaged", cover: "total" }),
    playerTurn({ playerId: "p1", zone: "engaged" }),
    playerTurn({ playerId: "p2", zone: "engaged" }),
  ];

  it("single-target questions never offer a player behind total cover, whether the range is known or not", () => {
    const { targets } = build(reviewed, players).result.candidates;
    expect(targets.map((c) => [c.optionKey, c.playerIds])).toEqual([
      ["act_bite", ["p1", "p2"]],
      ["act_curse", ["p1", "p2"]],
    ]);
  });
});

describe("buildJevRequest: questions with fewer than 2 keys are not asked", () => {
  it("every asked choice question has 2–255 criteria", () => {
    for (const name of ["TunnelWasp", "AshenWarpriest", "MaestroDrazzuk", "BriarthornHag"]) {
      const b = build(extractedReviewed(name), warpriestParty);
      for (const q of Object.values(b.result.request.questions)) {
        if (q.type !== "choice") continue;
        expect(Object.keys(q.criteria).length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(q.criteria).length).toBeLessThanOrEqual(255);
      }
    }
  });

  it("hold-only movement → no move_before or move_after", () => {
    const b = build(extractedReviewed("TunnelWasp"), warpriestParty, { conditions: ["grappled"] });
    expect(questionKeys(b)).not.toContain("move_before");
    expect(questionKeys(b)).not.toContain("move_after");
  });

  it("only `none` as a bonus action → no bonus_action question", () => {
    const b = build(extractedReviewed("TunnelWasp"), warpriestParty);
    expect(questionKeys(b)).not.toContain("bonus_action");
  });

  it("one reachable player → target candidates are listed but not asked", () => {
    const b = build(extractedReviewed("TunnelWasp"), [playerTurn({ playerId: "p0", zone: "engaged" })]);
    expect(b.result.candidates.targets.length).toBeGreaterThan(0);
    for (const c of b.result.candidates.targets) {
      expect(c.asked).toBe(false);
      expect(c.playerIds).toEqual(["p0"]);
    }
    expect(questionKeys(b).filter((k) => k.startsWith("target__"))).toEqual([]);
  });
});

describe("buildJevRequest: candidates ranked per research R5", () => {
  // Speed 20; players at 30, 60 and 200 ft.
  const players = [
    playerTurn({ playerId: "p0", zone: "near" }),
    playerTurn({ playerId: "p1", zone: "far" }),
    playerTurn({ playerId: "p2", zone: "veryFar", distanceFt: 200 }),
  ];

  it("target__<i> goes to the top 4 single-target options: in range now, then after moving, then out of range; unlimited first; then damage", () => {
    const reviewed = handReviewed(
      "TunnelWasp",
      [
        attack("act_bite", "melee", 5, 10), // out of range even after moving
        attack("act_claw", "melee", 5, 5), // out of range even after moving
        attack("act_spit", "ranged", 60, 3), // now: p0, p1
        ability({ id: "act_longbow", name: "Longbow", attack: { kind: "ranged", bonus: 5, range: { normal: 150, long: 600 } }, damage: [{ dice: "1d8", avg: 7, type: "piercing" }] }),
        attack("act_crush", "melee", 15, 30, { uses: { kind: "recharge", min: 5 } }), // after moving: p0, limited
        attack("act_tail", "melee", 10, 8), // after moving: p0
        ability({ id: "act_gaze", name: "Gaze", rangeFt: 30, save: { ability: "Wisdom", dc: 13 }, damage: [{ dice: "1d10", avg: 6, type: "psychic" }] }), // now: p0
      ],
      { speed: { walk: 20 } },
    );
    const b = build(reviewed, players);
    const { targets } = b.result.candidates;
    expect(TARGET_CANDIDATES).toBe(4);
    expect(targets.map((c) => c.optionKey)).toEqual(["act_longbow", "act_gaze", "act_spit", "act_tail"]);
    expect(targets.map((c) => c.key)).toEqual(["target__0", "target__1", "target__2", "target__3"]);
    expect(targets.map((c) => c.asked)).toEqual([true, false, true, false]);
    expect(targets.map((c) => c.playerIds)).toEqual([["p0", "p1", "p2"], ["p0"], ["p0", "p1"], ["p0"]]);
    expect(questionKeys(b).filter((k) => k.startsWith("target__"))).toEqual(["target__0", "target__2"]);
  });

  it("a limited option ranks after an unlimited one in the same range band, despite more damage", () => {
    const reviewed = handReviewed(
      "TunnelWasp",
      [attack("act_big", "ranged", 120, 40, { uses: { kind: "per-day", max: 1 } }), attack("act_small", "ranged", 120, 2)],
      { speed: { walk: 20 } },
    );
    expect(build(reviewed, players).result.candidates.targets.map((c) => c.optionKey)).toEqual(["act_small", "act_big"]);
  });

  it("ties keep statblock order, and bonus actions are candidates too", () => {
    const reviewed = handReviewed(
      "TunnelWasp",
      [attack("act_a", "ranged", 120, 5), attack("bon_b", "ranged", 120, 5, { source: "BonusActions", category: "bonus" }), attack("act_c", "ranged", 120, 5)],
      { speed: { walk: 20 } },
    );
    const targets = build(reviewed, players).result.candidates.targets;
    expect(targets.map((c) => [c.optionKey, c.list])).toEqual([
      ["act_a", "actions"],
      ["act_c", "actions"],
      ["bon_b", "bonusActions"],
    ]);
  });

  it("rankOptions ranks one option list the same way (interpret's fallback when Jev's answer is unusable)", () => {
    const reviewed = handReviewed(
      "TunnelWasp",
      [
        attack("act_bite", "melee", 5, 10), // out of range even after moving
        attack("act_crush", "melee", 15, 30, { uses: { kind: "recharge", min: 5 } }), // after moving, limited
        attack("act_tail", "melee", 10, 8), // after moving
        attack("act_spit", "ranged", 60, 3), // now
      ],
      { speed: { walk: 20 } },
    );
    const { options, tracker } = build(reviewed, players);
    // Basic actions have no target (band 0), no resource and no damage, so they follow Spit in legal order.
    expect(rankOptions(options.actions, tracker.reviewed.abilities).map((o) => o.key)).toEqual([
      "act_spit",
      "dash",
      "dodge",
      "disengage",
      "hide",
      "help",
      "act_tail",
      "act_crush",
      "act_bite",
    ]);
  });

  it("cluster__<i> goes to the top 3 area options, offering clusters with someone in reach; the criterion shows the count caught", () => {
    const clustered = [
      playerTurn({ playerId: "p0", zone: "near", clusteredWith: ["p1"] }),
      playerTurn({ playerId: "p1", zone: "near" }),
      playerTurn({ playerId: "p2", zone: "far" }),
      playerTurn({ playerId: "p3", zone: "veryFar", distanceFt: 200 }),
    ];
    const reviewed = handReviewed(
      "TunnelWasp",
      [
        area("act_breath", 30, 20, { uses: { kind: "recharge", min: 5 } }), // self cone 30: now p0, p1; limited
        area("act_shatter", 10, 13, { rangeFt: 60 }), // now p0, p1, p2
        area("act_quake", 10, 9), // self 10: after moving p0, p1
        area("act_burst", 10, 5, { rangeFt: 120 }), // now p0, p1, p2
      ],
      { speed: { walk: 20 } },
    );
    const b = build(reviewed, clustered);
    const { clusters } = b.result.candidates;
    expect(CLUSTER_CANDIDATES).toBe(3);
    expect(clusters.map((c) => c.optionKey)).toEqual(["act_shatter", "act_burst", "act_breath"]);
    expect(clusters.map((c) => c.clusterIds)).toEqual([["cluster_0", "cluster_1"], ["cluster_0", "cluster_1"], ["cluster_0"]]);
    expect(clusters.map((c) => c.asked)).toEqual([true, true, false]);
    const q = choiceQ(b.result.request.questions, "cluster__0");
    expect(criteriaKeys(q)).toEqual(["cluster__0", "cluster__1"]);
    expect(q.criteria.cluster__0).toMatch(/catches 2/);
    expect(questionKeys(b)).not.toContain("cluster__2");
  });
});

describe("buildJevRequest: conditional questions", () => {
  it("slot_level__<i> only for leveled candidates with a choice of level", () => {
    const full = build(extractedReviewed("AshenWarpriest"), warpriestParty);
    const slotKeys = questionKeys(full).filter((k) => k.startsWith("slot_level__"));
    expect(slotKeys.length).toBeGreaterThan(0);
    expect(full.result.candidates.slotLevels.length).toBeLessThanOrEqual(SLOT_CANDIDATES);
    for (const c of full.result.candidates.slotLevels) expect(c.asked).toBe(c.levels.length >= 2);

    const onlyFirst = build(extractedReviewed("AshenWarpriest"), warpriestParty, { slots: { "1": 4, "2": 0, "3": 0 } });
    expect(questionKeys(onlyFirst).filter((k) => k.startsWith("slot_level__"))).toEqual([]);

    const noSpells = build(extractedReviewed("TunnelWasp"), warpriestParty);
    expect(noSpells.result.candidates.slotLevels).toEqual([]);
  });

  it("multiattack_fallback only when Multiattack is legal", () => {
    expect(questionKeys(build(extractedReviewed("TunnelWasp"), warpriestParty))).toContain("multiattack_fallback");
    const noMulti = handReviewed("TunnelWasp", [attack("act_bite", "melee", 5, 7)]);
    expect(questionKeys(build(noMulti, warpriestParty))).not.toContain("multiattack_fallback");
  });

  it("spend_resource only when some legal option uses a limited resource", () => {
    expect(questionKeys(build(extractedReviewed("TunnelWasp"), warpriestParty))).not.toContain("spend_resource");
    expect(questionKeys(build(extractedReviewed("AshenWarpriest"), warpriestParty))).toContain("spend_resource");
    // The Tiefling's only limited ability (Infernal Rebuke) is a reaction, so it's never an option.
    const enforcer = build(extractedReviewed("TieflingEnforcer"), warpriestParty);
    expect(questionKeys(enforcer)).not.toContain("spend_resource");
  });

  it("should_retreat is always asked", () => {
    expect(questionKeys(build(extractedReviewed("TunnelWasp"), warpriestParty))).toContain("should_retreat");
  });

  it("askedNoulKeys lists exactly the noul questions the request asks (interpret ignores any other noul)", () => {
    const monsters = [extractedReviewed("TunnelWasp"), extractedReviewed("AshenWarpriest"), handReviewed("TunnelWasp", [attack("act_bite", "melee", 5, 7)])];
    for (const reviewed of monsters) {
      const b = build(reviewed, warpriestParty);
      const nouls = Object.entries(b.result.request.questions).filter(([, q]) => q.type === "noul").map(([k]) => k);
      expect(askedNoulKeys(b.options)).toEqual(nouls);
    }
  });
});

describe("buildJevState", () => {
  const entry = (round: number): TurnLogEntry => ({
    round,
    moveBefore: "hold",
    actionId: "act_mace",
    actionName: "Mace",
    targetIds: ["p0"],
    bonusActionId: null,
    bonusActionName: "None",
    bonusTargetIds: [],
    moveAfter: "hold",
    recommended: true,
  });

  it("includes only the last 3 log entries", () => {
    const log = [1, 2, 3, 4, 5].map(entry);
    const b = build(extractedReviewed("AshenWarpriest"), warpriestParty, {}, log);
    const state = buildJevState(b.tracker, b.situation, b.options);
    expect(HISTORY_TURNS).toBe(3);
    expect(state.history).toEqual(log.slice(-3));
    expect(b.result.request.state).toEqual(state);
  });

  it("includes the raw text of every ability the extractor couldn't parse, and only those", () => {
    const reviewed = extractedReviewed("BriarthornHag");
    const unparsed = reviewed.abilities.filter((a) => a.parsed === "none");
    expect(unparsed.length).toBeGreaterThan(0);
    const b = build(reviewed, warpriestParty);
    const { rawUnparsed } = buildJevState(b.tracker, b.situation, b.options).monster;
    expect(rawUnparsed).toHaveLength(unparsed.length);
    unparsed.forEach((a, i) => expect(rawUnparsed[i]).toContain(a.raw));
  });

  it("states each ability's uses exactly once in its summary (no 'recharge 5–6 (recharge 5–6)')", () => {
    for (const name of ["MaestroDrazzuk", "AshenWarpriest", "TunnelWasp"]) {
      const b = build(extractedReviewed(name), warpriestParty);
      const { abilities } = buildJevState(b.tracker, b.situation, b.options).monster;
      for (const a of b.tracker.reviewed.abilities) {
        const summary = abilities.find((x) => x.id === a.id)?.summary ?? "";
        const phrase = describeUses(a.uses);
        expect(summary.split(phrase).length - 1, `${name} ${a.id}: ${summary}`).toBe(1);
      }
    }
  });

  it("includes temperament and morale from the tracker's settings, the encounter state and HP", () => {
    const b = build(extractedReviewed("TieflingEnforcer"), warpriestParty, { hp: 20 });
    const tracker: Tracker = { ...b.tracker, settings: { ...b.tracker.settings, temperament: "feral", morale: 10 } };
    const state = buildJevState(tracker, b.situation, b.options);
    expect(state.temperament).toBe("feral");
    expect(state.morale.value).toBe(10);
    expect(state.morale.words).toMatch(/cowardly/i);
    expect(state.monster.hp).toEqual({ current: 20, max: tracker.state.hpMax });
    expect(state.encounter).toEqual(tracker.state);
  });

  it("refers to players by criterion key and roster label, and lists clusters with their size", () => {
    const b = build(extractedReviewed("TunnelWasp"), [
      playerTurn({ playerId: "p0", zone: "near", clusteredWith: ["p1"] }),
      playerTurn({ playerId: "p1", zone: "near" }),
    ]);
    const state = buildJevState(b.tracker, b.situation, b.options);
    expect(state.situation.players.map((p) => [p.key, p.label])).toEqual([
      ["player__0", "player 0: Hero 0 (melee, Fighter)"],
      ["player__1", "player 1: Hero 1 (melee, Fighter)"],
    ]);
    expect(state.situation.players[0]?.clusteredWith).toEqual(["player__1"]);
    expect(state.clusters).toEqual([{ id: "cluster__0", players: ["player__0", "player__1"], size: 2 }]);
  });
});
