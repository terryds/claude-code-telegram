import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, type MessageLogEntry, type Status } from '../api';

type Props = { status: Status; onChange: () => void };

export function Dashboard({ status, onChange }: Props) {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<MessageLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = async () => {
    try {
      const r = await api.messages(50);
      setMessages(r.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    loadMessages();
    const id = window.setInterval(loadMessages, 3000);
    return () => window.clearInterval(id);
  }, []);

  const toggleRelay = async () => {
    setBusy('relay');
    setError(null);
    try {
      await api.setRelay(!status.relay_enabled);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resetSession = async () => {
    setBusy('session');
    setError(null);
    try {
      await api.resetSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resetAll = async () => {
    if (!confirm('Reset bot token, chat link, and session? You will need to re-onboard.')) {
      return;
    }
    setBusy('reset');
    setError(null);
    try {
      await api.reset();
      onChange();
      setLocation('/onboarding');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full max-w-4xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {status.bot ? (
              <>
                Connected to{' '}
                <a
                  className="underline hover:text-zinc-200"
                  href={`https://t.me/${status.bot.username}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{status.bot.username}
                </a>{' '}
                · chat <code className="text-zinc-300">{status.chat_id}</code>
              </>
            ) : (
              'No bot connected'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={[
              'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium',
              status.relay_enabled
                ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700',
            ].join(' ')}
          >
            <span
              className={[
                'w-1.5 h-1.5 rounded-full',
                status.relay_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500',
              ].join(' ')}
            />
            {status.relay_enabled ? 'Relay on' : 'Relay off'}
          </span>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={toggleRelay}
          disabled={busy === 'relay'}
          className={[
            'p-4 rounded-lg border text-left transition-colors disabled:opacity-50',
            status.relay_enabled
              ? 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800'
              : 'border-blue-700 bg-blue-950/40 hover:bg-blue-950/60',
          ].join(' ')}
        >
          <div className="font-medium text-sm">
            {status.relay_enabled ? 'Pause relay' : 'Enable relay'}
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {status.relay_enabled
              ? 'Stop forwarding incoming messages to Claude.'
              : 'Start forwarding incoming messages to Claude.'}
          </div>
        </button>

        <button
          onClick={resetSession}
          disabled={busy === 'session'}
          className="p-4 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-left transition-colors disabled:opacity-50"
        >
          <div className="font-medium text-sm">Reset Claude session</div>
          <div className="text-xs text-zinc-400 mt-1">
            Next message starts a fresh conversation.
          </div>
        </button>

        <button
          onClick={resetAll}
          disabled={busy === 'reset'}
          className="p-4 rounded-lg border border-red-900/60 bg-red-950/20 hover:bg-red-950/40 text-left transition-colors disabled:opacity-50"
        >
          <div className="font-medium text-sm text-red-200">Reset everything</div>
          <div className="text-xs text-red-300/70 mt-1">
            Clear bot token, chat link, and session.
          </div>
        </button>
      </section>

      <section>
        <h2 className="font-medium mb-3 text-sm uppercase tracking-wide text-zinc-400">
          Recent messages
        </h2>
        {messages.length === 0 ? (
          <p className="text-zinc-500 text-sm">No messages yet.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={[
                  'rounded border px-3 py-2 text-sm',
                  m.direction === 'in'
                    ? 'border-zinc-800 bg-zinc-900/40'
                    : m.ok
                      ? 'border-blue-900/40 bg-blue-950/20'
                      : 'border-red-900/40 bg-red-950/20',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">
                    {m.direction === 'in' ? '→ Telegram' : '← Claude'}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-200">
                  {m.error ? (
                    <span className="text-red-300">{m.error}</span>
                  ) : (
                    truncate(m.text, 600)
                  )}
                </div>
                {m.session_id && (
                  <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                    session {m.session_id.slice(0, 8)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `… (+${s.length - n} chars)`;
}
