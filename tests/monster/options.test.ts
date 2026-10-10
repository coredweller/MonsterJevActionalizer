import { describe, expect, it } from "vitest";
import { freshState } from "@/lib/encounter/state";
import type { Condition, EncounterState, Movement, Situation, Temperament } from "@/lib/encounter/types";
import { buildLegalOptions, type LegalOptions, type Option } from "@/lib/monster/options";
import type { Ability, ReviewedMonster } from "@/lib/monster/types";
import { loadMonsterFixtures } from "../helpers/fixtures";
import { ability, extractedReviewed, handReviewed, playerTurn, situationWith, slots } from "../helpers/reviewed";

const ALL_MOVES: Movement[] = ["hold", "closeIn", "reachOther", "retreat", "takeCover"];
const BASIC_KEYS = ["dash", "dodge", "disengage", "hide", "help"];

const mace = ability({ id: "act_mace", name: "Mace", attack: { kind: "melee", bonus: 6, reach: 5 } });
const crossbow = ability({
  id: "act_light_crossbow",
  name: "Light Crossbow",
  attack: { kind: "ranged", bonus: 5, range: { normal: 80, long: 320 } },
});

const oneEngaged = situationWith([playerTurn({ playerId: "p1", zone: "engaged" })]);

/** The DM ticked "Flying not possible" (a low ceiling, say). */
const noFlying = (s: Situation): Situation => ({ ...s, terrain: { ...s.terrain, flyingPossible: false } });

/** Defaults to a genius monster, which may target anyone, so only the downed-player tests depend on temperament. */
function build(reviewed: ReviewedMonster, situation: Situation = oneEngaged, edit: Partial<EncounterState> = {}, temperament: Temperament = "genius"): LegalOptions {
  return buildLegalOptions(reviewed, { ...freshState(reviewed), ...edit }, situation, temperament);
}

const keys = (opts: Option[]) => opts.map((o) => o.key);

function option(opts: Option[], key: string): Option {
  const found = opts.find((o) => o.key === key);
  if (!found) throw new Error(`No option "${key}" in ${keys(opts).join(", ")}`);
  return found;
}

function rangeOf(o: Option) {
  if (o.range.kind !== "ft") throw new Error(`${o.key} has range kind ${o.range.kind}, expected ft`);
  return o.range;
}

describe("hard blocks", () => {
  const reviewed = handReviewed("TunnelWasp", [mace]);

  it.each<Condition>(["incapacitated", "stunned", "paralyzed", "petrified", "unconscious"])(
    "%s → blocked with a reason and no actions or bonus actions",
    (condition) => {
      const opts = build(reviewed, oneEngaged, { conditions: [condition] });
      expect(opts.blocked?.reason).toMatch(new RegExp(condition, "i"));
      expect(opts.actions).toEqual([]);
      expect(opts.bonusActions).toEqual([]);
    },
  );

  it.each<Condition>(["stunned", "paralyzed", "petrified", "unconscious"])("%s → movementBy code, hold only", (condition) => {
    const opts = build(reviewed, oneEngaged, { conditions: [condition] });
    expect(opts.blocked?.movementBy).toBe("code");
    expect(opts.movements).toEqual(["hold"]);
  });

  it("stunned plus incapacitated is still a code-held block", () => {
    const opts = build(reviewed, oneEngaged, { conditions: ["incapacitated", "stunned"] });
    expect(opts.blocked?.movementBy).toBe("code");
    expect(opts.movements).toEqual(["hold"]);
  });

  it("incapacitated alone → movementBy dm with the full movement list", () => {
    const opts = build(reviewed, oneEngaged, { conditions: ["incapacitated"] });
    expect(opts.blocked?.movementBy).toBe("dm");
    expect(opts.movements).toEqual(ALL_MOVES);
    const flier = build(handReviewed("TunnelWasp", [mace], { speed: { walk: 30, fly: 60 } }), oneEngaged, {
      conditions: ["incapacitated"],
    });
    expect(flier.movements).toEqual([...ALL_MOVES, "flyUp"]);
  });

  it.each<Condition>(["poisoned", "frightened", "prone", "blinded"])("%s is context only: not blocked", (condition) => {
    const opts = build(reviewed, oneEngaged, { conditions: [condition] });
    expect(opts.blocked).toBeUndefined();
    expect(keys(opts.actions)).toContain("act_mace");
    expect(opts.movements).toEqual(ALL_MOVES);
  });
});

