/**
 * One batched Jev request per turn (contracts/jev-questions.md, PLAN.md "Questions to Jev").
 *
 * Jev only picks among keys code offers (constitution Principle I): every criterion key is a
 * legal option, movement, reachable player, cluster or available slot level. A choice question
 * with fewer than 2 keys is not asked; its single value (if any) is in the candidate table.
 * Jev answers in parallel, so target, cluster and slot questions are asked for candidates code
 * ranks before the request (research R5), and the candidate table maps `<i>` back.
 */
import type { EncounterState, Movement, Situation, Temperament, TurnLogEntry } from "../encounter/types";
import { ZONE_DEFAULT_FT } from "../encounter/types";
import type { JevRequest } from "../jev/client";
import type { ChoiceQuestion, NoulQuestion } from "../jev/types";
import { describeUses, summarize } from "../monster/describe";
import type { LegalOptions, Option } from "../monster/options";
import type { Ability, AbilityCategory, SpeedMap } from "../monster/types";
import { buildClusters, type Cluster } from "./clusters";
import { CLUSTER_CANDIDATES, HISTORY_TURNS, SLOT_CANDIDATES, TARGET_CANDIDATES } from "./constants";
import type { DecideTracker, Tactic } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptionList = "actions" | "bonusActions";

interface CandidateBase {
  /** Question key: `target__<i>`, `cluster__<i>` or `slot_level__<i>`. */
  readonly key: string;
  readonly optionKey: string;
  readonly list: OptionList;
  /** False when there were fewer than 2 values to choose from, so no question was sent. */
  readonly asked: boolean;
}
export interface TargetCandidate extends CandidateBase {
  /** Players it can reach this turn, in situation order. */
  readonly playerIds: readonly string[];
}
export interface ClusterCandidate extends CandidateBase {
  /** `Cluster.id`s with at least one member in reach. */
  readonly clusterIds: readonly string[];
}
export interface SlotCandidate extends CandidateBase {
  readonly levels: readonly number[];
}

/** Maps question indexes and criterion keys back to options, players, clusters and slot levels. */
export interface Candidates {
  readonly targets: readonly TargetCandidate[];
  readonly clusters: readonly ClusterCandidate[];
  readonly slotLevels: readonly SlotCandidate[];
  /** Criterion key `player__<j>` → player id. */
  readonly players: Readonly<Record<string, string>>;
  /** Criterion key `cluster__<k>` → cluster. */
  readonly clusterKeys: Readonly<Record<string, Cluster>>;
}

export interface JevPlayer {
  readonly key: string;
  /** "player 2: Bree (caster, Wizard)". */
  readonly label: string;
  readonly zone: string;
  readonly distanceFt: number;
  readonly apparentHp: string;
  readonly conditions: readonly string[];
  readonly cover: string;
  readonly hitMonsterLastRound: boolean;
  readonly clusteredWith: readonly string[];
}

export type JevOptionRange =
  | "no target"
  | "range unknown"
  | { readonly ft: number; readonly inRangeNow: readonly string[]; readonly inRangeAfterMove: readonly string[] };

export interface JevOption {
  readonly key: string;
  readonly summary: string;
  readonly usesResource: boolean;
  readonly concentration: boolean;
  readonly singleTarget: boolean;
  readonly area: boolean;
  readonly slotLevels?: readonly number[];
  /** Player keys, not ids. */
  readonly range: JevOptionRange;
}

/** The `state` Jev reads (contracts/jev-questions.md "State object"). */
export interface JevState {
  readonly monster: {
    readonly name: string;
    readonly kind: "general" | "legendary";
    readonly hp: { readonly current: number; readonly max: number };
    readonly ac: number;
    readonly speed: SpeedMap;
    readonly abilities: readonly { readonly id: string; readonly name: string; readonly category: AbilityCategory; readonly summary: string }[];
    /** "<name>: <raw text>" for every ability the extractor couldn't parse. */
    readonly rawUnparsed: readonly string[];
  };
  readonly encounter: EncounterState;
  readonly temperament: Temperament;
  readonly morale: { readonly value: number; readonly words: string };
  readonly situation: {
    readonly players: readonly JevPlayer[];
    readonly allies: Situation["allies"];
    readonly terrain: Situation["terrain"];
    readonly notes: string;
  };
  readonly options: { readonly actions: readonly JevOption[]; readonly bonusActions: readonly JevOption[]; readonly movements: readonly Movement[] };
  readonly clusters: readonly { readonly id: string; readonly players: readonly string[]; readonly size: number }[];
  readonly history: readonly TurnLogEntry[];
}

// ---------------------------------------------------------------------------
// Question helpers (as in prototype/src/questions.ts)
// ---------------------------------------------------------------------------

function noul(instructions: string, t: string, f: string): NoulQuestion {
  return { type: "noul", instructions, criteria: { true: t, false: f } };
}

