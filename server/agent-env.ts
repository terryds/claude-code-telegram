import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Persisted, agent-writable secrets (currently just OPENAI_API_KEY). The agent
// saves here via scripts/save-openai-key.sh; we load it into every spawn.
const AGENT_ENV_PATH = resolve('./data/agent.env');

/**
 * Build the environment for a spawned agent: the relay's own env, with any keys
 * persisted in data/agent.env filled in where the process env doesn't already
 * define them (so a real env var always wins). Read fresh on every spawn, so a
 * key the agent just saved — e.g. an OPENAI_API_KEY the user sent over Telegram
 * — is picked up on the next message without restarting the relay.
 */
export function agentSpawnEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (!existsSync(AGENT_ENV_PATH)) return env;

  let text: string;
  try {
    text = readFileSync(AGENT_ENV_PATH, 'utf8');
  } catch {
    return env;
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || env[key] != null) continue; // real env wins over the file
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}
