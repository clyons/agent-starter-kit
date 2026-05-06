# Fix dry-run filesystem mutation and align upsertEnvFile with AGENTS.md env-file rule

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the governing standard for ExecPlans. Keep this document aligned with that contract.

## Notes to Maintainer

Two bugs were fixed in `scripts/refresh-1password-secrets.ts`. They are related and landed together.

**Bug 1 — dry-run created files it should not touch.**
`main()` called `ensureFileExists(path)` unconditionally before checking `args.dryRun`. A dry run would silently create empty `.env.local` and `.env.cli` files if they did not exist. Fixed by replacing the `ensureFileExists(path) + readFile(path)` pair in the analysis loop with `readEnvFileIfPresent(path)`, which returns `''` for missing files without creating them. The live path still creates missing files through `upsertEnvFile → ensureFileExists`.

**Bug 2 — upsertEnvFile performed a whole-file write, violating AGENTS.md.**
`upsertEnvFile` read the file, rebuilt all lines in memory, and called `writeFile(path, nextText)`. AGENTS.md "Environment Files (INVIOLATE)" explicitly forbids this: `.env.local` may be a symlink shared across worktrees, and a whole-file write destroys all credentials stored in the shared target. Fixed by rewriting `upsertEnvFile` to use `sed -i` per existing key and `appendFile` per new key.

**Why sed and not a smarter Node approach?**
There is no way to update a single line of a file in Node.js without writing the whole file back — even `sed -i` does this under the hood via a temp file and rename. The rule in AGENTS.md is a usage pattern constraint ("don't accidentally clobber the whole file"), not a kernel-level guarantee. The sed + appendFile implementation matches the pattern AGENTS.md prescribes and makes the intent explicit to anyone reading the script.

**Trade-offs accepted:**
- Per-key `execFileAsync('sed', ...)` calls — not atomic across multiple keys. A crash mid-run leaves the file partially updated. Acceptable because partial updates are still valid env assignments; re-running the script is idempotent.
- `sed` shell dependency — not portable to Windows. Acceptable for a developer-machine secret-refresh script.
- No trailing-newline normalization pass. The script now appends with `\n` terminators and handles the missing-trailing-newline edge case via `appendedBefore` (see below).

## Purpose / Big Picture

`npx tsx scripts/refresh-1password-secrets.ts --dry-run` is now fully read-only. Live runs no longer perform whole-file writes on env files that may be symlinks.

## Progress

- [x] (2026-05-06) Bug 1 fixed: `readEnvFileIfPresent` replaces `ensureFileExists + readFile` in `main()`.
- [x] (2026-05-06) Bug 2 fixed: `upsertEnvFile` rewritten to use `sed -i` + `appendFile`.
- [x] (2026-05-06) PR opened linking this plan: https://github.com/clyons/agent-starter-kit/pull/1.
- [x] (2026-05-06) Validation complete: TypeScript check plus dry-run and live-run smoke tests in a temporary workspace with a fake `op` executable.

## Surprises & Discoveries

- Observation: `resolveEnvPath` calls `realpath`, which dereferences symlinks before returning the path. This means `writeFile` would write to the symlink target rather than replacing the symlink itself — but it would still overwrite all of the target's contents. `realpath` does not make `writeFile` safe here.
  Evidence: `scripts/refresh-1password-secrets.ts:75-82`.

- Observation: The `appendedBefore` flag is needed because `original.endsWith('\n')` is checked once before the loop. If the file lacks a trailing newline and multiple keys are new, the first append needs a `\n` prefix but subsequent ones do not (the previous append already ended with `\n`).
  Evidence: `scripts/refresh-1password-secrets.ts:148,159`.

## Decision Log

- Decision: Use `sed -i` + `appendFile` rather than read-modify-write-all in `upsertEnvFile`.
  Rationale: AGENTS.md "Environment Files (INVIOLATE)" forbids whole-file writes to `.env.local` because it may be a symlink. The sed pattern matches what AGENTS.md prescribes.
  Date/Author: 2026-05-06 / Ciaran Lyons