function choice(instructions: string, criteria: Record<string, string | null>): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

const TACTICS: Record<Tactic, string> = {
  aggressive: "Deal as much damage as it can this turn",
  focus_weakest: "Finish off or pressure the most wounded or vulnerable player",
  focus_threat: "Go after the player who is the biggest threat to it",
  control: "Disable, hinder or split up the party rather than deal damage",
  defensive: "Protect itself: reposition, buff or avoid damage",
  flee: "Get away from the fight",
};

const MOVEMENTS: Record<Movement, string> = {
  hold: "Stay where it is",
  closeIn: "Move toward its target",
  reachOther: "Move to reach a different target",
  retreat: "Move away from the party",
  takeCover: "Move behind cover",
  flyUp: "Fly up, out of melee reach",
};

export type NoulKey = "multiattack_fallback" | "should_retreat" | "spend_resource";

const NOUL_QUESTIONS: Record<NoulKey, NoulQuestion> = {
  multiattack_fallback: noul(
    "If it uses Multiattack and its first target drops partway through, should it switch its remaining attacks to another adjacent target?",
    "Yes: keep attacking whoever else is in reach.",
    "No: stop, or save the remaining attacks' movement for something else.",
  ),
  should_retreat: noul(
    "Given its HP, morale, temperament and the situation, should the monster break off from this fight now?",
    "Yes: it should get away this turn.",
    "No: it should keep fighting.",
  ),
  spend_resource: noul(
    "Is this moment worth spending a limited resource (a spell slot, a recharge ability or a daily use)?",
    "Yes: spend it now.",
    "No: save it for later.",
  ),
};

/**
 * The noul questions asked for these options, in request order: `multiattack_fallback` only when
 * Multiattack is legal, `should_retreat` always, `spend_resource` only when some option uses a
 * limited resource. interpret ignores noul answers to anything else.
 */
export function askedNoulKeys(options: LegalOptions): NoulKey[] {
  const keys: NoulKey[] = [];
  if (options.actions.some((o) => /^Multiattack\b/i.test(o.name))) keys.push("multiattack_fallback");
  keys.push("should_retreat");
  if ([...options.actions, ...options.bonusActions].some((o) => o.usesResource)) keys.push("spend_resource");
  return keys;
}

const playerKey = (j: number) => `player__${j}`;
const clusterKey = (k: number) => `cluster__${k}`;
const levelKey = (n: number) => `level__${n}`;

function moraleWords(morale: number): string {
  if (morale < 20) return "cowardly";
  if (morale < 40) return "wary";
  if (morale <= 60) return "steady";
  if (morale <= 80) return "bold";
  return "fanatical";
}

// ---------------------------------------------------------------------------
// Ranking (research R5)
// ---------------------------------------------------------------------------

interface Pooled {
  readonly option: Option;
  readonly list: OptionList;
  readonly order: number;
}

/** 0 = a target in range now (or none needed), 1 = after moving (or unknown), 2 = out of range. */
function rangeBand(o: Option): number {
  switch (o.range.kind) {
    case "noTarget":
      return 0;
    case "unknown":
      return 1;
    case "ft":
      if (o.range.inRangeNow.length > 0) return 0;
      return o.range.inRangeAfterMove.length > 0 ? 1 : 2;
  }
}

const sumDamage = (a: Ability) => (a.damage ?? []).reduce((s, d) => s + d.avg, 0);

function averageDamage(o: Option, byId: ReadonlyMap<string, Ability>): number {
  if (o.kind !== "ability") return 0;
  const a = byId.get(o.abilityId);
  if (!a) throw new Error(`questions: option "${o.key}" has no ability "${o.abilityId}" on the monster`);
  const parts = (a.multiattack ?? []).reduce((s, p) => {
    const part = byId.get(p.abilityId);
    return s + (part ? p.count * sumDamage(part) : 0);
  }, 0);
  return sumDamage(a) + parts;
}

/** In range now > after moving > out of range; then unlimited before limited; then damage; then statblock order. */
function rank<T extends Pick<Pooled, "option" | "order">>(pool: readonly T[], byId: ReadonlyMap<string, Ability>): T[] {
  const damage = new Map(pool.map((p) => [p, averageDamage(p.option, byId)]));
  return [...pool].sort(
    (x, y) =>
      rangeBand(x.option) - rangeBand(y.option) ||
      Number(x.option.usesResource) - Number(y.option.usesResource) ||
      (damage.get(y) ?? 0) - (damage.get(x) ?? 0) ||
      x.order - y.order,
  );
}

/** One option list in R5 order, with list order as the last tie-break. interpret falls back to it when Jev's answer is unusable. */
export function rankOptions(list: readonly Option[], abilities: readonly Ability[]): Option[] {
  const byId = new Map(abilities.map((a) => [a.id, a]));
  return rank(
    list.map((option, order) => ({ option, order })),
    byId,
  ).map((p) => p.option);
}

