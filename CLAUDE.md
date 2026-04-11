# CLAUDE.md

Context for Claude Code when working in this repository.

## What This Is

<!-- Describe your project here -->

## Architecture

<!-- Describe your architecture here -->

## Commands

```bash
# Add your project's key commands here, for example:
# npm run dev       # Start development server
# npm run build     # Production build
# npm run test      # Run tests
# npm run lint      # Lint
```

## Git Workflow

Never push directly to main. Always use feature branches and PRs.

**CRITICAL: Every merge to main triggers a deploy to prod.** Before merging any PR, run your build and fix all errors. Never merge a PR with a failing build.

```bash
git checkout -b feature/your-feature-name
git add <files>
git commit -m "Your message"
git push -u origin feature/your-feature-name
gh pr create --title "Title" --body "Description"
# run build — MUST pass before merging
gh pr merge --merge
```

### Branch Hygiene (INVIOLATE)

See `AGENTS.md` → "Branch Hygiene" for the full rules. Branches are auto-deleted after merge.

Required minimum behavior:
- One branch = one feature.
- Never push commits to a branch after its PR is merged.
- Before merge, verify intended branch delta with `git log origin/main..<branch> --oneline`.
- Follow-up work always starts on a new branch from updated `main`.

## Environment Files

Never overwrite `.env.local` wholesale. See `AGENTS.md` → "Environment Files" for the full rule.
