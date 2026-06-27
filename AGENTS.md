# AGENTS.md

Guidance for AI coding agents working in this repo. (Claude Code reads this via
the `@AGENTS.md` import in `CLAUDE.md`.)

This is a single-user, self-hosted relay that forwards Telegram messages to a
coding agent — **Claude Code or Codex** — running on the host, and sends the
reply back. Stack: Bun + React (Vite) + Tailwind + `bun:sqlite`. The active
engine is a global setting (switchable via the dashboard or the `/engine`
Telegram command); engine implementations live behind `server/engine.ts` /
`server/engines.ts`.

## Transcribing incoming audio/video

Voice notes, audio files, and videos arrive as a local file path in your prompt
(the relay downloads them, no preprocessing). To transcribe one, run:

```bash
scripts/transcribe.sh <path-to-file>
```

It downmixes with `ffmpeg` and calls the OpenAI transcription API (`whisper-1`),
so **no local whisper install is needed — don't install one.** It works for
videos too (the audio track is extracted automatically).

It needs an OpenAI API key. If the script reports `OPENAI_API_KEY` is missing,
**ask the user in your reply to send their OpenAI API key** (an `sk-...`
string). When they reply with it, save it and retry:

```bash
scripts/save-openai-key.sh <sk-...>
scripts/transcribe.sh <path-to-file>
```

The key is stored in `data/agent.env` (gitignored, chmod 600) and the relay
loads it into every future agent run, so you only need to ask once. Heads-up the
user that the key will be visible in their Telegram chat history.

## Setup

Install the system dependencies (bun, Node, pm2, git, jq, sqlite3):

```bash
bin/doctor     # read-only: report what's present / missing
bin/install    # install anything missing (Ubuntu/Debian, idempotent, uses sudo)
```

`bin/install` does **not** install or log into the agent CLIs — install + auth
Claude Code (`claude`) and/or Codex (`codex login`) yourself; `bin/doctor`
prints the links. See the README "VPS setup" section for the full flow.

## Updating

To pull, build, and restart the relay seamlessly (and get a Telegram ping when
it's back), run:

```bash
setsid nohup ~/coding-agent-telegram-relay/bin/safe-update-relay >/dev/null 2>&1 < /dev/null &
```

The `setsid nohup … &` prefix is required so the script survives `pm2 restart`
killing its caller. The script re-execs itself from a `/tmp` copy on startup, so
the `git pull` can safely rewrite the in-repo copy mid-deploy. A failed
pull/build aborts before the restart, leaving the running relay untouched.

Config via env vars (defaults shown):

- `RELAY_PROCESS_NAME` — pm2 process name (default `coding-agent-telegram-relay`)
- `RELAY_REPO_DIR` — checkout to deploy (default: auto-derived from the script's
  own location, i.e. the repo it lives in)

### One-time VPS migration (from the old `claude-code-telegram` name)

The repo, dir, and pm2 process were renamed. If your VPS still uses the old
names, after the first pull either rename them or override via env:

```bash
# Option A — keep old names, just override the pm2 process name per run:
RELAY_PROCESS_NAME=claude-code-telegram ~/claude-code-telegram/bin/safe-update-relay

# Option B — migrate to the new names (then the defaults just work):
pm2 delete claude-code-telegram
mv ~/claude-code-telegram ~/coding-agent-telegram-relay
cd ~/coding-agent-telegram-relay
pm2 start "bun start" --name coding-agent-telegram-relay   # re-add with your usual env (PORT, etc.)
pm2 save
```

The old external `~/bin/safe-update-relay` can be deleted once the in-repo
script is in use.