/** Targetable player ids an option can reach this turn. Unknown range can't rule out any targetable player. */
function reachable(o: Option, options: LegalOptions): readonly string[] {
  switch (o.range.kind) {
    case "ft":
      return o.range.inRangeAfterMove;
    case "unknown":
      return options.targetableIds;
    case "noTarget":
      return [];
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const distanceOf = (p: Situation["players"][number]) => p.distanceFt ?? ZONE_DEFAULT_FT[p.zone];

function rangeFlag(o: Option): string {
  switch (o.range.kind) {
    case "noTarget":
      return "";
    case "unknown":
      return " [range unknown]";
    case "ft":
      if (o.range.inRangeNow.length > 0) return " [in range now]";
      return o.range.inRangeAfterMove.length > 0 ? " [in range after moving]" : " [out of range]";
  }
}

/** The state object sent with the questions. Exported so tests and interpret can read it typed. */
export function buildJevState(tracker: DecideTracker, situation: Situation, options: LegalOptions): JevState {
  const { reviewed, state, settings, roster } = tracker;
  const body = reviewed.monster.body;
  const names: Record<string, string> = {};
  for (const a of reviewed.abilities) names[a.id] = a.name;

  const keyOf = new Map(situation.players.map((p, j) => [p.playerId, playerKey(j)]));
  const toKeys = (ids: readonly string[]) => ids.flatMap((id) => keyOf.get(id) ?? []);

  const players: JevPlayer[] = situation.players.map((p, j) => {
    const r = roster.find((x) => x.id === p.playerId);
    const who = r ? `${r.name} (${r.role}, ${r.class}${r.ac !== undefined ? `, AC ${r.ac}` : ""})` : `${p.playerId} (not in the roster)`;
    return {
      key: playerKey(j),
      label: `player ${j}: ${who}`,
      zone: p.zone,
      distanceFt: distanceOf(p),
      apparentHp: p.apparentHp,
      conditions: p.conditions,
      cover: p.cover,
      hitMonsterLastRound: p.hitMonsterLastRound,
      clusteredWith: toKeys(p.clusteredWith),
    };
  });

  const jevOption = (o: Option): JevOption => {
    let range: JevOptionRange;
    switch (o.range.kind) {
      case "noTarget":
        range = "no target";
        break;
      case "unknown":
        range = "range unknown";
        break;
      case "ft":
        range = { ft: o.range.ft, inRangeNow: toKeys(o.range.inRangeNow), inRangeAfterMove: toKeys(o.range.inRangeAfterMove) };
        break;
    }
    return {
      key: o.key,
      summary: o.summary,
      usesResource: o.usesResource,
      concentration: o.concentration,
      singleTarget: o.singleTarget,
      area: o.area,
      ...(o.leveledSpell ? { slotLevels: o.leveledSpell.availableLevels } : {}),
      range,
    };
  };

  return {
    monster: {
      name: body.CharacterName,
      kind: reviewed.monster.kind,
      hp: { current: state.hp, max: state.hpMax },
      ac: body.AC,
      speed: reviewed.speed,
      abilities: reviewed.abilities.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        // summarize() already ends with the uses of a limited ability; only "at will" is added here.
        summary: a.uses.kind === "at-will" ? `${summarize(a, names)} (${describeUses(a.uses)})` : summarize(a, names),
      })),
      rawUnparsed: reviewed.abilities.filter((a) => a.parsed === "none").map((a) => `${a.name}: ${a.raw}`),
    },
    encounter: state,
    temperament: settings.temperament,
    morale: { value: settings.morale, words: moraleWords(settings.morale) },
    situation: { players, allies: situation.allies, terrain: situation.terrain, notes: situation.notes },
    options: { actions: options.actions.map(jevOption), bonusActions: options.bonusActions.map(jevOption), movements: options.movements },
    clusters: buildClusters(situation).map((c, k) => ({ id: clusterKey(k), players: toKeys(c.playerIds), size: c.playerIds.length })),
    history: tracker.log.slice(-HISTORY_TURNS),
  };
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * The question set and state for this turn, plus the candidate table interpret needs.
 * Call only when `options.blocked` is unset: a blocked monster gets no request.
 */
