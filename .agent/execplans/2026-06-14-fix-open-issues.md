# Fix open starter-kit issues

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the governing standard for ExecPlans. Keep this document aligned with that contract.

## Purpose / Big Picture

Resolve the remaining valid open issues in `clyons/agent-starter-kit` so new template users and existing repos that incorporate the kit get safer Conductor workspace setup, more current GitHub Actions workflows, stronger orphan-commit detection, and 1Password publishing that does not expose secret values in command-line arguments.

The observable outcome is a merged PR that closes or addresses issues #3, #7, #8, and #9. Users should be able to create a Conductor workspace without accidentally overwriting divergent `.env.local` content, run the GitHub workflows with current action versions, detect post-merge commits on stale branches, and publish secrets through temporary 1Password item templates rather than `KEY[text]=value` process arguments.

## Progress

- [x] (2026-06-14 22:18Z) Created fresh branch `clyons/fix-open-issues` from `origin/main`.
- [x] (2026-06-14 22:18Z) Created this ExecPlan.
- [x] (2026-06-14 22:23Z) Implemented Conductor workspace setup template for issue #3.
- [x] (2026-06-14 22:24Z) Implemented orphan-check push guard and label creation for issues #7 and #9.
- [x] (2026-06-14 22:24Z) Updated Actions versions for issue #9.
- [x] (2026-06-14 22:27Z) Reworked 1Password publish helper for issue #8.
- [x] (2026-06-14 22:32Z) Ran validation and recorded evidence.
- [ ] Open PR and link this ExecPlan.

## Surprises & Discoveries

- Observation: `op item create --help` and `op item edit --help` explicitly warn that assignment-statement command arguments can expose sensitive values to command history or local process listings, and recommend JSON templates for sensitive values.
  Evidence: local `op` CLI help output.

- Observation: `actions/checkout` and `actions/setup-node` both have `v6` tags available upstream.
  Evidence: `git ls-remote --tags https://github.com/actions/checkout.git refs/tags/v6` and equivalent `actions/setup-node` command returned tag SHAs during issue triage.

## Decision Log

- Decision: Use one PR and one ExecPlan for issues #3, #7, #8, and #9.
  Rationale: The issues are all starter-kit hygiene fixes and affect the template surface as a coherent release. Keeping them together makes downstream incorporation simpler.
  Date/Author: 2026-06-14 / Codex

- Decision: Put Conductor setup logic in `scripts/conductor-setup.sh` and call it from `conductor.json`.
  Rationale: A tracked shell script is easier to read, test, and customize than a long escaped JSON one-liner.
  Date/Author: 2026-06-14 / Codex

- Decision: Use 1Password JSON templates written to temporary `0600` files for publish create/edit operations.
  Rationale: This follows `op` CLI guidance for sensitive values and keeps secret values out of process arguments.
  Date/Author: 2026-06-14 / Codex

## Outcomes & Retrospective

Implementation is complete and validated locally. PR creation remains.

## Context and Orientation

- `conductor.json` does not currently exist. Conductor reads this file at the repository root and runs `scripts.setup` from each workspace directory. `CONDUCTOR_ROOT_PATH` points at the root checkout.
- `.github/workflows/orphan-check.yml` currently runs only on merged PR close events. It detects commits left on a branch after merge but cannot catch commits pushed after the PR has already merged. It also creates an issue with label `orphaned-work` but does not create that label first.
- `.github/workflows/pr-quality.yml` and `.github/workflows/orphan-check.yml` use `actions/checkout@v4`; `pr-quality.yml` uses `actions/setup-node@v4`.
- `scripts/publish-1password-secrets.ts` currently passes secret values to `op item create` and `op item edit` as command arguments like `KEY[text]=value`. That exposes values via process listings on some systems.

## Plan of Work

