#!/usr/bin/env bash
#
# Transcribe an incoming audio/video file using the OpenAI transcription API.
#
#   scripts/transcribe.sh <media-file> [model]
#
# - ffmpeg downmixes to a small mono 16kHz mp3 first: this extracts the audio
#   from videos and keeps the upload under OpenAI's 25 MB limit.
# - No local whisper install is needed — it just calls the API.
# - Needs OPENAI_API_KEY (from the environment, or saved in data/agent.env via
#   scripts/save-openai-key.sh). If it's missing, this exits 3 with a message
#   you should relay to the user, asking them to send their key.
#
set -euo pipefail

src="${1:-}"
model="${2:-whisper-1}"

if [[ -z "$src" ]]; then
  echo "usage: scripts/transcribe.sh <media-file> [model]" >&2
  exit 2
fi
if [[ ! -f "$src" ]]; then
  echo "file not found: $src" >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_dir/data/agent.env"

# Fall back to the saved key so an in-session retry works right after the user
# sends their key (the relay only injects it into the env on the next message).
if [[ -z "${OPENAI_API_KEY:-}" && -f "$env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  cat >&2 <<'MSG'
OPENAI_API_KEY is not set, so I can't transcribe this yet.
Ask the user to send their OpenAI API key (an "sk-..." string). When they do,
save it with `scripts/save-openai-key.sh <key>` and run this again.
MSG
  exit 3
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is not installed — it's required to extract/downmix the audio." >&2
  exit 4
fi

tmpdir="$(mktemp -d)"
audio="$tmpdir/audio.mp3"
out="$tmpdir/out.txt"
trap 'rm -rf "$tmpdir"' EXIT

if ! ffmpeg -y -i "$src" -vn -ac 1 -ar 16000 -b:a 64k "$audio" >/dev/null 2>&1; then
  echo "ffmpeg failed to extract audio from: $src (is there an audio track?)" >&2
  exit 4
fi

code="$(curl -sS -o "$out" -w '%{http_code}' \
  https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=$model" \
  -F "file=@$audio" \
  -F "response_format=text")"

if [[ "$code" != "200" ]]; then
  echo "OpenAI transcription failed (HTTP $code):" >&2
  cat "$out" >&2
  exit 5
fi

cat "$out"
