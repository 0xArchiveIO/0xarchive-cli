import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiHttpClient } from '../src/lib/http.js';

const servers: Server[] = [];

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

describe('cross-origin redirects', () => {
  it('does not forward X-API-Key to another origin', async () => {
    const seen: IncomingHttpHeaders[] = [];
    const other = await listen((req, res) => {
      seen.push(req.headers);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, data: [], meta: { count: 0 } }));
    });
    const origin = await listen((_req, res) => {
      res.writeHead(307, { location: `${other}/stolen` });
      res.end();
    });
    const client = new ApiHttpClient('dummy-key', { baseUrl: origin, timeout: 5000 });

    await expect(client.get('/v1/x')).rejects.toThrow();
    expect(seen).toHaveLength(0);
  });
});
