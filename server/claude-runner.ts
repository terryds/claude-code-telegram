export type ClaudeResult =
  | { ok: true; text: string; session_id: string | null }
  | { ok: false; error: string };

export async function runClaudeHeadless(
  prompt: string,
  sessionId: string | null
): Promise<ClaudeResult> {
  const args = [
    '-p',
    prompt,
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    'json',
  ];
  if (sessionId) args.push('--resume', sessionId);

  let proc;
  try {
    proc = Bun.spawn(['claude', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to spawn claude CLI: ${err instanceof Error ? err.message : String(err)}. Is it installed and on PATH?`,
    };
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return {
      ok: false,
      error: `claude exited with code ${exitCode}: ${stderr.trim() || stdout.trim() || 'no output'}`,
    };
  }

  try {
    const parsed = JSON.parse(stdout) as {
      result?: string;
      session_id?: string;
      is_error?: boolean;
    };
    if (parsed.is_error) {
      return { ok: false, error: parsed.result || 'claude reported an error' };
    }
    return {
      ok: true,
      text: (parsed.result ?? '').trim(),
      session_id: parsed.session_id ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse claude JSON output: ${err instanceof Error ? err.message : String(err)}. Raw: ${stdout.slice(0, 300)}`,
    };
  }
}

export type ClaudeCheck = {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
};

export async function checkClaudeInstalled(): Promise<ClaudeCheck> {
  let versionProc;
  try {
    versionProc = Bun.spawn(['claude', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    return {
      installed: false,
      error: `Could not spawn claude: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const [vOut, vErr, vCode] = await Promise.all([
    new Response(versionProc.stdout).text(),
    new Response(versionProc.stderr).text(),
    versionProc.exited,
  ]);

  if (vCode !== 0) {
    return {
      installed: false,
      error: vErr.trim() || vOut.trim() || `claude --version exited ${vCode}`,
    };
  }

  let pathStr: string | undefined;
  try {
    const which = Bun.spawn(['which', 'claude'], { stdout: 'pipe', stderr: 'pipe' });
    const [out, , code] = await Promise.all([
      new Response(which.stdout).text(),
      new Response(which.stderr).text(),
      which.exited,
    ]);
    if (code === 0) pathStr = out.trim() || undefined;
  } catch {
    // best-effort
  }

  return {
    installed: true,
    version: vOut.trim() || vErr.trim(),
    path: pathStr,
  };
}
