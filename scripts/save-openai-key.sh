#!/usr/bin/env bash
#
# Persist an OpenAI API key so the relay injects it into every future agent run.
#
#   scripts/save-openai-key.sh <sk-...>
#
# Writes data/agent.env (gitignored, chmod 600). The relay merges this file into
# the environment of each spawned agent, so you only need to ask the user once.
#
set -euo pipefail

key="${1:-}"
if [[ -z "$key" ]]; then
  echo "usage: scripts/save-openai-key.sh <sk-...>" >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_dir/data/agent.env"
mkdir -p "$repo_dir/data"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
# Drop any existing OPENAI_API_KEY line, keep the rest, then append the new one.
if [[ -f "$env_file" ]]; then
  grep -v '^OPENAI_API_KEY=' "$env_file" > "$tmp" || true
fi
echo "OPENAI_API_KEY=$key" >> "$tmp"
mv "$tmp" "$env_file"
chmod 600 "$env_file"
trap - EXIT

echo "Saved OPENAI_API_KEY to data/agent.env — future transcriptions will use it."
