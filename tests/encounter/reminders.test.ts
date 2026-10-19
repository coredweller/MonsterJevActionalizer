import { describe, expect, it } from "vitest";
import { buildReminders } from "@/lib/encounter/reminders";
import { createTracker, legendaryActionMax, setLegendary } from "@/lib/encounter/state";
import type { Tracker } from "@/lib/encounter/types";
import type { ReviewedMonster } from "@/lib/monster/types";
import { ability, extractedReviewed, handReviewed } from "../helpers/reviewed";

const NOW = "2026-10-03T12:00:00.000Z";

const trackerFor = (reviewed: ReviewedMonster): Tracker => createTracker(reviewed, "t1", NOW);

/** The Options record of a legendary monster as reminder entries, in record order and verbatim. */
function optionsOf(reviewed: ReviewedMonster) {
  const { monster } = reviewed;
  if (monster.kind !== "legendary") throw new Error(`${monster.body.CharacterName} is not legendary`);
  return Object.entries(monster.body.LegendaryActions.Options).map(([name, text]) => ({ name, text }));
}

function rawOf(reviewed: ReviewedMonster, abilityId: string): string {
  const found = reviewed.abilities.find((a) => a.id === abilityId);
  if (!found) throw new Error(`no ability "${abilityId}"`);
  return found.raw;
}

/** No fixture has lair actions, so give a legendary one some. */
function withLair(reviewed: ReviewedMonster, lair: Record<string, string>): ReviewedMonster {
  const { monster } = reviewed;
  if (monster.kind !== "legendary") throw new Error(`${monster.body.CharacterName} is not legendary`);
  return { ...reviewed, monster: { kind: "legendary", body: { ...monster.body, LairActions: lair } } };
}

const LAIR = {
  "Grasping Thorns": "Thorny vines erupt in a 20-foot square the hag can see within 120 feet of it.",
  "Choking Spores": "A cloud of spores fills a 10-foot-radius sphere centred on a point within 60 feet of the hag.",
};

describe("buildReminders", () => {
  const hag = extractedReviewed("BriarthornHag");

  it("lists legendary actions left with the Options entries, then the Reactions entry once", () => {
    const max = legendaryActionMax(hag);
    expect(max).toBe(3);
    expect(buildReminders(trackerFor(hag))).toEqual([
      { kind: "legendary", left: max, max, options: optionsOf(hag) },
      { kind: "reactions", entries: [{ name: "Bramble Shield", text: rawOf(hag, "rea_bramble_shield") }] },
    ]);
  });

  it("keeps option names verbatim, cost included, and shows only the legendary card without reactions or lair actions", () => {
    const zarielith = extractedReviewed("Zarielith");
    const reminders = buildReminders(trackerFor(zarielith));
    expect(reminders).toEqual([{ kind: "legendary", left: 3, max: 3, options: optionsOf(zarielith) }]);
    expect(optionsOf(zarielith).map((o) => o.name)).toEqual(["Detect", "Attack", "Infernal Presence (Costs 2 Actions)"]);
  });

  it("keeps the legendary card when no legendary actions are left", () => {
    const spent = setLegendary(trackerFor(hag), { actions: 0 });
    expect(buildReminders(spent)[0]).toEqual({ kind: "legendary", left: 0, max: 3, options: optionsOf(hag) });
  });

  it("lists an 'As a reaction' action of a general monster", () => {
    const enforcer = extractedReviewed("TieflingEnforcer");
    expect(buildReminders(trackerFor(enforcer))).toEqual([
      { kind: "reactions", entries: [{ name: "Infernal Rebuke", text: rawOf(enforcer, "act_infernal_rebuke") }] },
    ]);
  });

  it("lists Reactions-source and reaction-category abilities once each, in ability order", () => {
    const reviewed = handReviewed("BriarthornHag", [
      ability({ id: "act_claws", name: "Claws", raw: "Melee Attack Roll: +7." }),
      ability({ id: "rea_recategorized", name: "Thorn Ward", source: "Reactions", category: "passive", raw: "Thorn ward text." }),
      ability({ id: "act_as_reaction", name: "Snap Back", category: "reaction", raw: "As a reaction, the hag snaps back." }),
      ability({ id: "leg_lash", name: "Lash", source: "LegendaryActions", category: "legendary", raw: "Lash text." }),
      ability({ id: "rea_both", name: "Bramble Shield", source: "Reactions", category: "reaction", raw: "Bramble shield text." }),
    ]);
    const reactions = buildReminders(trackerFor(reviewed)).find((r) => r.kind === "reactions");
    expect(reactions).toEqual({
      kind: "reactions",
      entries: [
        { name: "Thorn Ward", text: "Thorn ward text." },
        { name: "Snap Back", text: "As a reaction, the hag snaps back." },
        { name: "Bramble Shield", text: "Bramble shield text." },
      ],
    });
  });

  it("lists lair actions verbatim, in order, flagged initiative 20, after legendary and reactions", () => {
    const lairHag = withLair(hag, LAIR);
    expect(buildReminders(trackerFor(lairHag)).map((r) => r.kind)).toEqual(["legendary", "reactions", "lair"]);
    expect(buildReminders(trackerFor(lairHag))[2]).toEqual({
      kind: "lair",
      initiative: 20,
      entries: [
        { name: "Grasping Thorns", text: LAIR["Grasping Thorns"] },
        { name: "Choking Spores", text: LAIR["Choking Spores"] },
      ],
    });
  });

  it.each(["TunnelWasp", "AshenWarpriest"])("returns no reminders for %s, a general monster with no reactions", (name) => {
    expect(buildReminders(trackerFor(extractedReviewed(name)))).toEqual([]);
  });

  it("does not mutate the tracker", () => {
    const tracker = trackerFor(withLair(hag, LAIR));
    const before = structuredClone(tracker);
    buildReminders(tracker);
    expect(tracker).toEqual(before);
  });
});
