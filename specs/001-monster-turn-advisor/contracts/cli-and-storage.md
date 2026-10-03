# Contract: `check:monsters` CLI and local storage

## `npm run check:monsters [-- --fix]`

- Input: every `fixtures/monsters/*.json`. CR is read from the filename `<Name>.CR<n>.<edition>.json`.
- For each file, runs `normalize.ts` then strict zod validation, and prints:
  `OK <file>` or `CHANGED <file>: <n> changes` (each change message indented) or `INVALID <file>: <errors>`.
- Exit code 0 only if every file is OK. `--fix` rewrites CHANGED files with the fixed JSON (2-space
  indent, trailing newline) and exits 0 if all are then valid; INVALID files are never rewritten.
- Pure normalizer shared with the app; the script only does file I/O.

## localStorage

| Key | Value |
|---|---|
| `mja.v1.trackers` | `{ version: 1, selectedId: string \| null, trackers: Tracker[] }` (zod-validated on read) |
| `mja.v1.trackers.corrupt` | the last unreadable blob, kept for recovery |

- All `localStorage` access goes through one hook in `app/` (`useTrackers`), which uses the pure
  serialize/parse functions in `lib/encounter/storage.ts`. Every read and write is wrapped in try/catch. Unreadable or invalid → empty default `{ version: 1, selectedId: null, trackers: [] }`.
- Write failures (quota, private mode) show a non-blocking warning; the in-memory session keeps working.

> Note: `PLAN.md` places `storage.ts` under `lib/encounter/`, while `CLAUDE.md` keeps `lib/encounter`
> free of `localStorage`. Resolution (see plan.md Complexity Tracking): `lib/encounter/storage.ts` holds
> only pure serialize/parse functions; the `localStorage` calls live in `app/` (`useTrackers` hook).