export function buildJevRequest(
  tracker: DecideTracker,
  situation: Situation,
  options: LegalOptions,
): { request: JevRequest; candidates: Candidates } {
  const state = buildJevState(tracker, situation, options);
  const questions: JevRequest["questions"] = {};
  const byId = new Map(tracker.reviewed.abilities.map((a) => [a.id, a]));
  // state.situation.players is built from situation.players in the same order.
  const playerById = new Map(situation.players.map((p, j) => [p.playerId, state.situation.players[j]]));
  const player = (id: string): JevPlayer => {
    const found = playerById.get(id);
    if (!found) throw new Error(`questions: player "${id}" is not in the situation`);
    return found;
  };
  const clusters = buildClusters(situation);

  const ask = (key: string, q: ChoiceQuestion) => {
    if (Object.keys(q.criteria).length >= 2) questions[key] = q;
  };
  const criteriaOf = <T>(items: readonly T[], key: (t: T) => string, text: (t: T) => string) =>
    Object.fromEntries(items.map((t) => [key(t), text(t)]));

  ask("tactic", choice("What is the monster's overall plan this turn, given its temperament, morale and the situation?", TACTICS));
  ask("move_before", choice("Before its action, how does the monster move?", criteriaOf(options.movements, (m) => m, (m) => MOVEMENTS[m])));
  ask(
    "action",
    choice(
      "Which action does the monster take this turn? Range flags assume the targets in the state.",
      criteriaOf(options.actions, (o) => o.key, (o) => `${o.summary}${rangeFlag(o)}`),
    ),
  );
  ask(
    "bonus_action",
    choice("Which bonus action does the monster take this turn, if any?", criteriaOf(options.bonusActions, (o) => o.key, (o) => `${o.summary}${rangeFlag(o)}`)),
  );
  ask("move_after", choice("After its action, how does the monster move?", criteriaOf(options.movements, (m) => m, (m) => MOVEMENTS[m])));

  const pool: Pooled[] = [
    ...options.actions.map((option, order) => ({ option, list: "actions" as const, order })),
    ...options.bonusActions.map((option, i) => ({ option, list: "bonusActions" as const, order: options.actions.length + i })),
  ];
  const ranked = rank(pool, byId);

  const targets: TargetCandidate[] = ranked
    .filter((p) => p.option.singleTarget)
    .slice(0, TARGET_CANDIDATES)
    .map((p, i) => {
      const playerIds = reachable(p.option, options);
      const key = `target__${i}`;
      const criteria = criteriaOf(
        playerIds,
        (id) => player(id).key,
        (id) => {
          const pl = player(id);
          const extra = [pl.conditions.join(", "), pl.hitMonsterLastRound ? "hit the monster last round" : ""].filter(Boolean);
          return [pl.label, pl.apparentHp, `${pl.distanceFt} ft. away`, `cover: ${pl.cover}`, ...extra].join("; ");
        },
      );
      ask(key, choice(`Who should "${p.option.name}" target?`, criteria));
      return { key, optionKey: p.option.key, list: p.list, asked: key in questions, playerIds };
    });

  const clusterKeys: Record<string, Cluster> = {};
  clusters.forEach((c, k) => (clusterKeys[clusterKey(k)] = c));
  const clusterCandidates: ClusterCandidate[] = ranked
    .filter((p) => p.option.area)
    .slice(0, CLUSTER_CANDIDATES)
    .map((p, i) => {
      const inReach = new Set(reachable(p.option, options));
      const offered = clusters.map((c, k) => ({ c, k })).filter(({ c }) => c.playerIds.some((id) => inReach.has(id)));
      const key = `cluster__${i}`;
      const criteria = criteriaOf(
        offered,
        ({ k }) => clusterKey(k),
        ({ c }) => `${c.playerIds.map((id) => player(id).label).join(", ")}: catches ${c.playerIds.length}`,
      );
      ask(key, choice(`Which group of players should "${p.option.name}" be aimed at?`, criteria));
      return { key, optionKey: p.option.key, list: p.list, asked: key in questions, clusterIds: offered.map(({ c }) => c.id) };
    });

  const slotLevels: SlotCandidate[] = ranked
    .flatMap((p) => (p.option.leveledSpell ? [{ ...p, levels: p.option.leveledSpell.availableLevels }] : []))
    .slice(0, SLOT_CANDIDATES)
    .map((p, i) => {
      const { levels } = p;
      const key = `slot_level__${i}`;
      const criteria = criteriaOf(levels, levelKey, (n) => `Cast with a level ${n} slot (${tracker.state.slots[String(n)] ?? 0} left)`);
      ask(key, choice(`If it casts "${p.option.name}", which spell slot level should it use?`, criteria));
      return { key, optionKey: p.option.key, list: p.list, asked: key in questions, levels };
    });

  for (const key of askedNoulKeys(options)) questions[key] = NOUL_QUESTIONS[key];

  return {
    // No `model` here: callJev fills it from JEV_MODEL, so the model is resolved in one place.
    request: { state, questions },
    candidates: {
      targets,
      clusters: clusterCandidates,
      slotLevels,
      players: Object.fromEntries(situation.players.map((p, j) => [playerKey(j), p.playerId])),
      clusterKeys,
    },
  };
}