describe("speed 0", () => {
  it.each<Condition>(["grappled", "restrained"])("%s → movements hold only, actions still offered", (condition) => {
    const reviewed = handReviewed("TunnelWasp", [mace], { speed: { walk: 30, fly: 60 } });
    const opts = build(reviewed, oneEngaged, { conditions: [condition] });
    expect(opts.blocked).toBeUndefined();
    expect(opts.movements).toEqual(["hold"]);
    expect(keys(opts.actions)).toContain("act_mace");
  });

  it("a statblock with no movement speed at all holds", () => {
    const opts = build(handReviewed("TunnelWasp", [mace], { speed: { walk: 0 } }));
    expect(opts.movements).toEqual(["hold"]);
  });

  it("a fly-only monster (walk 0) can still move", () => {
    const opts = build(extractedReviewed("TollOfForgottenWatcher"));
    expect(opts.movements).toEqual([...ALL_MOVES, "flyUp"]);
  });

  it("a fly-only monster holds when flying isn't possible (F29)", () => {
    const opts = build(extractedReviewed("TollOfForgottenWatcher"), noFlying(oneEngaged));
    expect(opts.movements).toEqual(["hold"]);
  });
});

describe("resource availability", () => {
  const breath = ability({ id: "act_breath", name: "Fire Breath", uses: { kind: "recharge", min: 5 }, singleTarget: false, area: { shape: "cone", size: 30 } });
  const daily = ability({ id: "act_web", name: "Web", uses: { kind: "per-day", max: 2 } });

  it("a spent recharge ability is excluded and an available one is offered", () => {
    const reviewed = handReviewed("TunnelWasp", [mace, breath]);
    expect(keys(build(reviewed).actions)).toContain("act_breath");
    expect(keys(build(reviewed, oneEngaged, { recharge: { act_breath: "spent" } }).actions)).not.toContain("act_breath");
  });

  it("an exhausted X/day ability is excluded and one with uses left is offered", () => {
    const reviewed = handReviewed("TunnelWasp", [mace, daily]);
    expect(keys(build(reviewed, oneEngaged, { perDay: { act_web: 1 } }).actions)).toContain("act_web");
    expect(keys(build(reviewed, oneEngaged, { perDay: { act_web: 0 } }).actions)).not.toContain("act_web");
  });

  it("a leveled spell with no slot at or above its level is excluded", () => {
    const reviewed = extractedReviewed("AshenWarpriest");
    const opts = build(reviewed, oneEngaged, { slots: { "1": 4, "2": 0, "3": 0 } });
    expect(keys(opts.actions)).toContain("spell_guiding_bolt");
    expect(keys(opts.actions)).not.toContain("spell_hold_person");
    expect(keys(opts.actions)).not.toContain("spell_spirit_guardians");
    expect(keys(opts.bonusActions)).not.toContain("spell_spiritual_weapon");
    expect(keys(opts.bonusActions)).not.toContain("spell_mass_healing_word");
  });

  it("a leveled spell stays legal through a higher slot when its own level is spent", () => {
    const reviewed = extractedReviewed("AshenWarpriest");
    const opts = build(reviewed, oneEngaged, { slots: { "1": 0, "2": 0, "3": 1 } });
    expect(option(opts.actions, "spell_guiding_bolt").leveledSpell).toEqual({ baseLevel: 1, availableLevels: [3] });
  });

  it("upcast availableLevels lists only levels with slots, at or above the base level", () => {
    const reviewed = extractedReviewed("MaestroDrazzuk");
    const opts = build(reviewed, oneEngaged, { slots: { "1": 0, "2": 2, "3": 0, "4": 1, "5": 0 } });
    expect(option(opts.actions, "spell_charm_person").leveledSpell).toEqual({ baseLevel: 1, availableLevels: [2, 4] });
    expect(option(opts.actions, "spell_dominate_beast").leveledSpell).toEqual({ baseLevel: 4, availableLevels: [4] });
    expect(keys(opts.actions)).not.toContain("spell_dominate_person");
  });

  it("cantrips and non-slot abilities have no leveledSpell; usesResource marks limited options", () => {
    const opts = build(extractedReviewed("AshenWarpriest"));
    expect(option(opts.actions, "spell_sacred_flame").leveledSpell).toBeUndefined();
    expect(option(opts.actions, "spell_sacred_flame").usesResource).toBe(false);
    expect(option(opts.actions, "act_mace").usesResource).toBe(false);
    expect(option(opts.actions, "spell_guiding_bolt").usesResource).toBe(true);
    const hag = build(extractedReviewed("BriarthornHag"));
    expect(option(hag.actions, "act_bramble_burst").usesResource).toBe(true);
    expect(option(hag.bonusActions, "bon_misty_step").usesResource).toBe(true);
  });

  it("concentration is carried from the ability", () => {
    const opts = build(extractedReviewed("AshenWarpriest"));
    expect(option(opts.actions, "spell_hold_person").concentration).toBe(true);
    expect(option(opts.actions, "spell_guiding_bolt").concentration).toBe(false);
  });
});