- Decision: Use `|` as the sed delimiter instead of `/`.
  Rationale: Env values frequently contain `/` (paths, URLs). Using `|` avoids escaping slashes in the sed script.
  Date/Author: 2026-05-06 / Ciaran Lyons

- Decision: `escapeForSedReplacement` escapes `\` before `|` and `&`.
  Rationale: Order matters — escaping `\` first prevents double-escaping the characters added in subsequent passes.
  Date/Author: 2026-05-06 / Ciaran Lyons

## Outcomes & Retrospective

Complete after PR merge.

## Context and Orientation

- `scripts/refresh-1password-secrets.ts` — reads a 1Password item via `op` CLI and upserts its fields into `.env.local` and `.env.cli`. Supports `--dry-run`, `--item`, `--output`.
- `AGENTS.md` → "Environment Files (INVIOLATE)" — forbids whole-file overwrites of `.env.local`. Mandates `sed -i` for updates and `>>` for appends.

Key functions:
- `readEnvFileIfPresent(path)` — returns file contents or `''` if missing, without creating the file.
- `ensureFileExists(path)` — creates the file if absent; called only from `upsertEnvFile` (live path only).
- `upsertEnvFile(path, updates)` — calls `ensureFileExists`, then `sed -i` per existing key, `appendFile` per new key.
- `escapeForSedReplacement(s)` — escapes `\`, `|`, `&` for use in a sed replacement string with `|` delimiter.
- `main()` — uses `readEnvFileIfPresent` for dry-run analysis; calls `upsertEnvFile` only when `!args.dryRun`.

## Validation and Acceptance

1. `--dry-run` against a non-existent `.env.local` leaves the file non-existent.
2. `--dry-run` against an existing `.env.local` leaves its mtime and content unchanged.
3. Live run with a mix of existing and new keys updates existing keys in-place and appends new keys; no other lines are touched.
4. `npx tsc --noEmit` passes.

## Artifacts and Notes

Validation evidence from 2026-05-06:

- TypeScript check passed:
  `tmp=$(mktemp -d); cd "$tmp"; npm init -y >/dev/null; npm install --silent typescript @types/node; npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node /Users/ciaran/conductor/workspaces/agent-starter-kit/dallas/scripts/refresh-1password-secrets.ts`
- Dry-run smoke against a temporary workspace with no `.env.local` and no `.env.cli` passed: after `npx -y tsx scripts/refresh-1password-secrets.ts --dry-run --item dev:test`, both files remained absent.
- Dry-run smoke against existing temporary `.env.local` and `.env.cli` passed: SHA-1 hashes and mtimes were unchanged after the dry run.
- Live-run smoke against existing temporary env files passed. The fake `op` item produced `local.EXISTING`, `local.NEW_KEY`, and `cli.CLI_KEY`; live mode changed `EXISTING=old` to `EXISTING=new/value`, preserved `KEEP=unchanged`, appended `NEW_KEY="needs spaces & pipes | ok"`, preserved `CLI_KEEP=yes`, and appended `CLI_KEY=cli-secret`.
- PR: https://github.com/clyons/agent-starter-kit/pull/1.

## Interfaces and Dependencies

- External CLI: `op` (1Password). Unchanged.
- External CLI: `sed`. Required for live runs on macOS and Linux. Not available on Windows.
- Node APIs: `node:fs/promises` (`access`, `appendFile`, `mkdir`, `readFile`, `realpath`, `writeFile`), `node:child_process.execFile`, `node:path`, `node:util.promisify`.
- `upsertEnvFile(path, updates)` returns `{ updated: string[], added: string[] }`. Signature unchanged.

## Change Log

- 2026-05-06: Created from scratch to replace a confusing draft that described an abandoned plan to revert the sed approach.
