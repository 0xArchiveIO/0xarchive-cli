// Shared test helpers: capture stdout/stderr, turn process.exit into a
// throwable, and run the real command tree on an argument vector.
import { vi } from 'vitest';

export class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

/**
 * Spy on stdout/stderr. A non-zero process.exit throws ProcessExit so the
 * command stops where it failed; exit(0) is recorded and returns, because
 * commands exit with 0 inside the same try block that maps SDK errors.
 */
export function captureIo(): void {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    if ((code ?? 0) === 0) return undefined as never;
    throw new ProcessExit(code ?? 0);
  }) as never);
}

export function stdoutText(): string {
  return vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .join('');
}

export function stdoutJson(): any {
  return JSON.parse(stdoutText());
}

export function stderrText(): string {
  return vi
    .mocked(process.stderr.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .join('');
}

/** The last structured error written to stderr. */
export function lastError(): { error: string; code: number; type: string } {
  const calls = vi.mocked(process.stderr.write).mock.calls;
  return JSON.parse(String(calls.at(-1)?.[0]));
}

/**
 * Parse `args` with a fresh copy of the command tree (commander keeps option
 * values between parses, so every run imports it anew) and return the exit
 * code the command finished with.
 */
export async function runCli(...args: string[]): Promise<number> {
  vi.resetModules();
  const { program } = await import('../src/cli.js');
  const exits = vi.mocked(process.exit).mock.calls.length;
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (error instanceof ProcessExit) return error.code;
    throw error;
  }
  const codes = vi.mocked(process.exit).mock.calls.slice(exits).map(([code]) => code ?? 0);
  if (codes.length === 0) throw new Error(`oxa ${args.join(' ')} returned without exiting`);
  return Number(codes[0]);
}

/**
 * Parse `args` with a fresh command tree and return the parse promise, for
 * commands that keep running after their action returns (WebSocket streams).
 */
export async function parseCli(...args: string[]): Promise<void> {
  vi.resetModules();
  const { program } = await import('../src/cli.js');
  await program.parseAsync(args, { from: 'user' });
}
