// `oxa bench`'s connection check against a local server that, like Stream,
// answers a WebSocket upgrade with 101 or refuses it with a status and a body.
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { probeConnections } from '../src/lib/bench-net.js';

let server: Server | undefined;

/** A server that holds at most `limit` upgraded connections at once. */
async function stream(limit: number): Promise<{ url: string; open: Set<Socket>; seen: string[] }> {
  const open = new Set<Socket>();
  const seen: string[] = [];
  server = createServer((req, res) => {
    res.writeHead(400).end('not an upgrade');
  });
  server.on('upgrade', (req, socket: Socket) => {
    seen.push(req.url ?? '');
    if (new URL(req.url ?? '/', 'http://x').searchParams.get('apiKey') !== 'good') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 15\r\n\r\nInvalid API key');
      return;
    }
    if (open.size >= limit) {
      const body = `Connection limit reached (${open.size}/${limit}). Upgrade your plan for more connections.`;
      socket.end(`HTTP/1.1 429 Too Many Requests\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
      return;
    }
    open.add(socket);
    // The client closing its side ends the session, as on Stream.
    socket.on('end', () => socket.destroy());
    socket.on('close', () => open.delete(socket));
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`, open, seen };
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
};

describe('probeConnections', () => {
  it('holds each connection open until the last is answered, then closes them all', async () => {
    const s = await stream(2);
    const answers = await probeConnections(`${s.url}?apiKey=good`, 2);
    expect(answers.map((a) => a.status)).toEqual([101, 101]);
    await waitFor(() => s.open.size === 0);
    expect(s.open.size).toBe(0);
  });

  it('reports the refusal of the connection over the limit, with its body', async () => {
    const s = await stream(1);
    const answers = await probeConnections(`${s.url}?apiKey=good`, 2);
    expect(answers).toEqual([
      { status: 101, body: '' },
      { status: 429, body: 'Connection limit reached (1/1). Upgrade your plan for more connections.' },
    ]);
    await waitFor(() => s.open.size === 0);
    expect(s.open.size).toBe(0);
  });

  it('stops at a refused key', async () => {
    const s = await stream(2);
    expect(await probeConnections(`${s.url}?apiKey=bad`, 2)).toEqual([{ status: 401, body: 'Invalid API key' }]);
    expect(s.seen).toHaveLength(1);
  });

  it('reports an unreachable server as null', async () => {
    const s = await stream(1);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect(await probeConnections(s.url, 1, 2000)).toEqual([{ status: null, body: '' }]);
  });
});
