import { createServer, Server, ServerResponse } from 'node:http';
import { GitHubClient } from '../src/integrations/github/github-client';

const DEADLINE_MS = 100;
const OBSERVATION_MS = 500;
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function client(baseUrl: string, maxRetries = 0) {
  return new GitHubClient({
    baseUrl,
    auth: {
      type: 'token',
      config: { token: 'loopback-only-test-token', scopes: ['repo'] }
    },
    timeout: DEADLINE_MS,
    retry: { maxRetries, baseDelay: 1, maxDelay: 1 },
    logging: { logRequests: false, logResponses: false, logErrors: false }
  });
}

async function listen(handler: (response: ServerResponse) => void) {
  const server = createServer((_request, response) => handler(response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing loopback port');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  server.closeAllConnections();
  if (server.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
}

async function stalledBody(status: number) {
  const { server, url } = await listen((response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.flushHeaders();
    response.write('{"incomplete":');
  });
  let observer: ReturnType<typeof setTimeout> | undefined;
  const request = client(url)
    .listRepositories()
    .then(
      () => ({ kind: 'resolved', name: '' }),
      (error: Error) => ({ kind: 'rejected', name: error.name })
    );
  try {
    const outcome = await Promise.race([
      request,
      new Promise<{ kind: string; name: string }>((resolve) => {
        observer = setTimeout(
          () => resolve({ kind: 'stalled', name: '' }),
          OBSERVATION_MS
        );
      })
    ]);
    expect(outcome.kind).toBe('rejected');
    expect(outcome.name).toBe('AbortError');
  } finally {
    if (observer) clearTimeout(observer);
    await close(server);
    await request;
  }
}

describe('Real GitHub HTTP deadline contract', () => {
  test('regression: response JSON cannot override transport status or fallback message', async () => {
    const { server, url } = await listen(response => {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end('{"message":"","status":200}');
    });
    try {
      await expect(client(url).listRepositories()).rejects.toThrow('GitHub API error (403): Forbidden');
    } finally { await close(server); }
  });
  test('holdout: stalled successful JSON body is bounded', async () =>
    stalledBody(200));
  test('holdout: stalled error JSON body is bounded', async () =>
    stalledBody(503));

  test('holdout: successful requests clear their abort timer', async () => {
    const original = global.AbortController;
    const controllers: AbortController[] = [];
    global.AbortController = class extends original {
      constructor() {
        super();
        controllers.push(this);
      }
    };
    const { server, url } = await listen((response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
    });
    try {
      await client(url).listRepositories();
      await pause(DEADLINE_MS + 50);
      expect(controllers[0].signal.aborted).toBe(false);
    } finally {
      global.AbortController = original;
      await close(server);
    }
  });

  test('holdout: rejected fetch clears its abort timer', async () => {
    const { server, url } = await listen((response) => response.end('[]'));
    await close(server);
    const original = global.AbortController;
    const controllers: AbortController[] = [];
    global.AbortController = class extends original {
      constructor() {
        super();
        controllers.push(this);
      }
    };
    try {
      await expect(client(url).listRepositories()).rejects.toThrow();
      await pause(DEADLINE_MS + 50);
      expect(controllers[0].signal.aborted).toBe(false);
    } finally {
      global.AbortController = original;
    }
  });

  test('anchor: successful JSON responses preserve status and data', async () => {
    const { server, url } = await listen((response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[{"id":7,"name":"example"}]');
    });
    try {
      const result = await client(url).listRepositories();
      expect(result.status).toBe(200);
      expect(result.data).toEqual([{ id: 7, name: 'example' }]);
    } finally {
      await close(server);
    }
  });

  test('anchor: API errors preserve status and redact authentication', async () => {
    const { server, url } = await listen((response) => {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end('{"message":"Forbidden"}');
    });
    try {
      await expect(client(url).listRepositories()).rejects.toThrow(
        'GitHub API error (403): Forbidden'
      );
    } finally {
      await close(server);
    }
  });

  test('anchor: server errors retain bounded retry behavior', async () => {
    let calls = 0;
    const { server, url } = await listen((response) => {
      calls += 1;
      response.writeHead(calls === 1 ? 503 : 200, {
        'content-type': 'application/json'
      });
      response.end(calls === 1 ? '{"message":"Retry"}' : '[]');
    });
    try {
      const result = await client(url, 1).listRepositories();
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    } finally {
      await close(server);
    }
  });
});