describe("actions", () => {
  it("Dash, Dodge, Disengage, Hide and Help are always present, even with nothing else available", () => {
    const daily = ability({ id: "act_web", name: "Web", uses: { kind: "per-day", max: 1 } });
    const opts = build(handReviewed("TunnelWasp", [daily]), oneEngaged, { perDay: { act_web: 0 } });
    expect(keys(opts.actions)).toEqual(BASIC_KEYS);
    for (const o of opts.actions) expect(o.kind).toBe("basic");
  });

  it("offers the statblock's actions (Multiattack included) in statblock order, then the basic actions", () => {
    const opts = build(extractedReviewed("TunnelWasp"));
    expect(keys(opts.actions)).toEqual(["act_multiattack", "act_mandibles", "act_sting", ...BASIC_KEYS]);
    const multi = option(opts.actions, "act_multiattack");
    expect(multi.kind === "ability" && multi.abilityId).toBe("act_multiattack");
  });

  it("never offers reactions, passives, legendary or lair abilities as actions or bonus actions", () => {
    const opts = build(extractedReviewed("BriarthornHag"));
    const all = [...keys(opts.actions), ...keys(opts.bonusActions)];
    for (const k of ["rea_bramble_shield", "trt_thorn_warden", "trt_legendary_resistance", "leg_lash", "leg_grasping_roots"]) {
      expect(all).not.toContain(k);
    }
    expect(keys(build(extractedReviewed("TieflingEnforcer")).actions)).not.toContain("act_infernal_rebuke");
  });

  it("2024 at-will and X/day Spellcasting actions are offered", () => {
    const opts = build(extractedReviewed("BriarthornHag"));
    expect(keys(opts.actions)).toEqual(expect.arrayContaining(["spell_mage_hand", "spell_entangle", "spell_hold_person"]));
    expect(option(opts.actions, "spell_hold_person").usesResource).toBe(true);
  });
});

describe("bonus actions", () => {
  it("include BonusActions entries and none", () => {
    const opts = build(extractedReviewed("BriarthornHag"));
    expect(keys(opts.bonusActions)).toEqual(["bon_misty_step", "none"]);
    expect(option(opts.bonusActions, "none").kind).toBe("none");
  });

  it("include trait-granted bonus actions and bonus-action spells", () => {
    const opts = build(extractedReviewed("AshenWarpriest"));
    expect(keys(opts.bonusActions)).toEqual([
      "spell_healing_word",
      "spell_shield_of_faith",
      "spell_spiritual_weapon",
      "spell_mass_healing_word",
      "trt_war_priest",
      "trt_ash_step",
      "none",
    ]);
  });

  it("a general monster without bonus actions still gets none", () => {
    expect(keys(build(extractedReviewed("TunnelWasp")).bonusActions)).toEqual(["none"]);
  });

  it("Fiddlebits' 'uses your bonus action to command' is not a bonus action", () => {
    expect(keys(build(extractedReviewed("Fiddlebits")).bonusActions)).toEqual(["none"]);
  });

  it("an exhausted X/day bonus action is excluded", () => {
    const opts = build(extractedReviewed("BriarthornHag"), oneEngaged, { perDay: { bon_misty_step: 0 } });
    expect(keys(opts.bonusActions)).toEqual(["none"]);
  });
});

describe("movements", () => {
  it("flyUp only with a fly speed", () => {
    expect(build(extractedReviewed("TunnelWasp")).movements).toEqual(ALL_MOVES);
    expect(build(extractedReviewed("Zarielith")).movements).toEqual([...ALL_MOVES, "flyUp"]);
  });

  it("no flyUp when flying isn't possible, even with a fly speed (F29)", () => {
    expect(build(extractedReviewed("Zarielith"), noFlying(oneEngaged)).movements).toEqual(ALL_MOVES);
  });
});

