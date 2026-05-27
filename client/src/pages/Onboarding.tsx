import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, type ClaudeCheck, type Status, type BotInfo } from '../api';

type Props = { status: Status; onChange: () => void };

export function Onboarding({ status, onChange }: Props) {
  const [, setLocation] = useLocation();

  const [claudeCheck, setClaudeCheck] = useState<ClaudeCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const [token, setToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [bot, setBot] = useState<BotInfo | null>(status.bot);

  const [capturing, setCapturing] = useState(false);
  const [capturedId, setCapturedId] = useState<string | null>(status.chat_id);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Decide which step to land on.
  const claudeOk = claudeCheck?.installed === true;
  const step =
    !claudeOk ? 1 : !status.bot_token_set || !bot ? 2 : !capturedId ? 3 : 4;

  const runClaudeCheck = async () => {
    setChecking(true);
    try {
      const r = await api.claudeCheck();
      setClaudeCheck(r);
    } catch (e) {
      setClaudeCheck({
        installed: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runClaudeCheck();
  }, []);

  const saveToken = async () => {
    setTokenError(null);
    setSavingToken(true);
    try {
      const r = await api.saveToken(token.trim());
      setBot(r.bot);
      setCapturedId(null);
      onChange();
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingToken(false);
    }
  };

  const startCapture = async () => {
    setCaptureError(null);
    try {
      await api.startCapture();
      setCapturing(true);
    } catch (e) {
      setCaptureError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelCapture = async () => {
    try {
      await api.cancelCapture();
    } catch {
      // ignore
    }
    setCapturing(false);
  };

  useEffect(() => {
    if (!capturing) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await api.captured();
        if (r.chat_id) {
          setCapturedId(r.chat_id);
          setCapturing(false);
          onChange();
          return;
        }
      } catch {
        // keep polling
      }
      if (!stopped) {
        pollRef.current = window.setTimeout(tick, 1500);
      }
    };
    tick();
    return () => {
      stopped = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [capturing]);

  const finish = async () => {
    try {
      await api.setRelay(true);
    } catch {
      // dashboard will surface relay state
    }
    onChange();
    setLocation('/');
  };

  return (
    <div className="min-h-full max-w-2xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold">Welcome to claude-code-telegram</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Relay messages from a Telegram bot to Claude Code running on this machine.
        </p>
      </header>

      <ol className="space-y-6">
        <StepCard
          n={1}
          title="Check Claude Code is installed"
          active={step === 1}
          done={claudeOk}
        >
          {checking ? (
            <p className="text-zinc-400 text-sm">Checking…</p>
          ) : claudeOk ? (
            <div className="text-sm space-y-1">
              <p className="text-emerald-400">Found Claude Code.</p>
              {claudeCheck?.version && (
                <p className="text-zinc-400">
                  Version: <code className="text-zinc-200">{claudeCheck.version}</code>
                </p>
              )}
              {claudeCheck?.path && (
                <p className="text-zinc-400">
                  Path: <code className="text-zinc-200">{claudeCheck.path}</code>
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm space-y-3">
              <p className="text-red-400">
                The <code>claude</code> CLI was not found on PATH.
              </p>
              {claudeCheck?.error && (
                <pre className="bg-zinc-900 text-zinc-400 text-xs p-3 rounded overflow-auto whitespace-pre-wrap">
                  {claudeCheck.error}
                </pre>
              )}
              <p className="text-zinc-400">
                Install it from{' '}
                <a
                  className="underline text-zinc-200"
                  href="https://docs.claude.com/en/docs/claude-code/overview"
                  target="_blank"
                  rel="noreferrer"
                >
                  the Claude Code docs
                </a>
                , then re-check.
              </p>
              <button
                onClick={runClaudeCheck}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
              >
                Re-check
              </button>
            </div>
          )}
        </StepCard>

        <StepCard
          n={2}
          title="Paste your Telegram bot token"
          active={step === 2}
          done={Boolean(bot)}
          disabled={step < 2}
        >
          <p className="text-zinc-400 text-sm mb-3">
            Create a bot with{' '}
            <a
              className="underline text-zinc-200"
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
            >
              @BotFather
            </a>{' '}
            and paste the token below.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm font-mono"
              placeholder="123456789:ABCdefGhIJK..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={step < 2 || savingToken}
            />
            <button
              onClick={saveToken}
              disabled={step < 2 || !token.trim() || savingToken}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
            >
              {savingToken ? 'Saving…' : 'Save'}
            </button>
          </div>
          {tokenError && (
            <p className="text-red-400 text-sm mt-2">{tokenError}</p>
          )}
          {bot && (
            <p className="text-emerald-400 text-sm mt-3">
              Connected to <span className="font-mono">@{bot.username}</span>
            </p>
          )}
        </StepCard>

        <StepCard
          n={3}
          title="Send a message to your bot"
          active={step === 3}
          done={Boolean(capturedId)}
          disabled={step < 3}
        >
          {capturedId ? (
            <div className="text-sm space-y-1">
              <p className="text-emerald-400">Chat linked.</p>
              <p className="text-zinc-400">
                Chat ID: <code className="text-zinc-200">{capturedId}</code>
              </p>
            </div>
          ) : capturing ? (
            <div className="text-sm space-y-3">
              <p className="text-zinc-300">
                Open Telegram and send <span className="font-mono">/start</span>{' '}
                {bot ? (
                  <>
                    to{' '}
                    <a
                      className="underline text-zinc-100"
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{bot.username}
                    </a>
                    .
                  </>
                ) : (
                  'to your bot.'
                )}
              </p>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 text-zinc-400 text-sm">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  Waiting for a message…
                </span>
                <button
                  onClick={cancelCapture}
                  className="text-zinc-400 hover:text-zinc-200 text-sm underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-3">
              <p className="text-zinc-400">
                We'll capture your chat ID from the first message you send the bot.
              </p>
              <button
                onClick={startCapture}
                disabled={step < 3}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
              >
                Start listening
              </button>
            </div>
          )}
          {captureError && (
            <p className="text-red-400 text-sm mt-2">{captureError}</p>
          )}
        </StepCard>
      </ol>

      {step === 4 && (
        <div className="mt-8 p-6 bg-emerald-950/30 border border-emerald-900/60 rounded-lg flex items-center justify-between">
          <div>
            <h3 className="font-medium text-emerald-200">All set</h3>
            <p className="text-sm text-emerald-300/80 mt-0.5">
              Enable the relay and head to the dashboard.
            </p>
          </div>
          <button
            onClick={finish}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium"
          >
            Enable & continue
          </button>
        </div>
      )}
    </div>
  );
}

function StepCard({
  n,
  title,
  active,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  active?: boolean;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={[
        'rounded-lg border p-5 transition-colors',
        active
          ? 'border-blue-600/60 bg-blue-950/20'
          : done
            ? 'border-emerald-900/60 bg-emerald-950/10'
            : 'border-zinc-800 bg-zinc-900/30',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
            done
              ? 'bg-emerald-600 text-white'
              : active
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400',
          ].join(' ')}
        >
          {done ? '✓' : n}
        </div>
        <h2 className="font-medium pt-0.5">{title}</h2>
      </div>
      <div className="pl-10">{children}</div>
    </li>
  );
}