1. Add `conductor.json` with a hardened setup script. The script should make `.env.local` a symlink to `$CONDUCTOR_ROOT_PATH/.env.local`, silently accept the correct symlink, replace only identical real files, and fail before overwriting divergent files or unexpected symlinks.
2. Update GitHub Actions versions in workflows from v4 to v6 where the v6 tags exist.
3. Rework `.github/workflows/orphan-check.yml` so:
   - the existing merged-PR path still runs on `pull_request.closed`;
   - a new push path runs on non-main branches;
   - the push path checks whether the pushed branch belongs to an already-merged PR before reporting orphans;
   - the workflow creates the `orphaned-work` label if missing before filing an issue.
4. Rework `scripts/publish-1password-secrets.ts` so live create/edit calls use temporary JSON item templates with restrictive permissions instead of passing secret values as command arguments. Preserve dry-run behavior and summary output.
5. Update documentation where command behavior or Conductor setup surface changes.

## Concrete Steps

From repository root:

    bash -n setup.sh incorporate.sh .githooks/post-merge
    ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/orphan-check.yml .github/workflows/pr-quality.yml
    tmp=$(mktemp -d); cd "$tmp"; npm init -y >/dev/null; npm install --silent typescript @types/node; npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node /Users/ciaran/conductor/workspaces/agent-starter-kit-v1/nairobi/scripts/publish-1password-secrets.ts /Users/ciaran/conductor/workspaces/agent-starter-kit-v1/nairobi/scripts/refresh-1password-secrets.ts

Task-specific smoke checks:

    node or npx tsx based test harnesses for publish helper argument safety
    temporary git repository simulations for orphan-check merged-PR and post-merge-push cases
    shell smoke tests for conductor setup with matching, divergent, and symlinked .env.local files

## Validation and Acceptance

- `conductor.json` is valid JSON and its setup script:
  - exits cleanly when `.env.local` is already the correct symlink;
  - replaces a real `.env.local` only when it matches the root file;
  - fails and preserves content when workspace `.env.local` differs;
  - creates the symlink when no workspace `.env.local` exists.
- Workflow YAML parses successfully.
- Orphan check still avoids normal squash-merge false positives and branch-reset-to-main false positives.
- Orphan check reports commits pushed to a branch after its PR has already merged.
- `orphaned-work` label creation is attempted before issue creation.
- 1Password publish helper live paths do not include secret values in `op` command argument arrays.
- TypeScript compilation passes for both 1Password helper scripts.

## Idempotence and Recovery

The branch is based on `origin/main`. All edits are normal tracked-file changes and can be reverted file-by-file. The Conductor setup script is intended to be idempotent for the correct symlink case. Workflow changes are only active after merge. The 1Password publish helper writes temporary files under the OS temp directory and deletes them in `finally`; failures should not mutate local env files.

## Artifacts and Notes

- Shell syntax passed: `bash -n setup.sh incorporate.sh .githooks/post-merge scripts/conductor-setup.sh`.
- YAML/JSON parsing passed: both workflow files loaded through Ruby YAML; `conductor.json` loaded through Ruby JSON.
- TypeScript compile passed for `scripts/publish-1password-secrets.ts` and `scripts/refresh-1password-secrets.ts`.
- `git diff --check` passed.
- Conductor setup smoke passed for missing workspace env, identical real env, divergent real env, and existing correct symlink.
- `incorporate.sh` smoke passed against a temporary git repo; `conductor.json`, executable `scripts/conductor-setup.sh`, and workflows were copied.
- Orphan calculation smoke passed for original squash branch, reset-to-squash/main branch, and post-merge pushed late commit.
- Publish helper fake-`op` smoke passed for create and edit paths; captured process arguments contained no secret values, while template JSON contained the expected secrets.

## Interfaces and Dependencies

- Conductor: `conductor.json` `scripts.setup`, `CONDUCTOR_ROOT_PATH`.
- GitHub Actions: `pull_request.closed`, `push`, `github.event` payload, `GH_TOKEN`, `gh pr list`, `gh issue create`, `gh label create`.
- 1Password CLI: `op item get`, `op item create`, `op item edit`, JSON templates.
- Node.js: `node:child_process.execFile`, `node:fs/promises`, `node:os`, `node:path`.

## Change Log

- 2026-06-14: Created the plan from template.
- 2026-06-14: Implemented and validated fixes for issues #3, #7, #8, and #9.