describe("range flags", () => {
  const players = situationWith([
    playerTurn({ playerId: "engaged", zone: "engaged" }),
    playerTurn({ playerId: "near", zone: "near" }),
    playerTurn({ playerId: "far", zone: "far" }),
    playerTurn({ playerId: "engagedButExact20", zone: "engaged", distanceFt: 20 }),
    playerTurn({ playerId: "veryFarExact300", zone: "veryFar", distanceFt: 300 }),
    playerTurn({ playerId: "veryFarExact400", zone: "veryFar", distanceFt: 400 }),
    playerTurn({ playerId: "downed", zone: "engaged", apparentHp: "down" }),
  ]);

  it("melee reach uses the exact distance, else the zone default, and speed for after-move", () => {
    const opts = build(handReviewed("TunnelWasp", [mace, crossbow], { speed: { walk: 30 } }), players);
    const r = rangeOf(option(opts.actions, "act_mace"));
    expect(r.ft).toBe(5);
    expect(r.inRangeNow).toEqual(["engaged", "downed"]);
    expect(r.inRangeAfterMove).toEqual(["engaged", "near", "engagedButExact20", "downed"]);
  });

  it("ranged attacks use their long range", () => {
    const opts = build(handReviewed("TunnelWasp", [mace, crossbow], { speed: { walk: 30 } }), players);
    const r = rangeOf(option(opts.actions, "act_light_crossbow"));
    expect(r.ft).toBe(320);
    expect(r.inRangeNow).toEqual(["engaged", "near", "far", "engagedButExact20", "veryFarExact300", "downed"]);
    expect(r.inRangeAfterMove).toEqual(r.inRangeNow);
  });

  it("the fastest movement mode counts for after-move", () => {
    const opts = build(handReviewed("TunnelWasp", [mace], { speed: { walk: 30, fly: 60 } }), players);
    expect(rangeOf(option(opts.actions, "act_mace")).inRangeAfterMove).toEqual(["engaged", "near", "far", "engagedButExact20", "downed"]);
  });

  it("a fly speed doesn't count for after-move when flying isn't possible (F29)", () => {
    const opts = build(handReviewed("TunnelWasp", [mace], { speed: { walk: 30, fly: 60 } }), noFlying(players));
    expect(rangeOf(option(opts.actions, "act_mace")).inRangeAfterMove).toEqual(["engaged", "near", "engagedButExact20", "downed"]);
  });

  it("speed 0 means after-move equals now", () => {
    const opts = build(handReviewed("TunnelWasp", [mace]), players, { conditions: ["grappled"] });
    const r = rangeOf(option(opts.actions, "act_mace"));
    expect(r.inRangeAfterMove).toEqual(r.inRangeNow);
  });

  it("out-of-range options are still present, with empty range lists", () => {
    const farOnly = situationWith([playerTurn({ playerId: "p1", zone: "veryFar" })]);
    const r = rangeOf(option(build(handReviewed("TunnelWasp", [mace]), farOnly).actions, "act_mace"));
    expect(r.inRangeNow).toEqual([]);
    expect(r.inRangeAfterMove).toEqual([]);
  });

  it("Multiattack takes the longest range of its component attacks", () => {
    const opts = build(extractedReviewed("TunnelWasp"), players);
    expect(rangeOf(option(opts.actions, "act_multiattack")).ft).toBe(5);
  });

  it("spells use their range, and a self-origin area uses the area size", () => {
    const warpriest = build(extractedReviewed("AshenWarpriest"), players);
    expect(rangeOf(option(warpriest.actions, "spell_hold_person")).ft).toBe(60);
    const hag = build(extractedReviewed("BriarthornHag"), players);
    const burst = option(hag.actions, "act_bramble_burst");
    expect(burst.area).toBe(true);
    expect(burst.singleTarget).toBe(false);
    expect(rangeOf(burst).ft).toBe(30);
  });

  it("options that don't target a player are noTarget; a targeting option with no readable range is unknown", () => {
    const hag = build(extractedReviewed("BriarthornHag"), players);
    for (const k of BASIC_KEYS) expect(option(hag.actions, k).range.kind).toBe("noTarget");
    expect(option(hag.bonusActions, "none").range.kind).toBe("noTarget");
    expect(option(hag.bonusActions, "bon_misty_step").range.kind).toBe("noTarget");
    expect(option(hag.actions, "spell_thornward_hex").range.kind).toBe("unknown");
    const warpriest = build(extractedReviewed("AshenWarpriest"), players);
    expect(option(warpriest.bonusActions, "spell_healing_word").range.kind).toBe("noTarget");
  });
});

