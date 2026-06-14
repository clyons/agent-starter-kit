#!/usr/bin/env bash
# Prepare a Conductor workspace without overwriting divergent local secrets.

set -euo pipefail

if [ -z "${CONDUCTOR_ROOT_PATH:-}" ]; then
  echo "CONDUCTOR_ROOT_PATH is not set; skipping .env.local symlink setup."
  exit 0
fi

root_env="$CONDUCTOR_ROOT_PATH/.env.local"
workspace_env=".env.local"

if [ ! -e "$root_env" ]; then
  echo "No root .env.local found at $root_env; skipping workspace symlink setup."
  exit 0
fi

if [ -L "$workspace_env" ]; then
  current_target=$(readlink "$workspace_env")
  if [ "$current_target" = "$root_env" ]; then
    echo ".env.local already points at root .env.local."
    exit 0
  fi

  echo "Warning: .env.local is a symlink to $current_target, expected $root_env." >&2
  echo "Inspect it manually before changing workspace secret wiring." >&2
  exit 1
fi

if [ -e "$workspace_env" ]; then
  if diff -q "$workspace_env" "$root_env" >/dev/null 2>&1; then
    rm "$workspace_env"
  else
    echo "Warning: workspace .env.local differs from root .env.local." >&2
    echo "Delete it manually and rerun setup if the root file should be shared." >&2
    exit 1
  fi
fi

ln -s "$root_env" "$workspace_env"
echo "Linked workspace .env.local to root .env.local."
