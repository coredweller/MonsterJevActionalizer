import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const MONSTERS = join(ROOT, "monsters");
const JEV = join(ROOT, "jev");

export interface MonsterFixture {
  file: string;
  name: string;
  cr: string;
  edition: "2014" | "2024";
  raw: unknown;
}

const FIXTURE_NAME = /^(?<name>[A-Za-z0-9]+)\.CR(?<cr>[\d/]+)\.(?<edition>2014|2024)\.json$/;

/** Every `fixtures/monsters/<Name>.CR<n>.<edition>.json`, parsed. */
export function loadMonsterFixtures(): MonsterFixture[] {
  return readdirSync(MONSTERS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const m = FIXTURE_NAME.exec(file);
      if (!m?.groups) throw new Error(`Fixture name doesn't match <Name>.CR<n>.<edition>.json: ${file}`);
      return {
        file,
        name: m.groups.name,
        cr: m.groups.cr,
        edition: m.groups.edition as "2014" | "2024",
        raw: JSON.parse(readFileSync(join(MONSTERS, file), "utf8")) as unknown,
      };
    });
}

/** One monster fixture by its PascalCase name, e.g. "TunnelWasp". */
export function loadMonsterFixture(name: string): MonsterFixture {
  const found = loadMonsterFixtures().find((f) => f.name === name);
  if (!found) throw new Error(`No monster fixture named ${name}`);
  return found;
}

/** A recorded (or derived) Jev fixture, e.g. "lone-melee" or "derived/retreat-high". */
export function loadJevFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(JEV, `${name}.json`), "utf8")) as unknown;
}

export function jevFixturePath(name: string): string {
  return join(JEV, `${name}.json`);
}
