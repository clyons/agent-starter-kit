#!/usr/bin/env bash
# incorporate.sh — copy agent-starter-kit files into an existing repo.
#
# Run from within the agent-starter-kit directory, pointing at your target repo:
#
#   bash incorporate.sh /path/to/your/existing-repo
#
# This is non-destructive: existing files are NOT overwritten by default.
# Pass --overwrite to replace them.

set -euo pipefail

TARGET=""
OVERWRITE=false

for arg in "$@"; do
  case "$arg" in
    --overwrite) OVERWRITE=true ;;
    -*) echo "Unknown flag: $arg"; exit 1 ;;
    *)  TARGET="$arg" ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Usage: bash incorporate.sh <target-repo-path> [--overwrite]"
  exit 1
fi

if [ ! -d "$TARGET/.git" ]; then
  echo "Error: $TARGET is not a git repository."
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")" && pwd)"
echo "Source: $SOURCE"
echo "Target: $TARGET"
echo ""

copy_file() {
  local src="$1"
  local dst="$2"
  local full_dst="$TARGET/$dst"

  mkdir -p "$(dirname "$full_dst")"

  if [ -f "$full_dst" ] && [ "$OVERWRITE" = false ]; then
    echo "  SKIP (exists): $dst  — pass --overwrite to replace"
  else
    cp "$src" "$full_dst"
    echo "  copied: $dst"
  fi
}

echo "Copying files..."
copy_file "$SOURCE/.github/workflows/orphan-check.yml"        ".github/workflows/orphan-check.yml"
copy_file "$SOURCE/.github/workflows/pr-quality.yml"          ".github/workflows/pr-quality.yml"
copy_file "$SOURCE/.github/pull_request_template.md"          ".github/pull_request_template.md"
copy_file "$SOURCE/.agent/PLANS.md"                           ".agent/PLANS.md"
copy_file "$SOURCE/.agent/execplans/TEMPLATE.md"              ".agent/execplans/TEMPLATE.md"
copy_file "$SOURCE/.agent/execplans/README.md"                ".agent/execplans/README.md"
copy_file "$SOURCE/.githooks/post-merge"                      ".githooks/post-merge"
copy_file "$SOURCE/scripts/publish-1password-secrets.ts"      "scripts/publish-1password-secrets.ts"
copy_file "$SOURCE/scripts/refresh-1password-secrets.ts"      "scripts/refresh-1password-secrets.ts"
copy_file "$SOURCE/docs/operations/1password-env-sync.md"     "docs/operations/1password-env-sync.md"

# AGENTS.md and CLAUDE.md: always skip if exist — these need manual merging
for f in AGENTS.md CLAUDE.md; do
  if [ -f "$TARGET/$f" ]; then
    echo "  SKIP (exists): $f  — merge manually from $SOURCE/$f"
  else
    cp "$SOURCE/$f" "$TARGET/$f"
    echo "  copied: $f"
  fi
done

chmod +x "$TARGET/.githooks/post-merge"

echo ""
echo "Now run setup.sh from within $TARGET:"
echo "  cd $TARGET && bash $(realpath --relative-to="$TARGET" "$SOURCE/setup.sh" 2>/dev/null || echo "$SOURCE/setup.sh")"
echo ""
echo "Or copy setup.sh too and run it there:"
copy_file "$SOURCE/setup.sh" "setup.sh"
echo ""
echo "  cd $TARGET && bash setup.sh"
