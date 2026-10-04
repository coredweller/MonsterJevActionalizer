import { blankSituation } from "@/lib/encounter/state";
import type { PlayerTurn, Situation } from "@/lib/encounter/types";
import { confirmReview, extractAbilities } from "@/lib/monster/extract";
import { parseMonster } from "@/lib/monster/schema";
import type { Ability, ReviewedMonster, Spellcasting } from "@/lib/monster/types";
import { loadMonsterFixture } from "./fixtures";

/** A fixture run through the real extractor and confirmed unchanged, as the review screen would. */
export function extractedReviewed(fixtureName: string): ReviewedMonster {
  const parsed = parseMonster(loadMonsterFixture(fixtureName).raw);
  if (!parsed.success) throw new Error(`${fixtureName} does not parse`);
  return confirmReview(extractAbilities(parsed.data), "2026-10-03T00:00:00.000Z");
}

export function playerTurn(partial: Partial<PlayerTurn> & Pick<PlayerTurn, "playerId">): PlayerTurn {
  return {
    zone: "engaged",
    apparentHp: "healthy",
    conditions: [],
    cover: "none",
    hitMonsterLastRound: false,
    clusteredWith: [],
    ...partial,
  };
}

export function situationWith(players: PlayerTurn[]): Situation {
  return { ...blankSituation(), players };
}

/** A hand-built ReviewedMonster from a fixture, for tests that must not depend on the extractor. */
export function handReviewed(
  fixtureName: string,
  abilities: Ability[],
  extra: Partial<Pick<ReviewedMonster, "spellcasting" | "hpMax" | "speed" | "intScore">> = {},
): ReviewedMonster {
  const parsed = parseMonster(loadMonsterFixture(fixtureName).raw);
  if (!parsed.success) throw new Error(`${fixtureName} does not parse`);
  return {
    monster: parsed.data,
    abilities,
    spellcasting: extra.spellcasting,
    hpMax: extra.hpMax ?? 50,
    speed: extra.speed ?? { walk: 30 },
    intScore: extra.intScore ?? parsed.data.body.AbilityScores.Intelligence.Score,
    confirmedAt: "2026-10-03T00:00:00.000Z",
  };
}

export function ability(partial: Partial<Ability> & Pick<Ability, "id" | "name">): Ability {
  return {
    source: "Actions",
    category: "action",
    uses: { kind: "at-will" },
    singleTarget: true,
    raw: "",
    parsed: "full",
    ...partial,
  };
}

export const slots = (s: Record<string, number>): Spellcasting => ({ slots: s, spells: [] });
