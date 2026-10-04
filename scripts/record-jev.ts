/**
 * `npm run record:jev [-- <scenario> ...]` (tasks.md T046). The only code that calls live Jev outside
 * the app. For each scenario in fixtures/jev/scenarios.ts it builds the legal options and the
 * question set exactly as the route does, makes ONE `callJev`, and writes
 * `fixtures/jev/<scenario>.json` = `{ request, response }`, where `request.model` is the model sent.
 *
 * The key comes from `.env.local` via `tsx --env-file`. This script never reads, prints or writes it;
 * only `callJev` does. On a JevError it prints the kind and message and exits non-zero.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildScenario, isScenarioName, SCENARIO_NAMES, type ScenarioName } from "../fixtures/jev/scenarios";
import { buildJevRequest } from "../lib/decide/questions";
import { callJev, JevError, resolveModel } from "../lib/jev/client";
import { buildLegalOptions } from "../lib/monster/options";

const OUT_DIR = new URL("../fixtures/jev/", import.meta.url);

function selectedScenarios(args: string[]): ScenarioName[] {
  if (args.length === 0) return [...SCENARIO_NAMES];
  const unknown = args.filter((a) => !isScenarioName(a));
  if (unknown.length > 0) {
    console.error(`record-jev: unknown scenario(s): ${unknown.join(", ")}. Known: ${SCENARIO_NAMES.join(", ")}`);
    process.exit(2);
  }
  return args.filter(isScenarioName);
}

async function record(name: ScenarioName): Promise<void> {
  const { tracker, situation } = buildScenario(name);
  const options = buildLegalOptions(tracker.reviewed, tracker.state, situation);
  if (options.blocked) throw new Error(`${name}: the monster is blocked (${options.blocked.reason}); there is nothing to ask Jev`);

  const { request } = buildJevRequest(tracker, situation, options);
  const { response, latencyMs } = await callJev(request, { env: process.env });

  const path = fileURLToPath(new URL(`${name}.json`, OUT_DIR));
  const recorded = { request: { ...request, model: resolveModel(process.env) }, response };
  writeFileSync(path, `${JSON.stringify(recorded, null, 2)}\n`);
  console.log(`${name} latencyMs=${latencyMs} questions=${Object.keys(request.questions).join(",")}`);
}

async function main(): Promise<void> {
  for (const name of selectedScenarios(process.argv.slice(2))) {
    try {
      await record(name);
    } catch (e) {
      if (e instanceof JevError) {
        console.error(`record-jev: ${name} failed: kind=${e.kind} message=${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }
}

await main();
