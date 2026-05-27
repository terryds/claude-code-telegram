import { getSetting, setSetting, db, logMessage } from './db.ts';
import {
  getTelegramConfig,
  getUpdatesRaw,
  sendTelegram,
  sendTelegramPlain,
  sendChatAction,
  setMyCommands,
  type TelegramUpdate,
} from './telegram.ts';
import { runClaudeHeadless } from './claude-runner.ts';

const TG_OFFSET_KEY = 'telegram_update_offset';
const CLAUDE_SESSION_KEY = 'claude_session_id';
const ENABLED_KEY = 'relay_enabled';
const CAPTURE_KEY = 'capture_chat_id';
const CAPTURED_KEY = 'captured_chat_id';

export function isRelayEnabled(): boolean {
  return getSetting(ENABLED_KEY) === '1';
}

export function setRelayEnabled(enabled: boolean): void {
  setSetting(ENABLED_KEY, enabled ? '1' : '0');
}

export function setCaptureMode(on: boolean): void {
  if (on) {
    setSetting(CAPTURE_KEY, '1');
    db.prepare('DELETE FROM settings WHERE key = ?').run(CAPTURED_KEY);
  } else {
    db.prepare('DELETE FROM settings WHERE key = ?').run(CAPTURE_KEY);
  }
}

export function getCapturedChatId(): string | null {
  return getSetting(CAPTURED_KEY);
}

function isCapturing(): boolean {
  return getSetting(CAPTURE_KEY) === '1';
}

function setOffset(id: number): void {
  setSetting(TG_OFFSET_KEY, String(id));
}

function getOffset(): number {
  return Number(getSetting(TG_OFFSET_KEY) || '0') || 0;
}

let listenerLoopRunning = false;

export function startListener(): void {
  if (listenerLoopRunning) return;
  listenerLoopRunning = true;
  console.log('[tg-listener] loop started');
  loop().catch((err) => {
    console.error('[tg-listener] loop crashed:', err);
    listenerLoopRunning = false;
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTyping<T>(fn: () => Promise<T>): Promise<T> {
  await sendChatAction('typing');
  const interval = setInterval(() => {
    sendChatAction('typing').catch(() => {});
  }, 4000);
  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
}

async function loop(): Promise<void> {
  while (listenerLoopRunning) {
    const { botToken, chatId } = getTelegramConfig();
    const capturing = isCapturing();

    if (!botToken) {
      await sleep(5000);
      continue;
    }
    // We poll if either we're capturing (onboarding) or relaying is enabled.
    if (!capturing && (!isRelayEnabled() || !chatId)) {
      await sleep(3000);
      continue;
    }

    const r = await getUpdatesRaw(getOffset(), 25);
    if (!r.ok) {
      console.error(`[tg-listener] getUpdates failed: ${r.error}`);
      await sleep(5000);
      continue;
    }
    if (r.updates.length === 0) continue;

    for (const upd of r.updates) {
      try {
        await processUpdate(upd, chatId);
      } catch (err) {
        console.error('[tg-listener] process error:', err);
      }
    }

    const maxId = r.updates.reduce((m, u) => Math.max(m, u.update_id), 0);
    setOffset(maxId + 1);
  }
}

async function processUpdate(upd: TelegramUpdate, expectedChatId: string | null): Promise<void> {
  const msg = upd.message;
  if (!msg) return;

  const incomingChatId = String(msg.chat.id);

  // Onboarding capture: the first message during capture mode wins.
  if (isCapturing()) {
    setSetting(CAPTURED_KEY, incomingChatId);
    setSetting('telegram_chat_id', incomingChatId);
    db.prepare('DELETE FROM settings WHERE key = ?').run(CAPTURE_KEY);
    // Acknowledge via the token used for this very chat — sendTelegram reads chat_id from settings.
    await sendTelegram(
      [
        '✅ <b>Chat linked!</b>',
        '',
        `Chat ID: <code>${incomingChatId}</code>`,
        '',
        'Onboarding complete. Head back to the dashboard to enable the relay.',
      ].join('\n')
    );
    return;
  }

  if (!expectedChatId) return;
  if (incomingChatId !== expectedChatId) {
    console.log(`[tg-listener] ignored message from unauthorized chat ${incomingChatId}`);
    return;
  }

  if (!isRelayEnabled()) return;

  const text = (msg.text ?? '').trim();
  if (!text) return;

  if (text === '/new_session' || text.startsWith('/new_session ')) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(CLAUDE_SESSION_KEY);
    await sendTelegram(
      '🔄 <b>New conversation started.</b>\nThe next message will begin a fresh Claude session.'
    );
    return;
  }

  if (text === '/start' || text === '/help') {
    await sendTelegram(
      [
        '<b>Claude Code Telegram Relay</b>',
        '',
        "Send a message and I'll relay it to Claude Code running on your VPS.",
        '',
        'Commands:',
        '  /new_session — start a fresh Claude conversation',
        '  /help — show this message',
      ].join('\n')
    );
    return;
  }

  logMessage({ direction: 'in', text, session_id: getSetting(CLAUDE_SESSION_KEY) });

  const sessionId = getSetting(CLAUDE_SESSION_KEY);
  console.log(
    `[tg-listener] → claude (${sessionId ? 'resume ' + sessionId.slice(0, 8) : 'new session'}): ${text.slice(0, 80)}`
  );
  const result = await withTyping(() => runClaudeHeadless(text, sessionId));

  if (result.ok) {
    if (result.session_id) setSetting(CLAUDE_SESSION_KEY, result.session_id);
    const body = result.text || '(Claude returned an empty response)';
    const r = await sendTelegramPlain(body);
    logMessage({
      direction: 'out',
      text: body,
      session_id: result.session_id,
      ok: r.ok,
      error: r.error ?? null,
    });
    if (!r.ok) console.error(`[tg-listener] send failed: ${r.error}`);
  } else {
    logMessage({
      direction: 'out',
      text: '',
      session_id: null,
      ok: false,
      error: result.error,
    });
    await sendTelegram(`⚠️ <b>Claude error</b>\n${escapeHtml(result.error)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function applyBotCommands(): Promise<void> {
  await setMyCommands([
    { command: 'new_session', description: 'Start a new Claude conversation' },
    { command: 'help', description: 'Show usage' },
  ]);
}

export async function skipBacklog(): Promise<void> {
  const r = await getUpdatesRaw(0, 0);
  if (r.ok) {
    const maxId = r.updates.reduce((m, u) => Math.max(m, u.update_id), 0);
    setOffset(Math.max(maxId + 1, getOffset()));
  }
}