describe("downed players (PLAN.md 'Legal options')", () => {
  // Mace reaches the downed player now and p2 after moving; "Curse" targets a player with no readable range.
  const curse = ability({ id: "act_curse", name: "Curse", raw: "The monster curses one creature it can see." });
  const reviewed = handReviewed("TunnelWasp", [mace, crossbow, curse]);
  const situation = situationWith([
    playerTurn({ playerId: "downed", zone: "engaged", apparentHp: "down" }),
    playerTurn({ playerId: "p2", zone: "near" }),
  ]);

  it.each(["mindless", "cunning"] as const)("%s: a downed player is in no range list and not targetable", (temperament) => {
    const opts = build(reviewed, situation, {}, temperament);
    expect(rangeOf(option(opts.actions, "act_mace"))).toMatchObject({ inRangeNow: [], inRangeAfterMove: ["p2"] });
    expect(rangeOf(option(opts.actions, "act_light_crossbow"))).toMatchObject({ inRangeNow: ["p2"], inRangeAfterMove: ["p2"] });
    expect(option(opts.actions, "act_curse").range.kind).toBe("unknown");
    expect(opts.targetableIds).toEqual(["p2"]);
  });

  it.each(["feral", "genius"] as const)("%s: downed players stay targetable", (temperament) => {
    const opts = build(reviewed, situation, {}, temperament);
    expect(rangeOf(option(opts.actions, "act_mace"))).toMatchObject({ inRangeNow: ["downed"], inRangeAfterMove: ["downed", "p2"] });
    expect(opts.targetableIds).toEqual(["downed", "p2"]);
  });

  it("an attack whose only reachable player is downed is out of range for a cunning monster", () => {
    const alone = situationWith([
      playerTurn({ playerId: "downed", zone: "engaged", apparentHp: "down" }),
      playerTurn({ playerId: "far", zone: "veryFar", distanceFt: 200 }),
    ]);
    expect(rangeOf(option(build(reviewed, alone, {}, "cunning").actions, "act_mace"))).toMatchObject({ inRangeNow: [], inRangeAfterMove: [] });
  });

  it("a blocked monster still lists who could be targeted", () => {
    expect(build(reviewed, situation, { conditions: ["stunned"] }, "cunning").targetableIds).toEqual(["p2"]);
  });
});

describe("limits and summaries", () => {
  it("every list is capped at 255, keeping the basic actions and none", () => {
    const many: Ability[] = [];
    for (let i = 0; i < 300; i++) many.push(ability({ id: `act_a${i}`, name: `A${i}` }));
    for (let i = 0; i < 300; i++) many.push(ability({ id: `bon_b${i}`, name: `B${i}`, source: "BonusActions", category: "bonus" }));
    const opts = build(handReviewed("TunnelWasp", many));
    expect(opts.actions.length).toBeLessThanOrEqual(255);
    expect(opts.bonusActions.length).toBeLessThanOrEqual(255);
    expect(keys(opts.actions)).toEqual(expect.arrayContaining(BASIC_KEYS));
    expect(keys(opts.bonusActions)).toContain("none");
    expect(opts.movements.length).toBeLessThanOrEqual(255);
  });

  it("a summary names the option and gives to-hit and damage on one line", () => {
    const opts = build(extractedReviewed("AshenWarpriest"));
    expect(option(opts.actions, "act_mace").summary).toBe("Mace: melee +6 to hit, reach 5 ft.; 6 (1d6 + 3) bludgeoning + 4 (1d8) fire");
    expect(option(opts.actions, "act_multiattack").summary).toBe("Multiattack: 2× Mace");
    expect(option(opts.bonusActions, "trt_war_priest").summary).toMatch(/Attack action/);
  });

  it.each(loadMonsterFixtures().map((f) => [f.name] as const))("%s: unique keys and a one-line summary per option", (name) => {
    const opts = build(extractedReviewed(name));
    for (const list of [opts.actions, opts.bonusActions]) {
      expect(new Set(keys(list)).size).toBe(list.length);
      for (const o of list) {
        expect(o.summary.length).toBeGreaterThan(0);
        expect(o.summary).not.toMatch(/\n/);
        if (o.kind === "ability") expect(o.key).toBe(o.abilityId);
      }
    }
  });
});
