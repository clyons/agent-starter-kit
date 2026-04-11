# agent-starter-kit

Hygiene infrastructure for new repos. Opinionated about process, silent about architecture.

Bring your own runtime, framework, and deploy target. This kit gives you:

- **Branch hygiene** — CI check that detects commits orphaned after a squash-merge
- **PR quality gates** — enforces ExecPlan links and Validation Evidence in every PR
- **ExecPlan system** — structured execution plans for multi-hour work
- **1Password secret sync** — publish and refresh dev secrets across machines
- **Git hooks** — post-merge cache buster for dev servers on `:3000`
- **Agent guidance** — `AGENTS.md` and `CLAUDE.md` skeleton for AI coding assistants

---

## Starting a new repo

**1. Create your repo from this template**

Click **"Use this template"** on GitHub, or:

```bash
gh repo create your-org/your-repo --template clyons/agent-starter-kit --private
git clone git@github.com:your-org/your-repo.git
cd your-repo
```

**2. Run setup**

```bash
bash setup.sh
```

This replaces `{{REPO_NAME}}` everywhere, wires up git hooks, and prints a checklist of remaining manual steps.

**3. Finish the checklist**

- GitHub → Settings → General → enable **"Automatically delete head branches"**
- GitHub → Settings → Branches → add rule for `main`:
  - Require a pull request before merging
  - Require status checks to pass: `pr-metadata`, `quality-checks`
- Fill in `CLAUDE.md` (project description, architecture, commands)
- Update `.agent/PLANS.md` → "Repository Baseline" with your structure and test commands
- Once `.env.local` is populated: `npm run secrets:publish`

---

## Adding to an existing repo

Clone this kit, then run `incorporate.sh` pointing at your existing repo:

```bash
git clone git@github.com:clyons/agent-starter-kit.git
cd agent-starter-kit
bash incorporate.sh /path/to/your/existing-repo
```

This copies all files into your repo without overwriting existing ones. Then:

```bash
cd /path/to/your/existing-repo
bash setup.sh
```

If you already have `AGENTS.md` or `CLAUDE.md`, `incorporate.sh` will skip them and tell you to merge manually. The key sections to add from this kit are:

- **Branch Hygiene** (from `AGENTS.md`) — the rules are inviolate; add verbatim
- **Environment Files** rule (from `AGENTS.md`) — add verbatim
- **ExecPlan Workflow** (from `AGENTS.md`) — add if you want ExecPlans

Pass `--overwrite` to replace existing files:

```bash
bash incorporate.sh /path/to/your/existing-repo --overwrite
```

---

## What's included

### `.github/workflows/orphan-check.yml`

Runs after every PR merge. Detects commits that were pushed to the branch after the PR was squash-merged — they'd otherwise be silently lost. Opens a GitHub issue if any are found.

### `.github/workflows/pr-quality.yml`

Runs on every PR to `main`. Two jobs:

1. **`pr-metadata`** — fails if the PR body doesn't include an ExecPlan path (or explicit `N/A reason:`) and a `Validation Evidence` section.
2. **`quality-checks`** — runs `npm ci`, `lint`, `tsc --noEmit`, `build`. Add your own test step via the commented-out block at the bottom.

### `.github/pull_request_template.md`

Pre-filled PR template with Summary, ExecPlan, Validation Evidence, and Risks sections.

### `.agent/` — ExecPlan system

- `PLANS.md` — the contract: when to write a plan, required sections, validation rules
- `execplans/TEMPLATE.md` — copy this to start a new plan
- `execplans/README.md` — naming convention and workflow

### `AGENTS.md`

Rules for AI coding assistants (and humans). Covers ExecPlan workflow, branch hygiene, env file safety, and PR requirements.

### `CLAUDE.md`

Skeleton for Claude Code context. Fill in your project description, architecture, and commands.

### `scripts/` — 1Password secret sync

Two scripts that use `op` (1Password CLI) to sync dev secrets:

```bash
# Push local env files into 1Password (run once on setup, or after adding keys)
npx tsx scripts/publish-1password-secrets.ts

# Pull secrets from 1Password into local env files (run on a fresh machine)
npx tsx scripts/refresh-1password-secrets.ts
```

Both support `--dry-run`. The 1Password item is named `dev:{{REPO_NAME}}` by default.

Fields are stored with routing prefixes:
- `local.KEY` → `.env.local`
- `cli.KEY` → `.env.cli`

See `docs/operations/1password-env-sync.md` for the full pattern.

If using a Node.js project, add to `package.json`:

```json
{
  "scripts": {
    "secrets:publish": "tsx scripts/publish-1password-secrets.ts",
    "secrets:refresh": "tsx scripts/refresh-1password-secrets.ts"
  }
}
```

### `.githooks/post-merge`

Clears the `.next` cache and restarts the dev server on `:3000` after every `git pull` or merge. Assumes a Node.js project with `npm run dev`. Modify the cache directory and dev command for your stack.

Activated by `setup.sh` via `git config core.hooksPath .githooks`.

---

## Required local tools

| Tool | Purpose |
|------|---------|
| `node` ≥ 20 + `npm` | Run TypeScript secrets scripts via `npx tsx` |
| `op` (1Password CLI) | Authenticate and read/write secrets |
| `gh` (GitHub CLI) | Create repos, PRs, issues |

---

## No GitHub secrets required

This kit contains no deploy workflow. CI only needs the default `GITHUB_TOKEN` (already available in all Actions runs). Add your own deploy workflow and secrets when you're ready.
