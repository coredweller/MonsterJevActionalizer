/**
 * `npm run check:monsters [-- --fix]` (contracts/cli-and-storage.md). Runs the same pure
 * normalizer as the app over fixtures/monsters/*.json; this script only does file I/O.
 *
 * Prints OK / CHANGED / INVALID per file. Exits 0 only when every file is OK, or with --fix when
 * every file is valid after rewriting. INVALID files are never rewritten.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../lib/monster/normalize";

const DIR = fileURLToPath(new URL("../fixtures/monsters/", import.meta.url));
const fix = process.argv.includes("--fix");

let failed = false;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(DIR, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.log(`INVALID ${file}: not valid JSON (${e instanceof Error ? e.message : String(e)})`);
    failed = true;
    continue;
  }

  const result = normalize(raw, { filename: file });
  if (result.errors.length > 0) {
    const errors = result.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`).join("; ");
    console.log(`INVALID ${file}: ${errors}`);
    failed = true;
    continue;
  }
  if (result.changes.length === 0) {
    console.log(`OK ${file}`);
    continue;
  }

  console.log(`CHANGED ${file}: ${result.changes.length} changes`);
  for (const c of result.changes) console.log(`    ${c.message}`);
  if (fix) {
    writeFileSync(path, `${JSON.stringify(result.fixed, null, 2)}\n`);
    console.log(`    rewrote ${file}`);
  } else {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
