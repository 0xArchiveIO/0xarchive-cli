// Network and host reads for `oxa bench`, kept apart so tests can replace them.

import { execFile } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { Socket } from 'node:net';
import { chronyBoundMs, timesyncdBoundMs } from './bench.js';

/** How a WebSocket upgrade was answered: 101 when it opened, else the refusal's status and body. */
export interface UpgradeAnswer {
  /** 101 when it would open, 401 or 403 when the key or plan is refused, 429 at the connection limit, null when unreachable. */
  status: number | null;
  /** The refusal's body (plain text or a JSON error envelope), at most 4 KB. */
  body: string;
}

const BODY_MAX = 4096;

/**
 * Open one WebSocket upgrade to `url` and report how it was answered. An
 * opened upgrade is handed to `hold` (the caller closes it); without `hold` it
 * is closed at once. Node's built-in WebSocket hides the status of a refused
 * upgrade, so a bad key or a full connection limit would otherwise look like
 * a feed that never connects.
 */
function upgrade(url: string, timeoutMs: number, hold?: (socket: Socket) => void): Promise<UpgradeAnswer> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(url.replace(/^ws/, 'http'));
    } catch {
      resolve({ status: null, body: '' });
      return;
    }
    let settled = false;
    const done = (answer: UpgradeAnswer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'b3hhLWJlbmNoLXByb2JlIQ==',
      },
      timeout: timeoutMs,
    });
    request.on('upgrade', (response, socket) => {
      if (hold) {
        socket.setTimeout(0);
        hold(socket);
      } else socket.destroy();
      done({ status: response.statusCode ?? 101, body: '' });
    });
    request.on('response', (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        if (body.length < BODY_MAX) body += chunk;
      });
      const finish = () => {
        request.destroy();
        done({ status: response.statusCode ?? null, body: body.slice(0, BODY_MAX) });
      };
      response.on('end', finish);
      response.on('error', finish);
    });
    request.on('timeout', () => {
      request.destroy();
      done({ status: null, body: '' });
    });
    request.on('error', () => done({ status: null, body: '' }));
    request.end();
  });
}

/**
 * Open `count` WebSocket upgrades to `url` one after another, keeping each
 * open until the last is answered, then close them all. Resolves with every
 * answer up to and including the first refusal, so a plan or account that
 * cannot hold `count` connections at once is found before the race starts.
 */
export async function probeConnections(url: string, count: number, timeoutMs = 10_000): Promise<UpgradeAnswer[]> {
  const held: Socket[] = [];
  const answers: UpgradeAnswer[] = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const answer = await upgrade(url, timeoutMs, (socket) => held.push(socket));
      answers.push(answer);
      if (answer.status !== 101) break;
    }
  } finally {
    for (const socket of held) socket.destroy();
  }
  return answers;
}

function runQuiet(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout: 3000 }, (error, stdout) => resolve(error ? null : String(stdout)));
    } catch {
      resolve(null);
    }
  });
}

/** This machine's clock error bound from chrony, else systemd-timesyncd. */
export interface ClockBound {
  bound_ms: number | null;
  source: string | null;
}

export async function readClockBound(): Promise<ClockBound> {
  const chrony = await runQuiet('chronyc', ['-c', 'tracking']);
  if (chrony !== null) {
    const bound = chronyBoundMs(chrony);
    if (bound !== null) return { bound_ms: bound, source: 'chrony' };
  }
  const timesyncd = await runQuiet('timedatectl', ['timesync-status']);
  if (timesyncd !== null) {
    const bound = timesyncdBoundMs(timesyncd);
    if (bound !== null) return { bound_ms: bound, source: 'systemd-timesyncd' };
  }
  return { bound_ms: null, source: null };
}
