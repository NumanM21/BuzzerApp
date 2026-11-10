import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { problem } from '@/test/factories';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { ApiClient } from './ApiClient';
import { ApiError } from './ApiError';

// These run the real `fetch` against MSW, so what is checked is what goes over the wire.
function createClient() {
  const onSessionExpired = vi.fn();
  const client = new ApiClient((input, init) => fetch(input, init), onSessionExpired);
  return { client, onSessionExpired };
}

async function failureOf(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('ApiClient', () => {
  it('reads JSON from a GET and asks for JSON', async () => {
    let accept: string | null = null;
    server.use(
      http.get('/api/thing', ({ request }) => {
        accept = request.headers.get('Accept');
        return HttpResponse.json({ id: 7, name: 'Seven' });
      }),
    );
    const { client } = createClient();

    expect(await client.get('/api/thing')).toEqual({ id: 7, name: 'Seven' });
    expect(accept).toBe('application/json');
  });

  it('sends a JSON body with its content type, and reads the 201 reply', async () => {
    let received: { contentType: string | null; body: unknown } | undefined;
    server.use(
      http.post('/api/thing', async ({ request }) => {
        received = { contentType: request.headers.get('Content-Type'), body: await request.json() };
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    const { client } = createClient();

    expect(await client.post('/api/thing', { name: 'Seven', count: 3 })).toEqual({ id: 1 });
    expect(received).toEqual({ contentType: 'application/json', body: { name: 'Seven', count: 3 } });
  });

  it('sends no body and no content type when there is none', async () => {
    let contentType: string | null = 'unset';
    server.use(
      http.post('/api/thing', ({ request }) => {
        contentType = request.headers.get('Content-Type');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { client } = createClient();

    await client.post('/api/thing');

    expect(contentType).toBeNull();
  });

  it('uses PATCH and DELETE', async () => {
    const seen: string[] = [];
    server.use(
      http.patch('/api/thing/1', () => {
        seen.push('patch');
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/thing/1', () => {
        seen.push('delete');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { client } = createClient();

    expect(await client.patch('/api/thing/1', { name: 'x' })).toEqual({ ok: true });
    await client.delete('/api/thing/1');

    expect(seen).toEqual(['patch', 'delete']);
  });

  it('turns a 204 into undefined', async () => {
    server.use(http.delete('/api/thing/1', () => new HttpResponse(null, { status: 204 })));
    const { client } = createClient();

    expect(await client.delete('/api/thing/1')).toBeUndefined();
  });

  it('puts the query in the URL, encoded, and leaves out undefined values', async () => {
    let search = '';
    server.use(
      http.get('/api/thing', ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );
    const { client } = createClient();

    await client.get('/api/thing', { query: { code: 'A B&C', take: 5, skipped: undefined } });

    expect(search).toBe('?code=A+B%26C&take=5');
  });

  it('asks the browser to send the same-origin session cookie', async () => {
    let credentials: RequestCredentials | undefined;
    const client = new ApiClient((input, init) => {
      credentials = init?.credentials;
      return fetch(input, init);
    }, vi.fn());
    server.use(http.get('/api/thing', () => HttpResponse.json({})));

    await client.get('/api/thing');

    expect(credentials).toBe('same-origin');
  });

  describe('failures', () => {
    it('parses ProblemDetails with field errors', async () => {
      server.use(
        http.post('/api/thing', () =>
          problemResponse(400, problem(400, { title: 'Validation failed', errors: { displayName: ['Too short.'] } })),
        ),
      );
      const { client } = createClient();

      const error = await failureOf(client.post('/api/thing', {}));

      expect(error.kind).toBe('validation');
      expect(error.status).toBe(400);
      expect(error.fieldErrors).toEqual({ displayName: ['Too short.'] });
      expect(error.message).toBe('Validation failed');
    });

    it('parses ProblemDetails without field errors and shows its detail', async () => {
      server.use(
        http.post('/api/thing', () =>
          problemResponse(409, problem(409, { title: 'Conflict', detail: 'That name is taken.' })),
        ),
      );
      const { client } = createClient();

      const error = await failureOf(client.post('/api/thing', {}));

      expect(error.kind).toBe('conflict');
      expect(error.fieldErrors).toEqual({});
      expect(error.message).toBe('That name is taken.');
    });

    it('survives an error with no ProblemDetails body', async () => {
      server.use(http.get('/api/thing', () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })));
      const { client } = createClient();

      const error = await failureOf(client.get('/api/thing'));

      expect(error.kind).toBe('server');
      expect(error.status).toBe(502);
      expect(error.message.length).toBeGreaterThan(0);
    });

    it('reads Retry-After from a 429', async () => {
      server.use(
        http.post('/api/thing', () =>
          problemResponse(429, problem(429, { detail: 'Too many attempts.' }), { 'Retry-After': '42' }),
        ),
      );
      const { client } = createClient();

      const error = await failureOf(client.post('/api/thing', {}));

      expect(error.kind).toBe('rateLimited');
      expect(error.retryAfterSeconds).toBe(42);
    });

    it('reports a network failure as kind network', async () => {
      server.use(http.get('/api/thing', () => HttpResponse.error()));
      const { client, onSessionExpired } = createClient();

      const error = await failureOf(client.get('/api/thing'));

      expect(error.kind).toBe('network');
      expect(error.status).toBe(0);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('reports a success whose body is not JSON as a server problem', async () => {
      server.use(http.get('/api/thing', () => new HttpResponse('not json', { status: 200 })));
      const { client } = createClient();

      const error = await failureOf(client.get('/api/thing'));

      expect(error.kind).toBe('server');
    });
  });

  describe('the 401 rule', () => {
    it('on a call that needs a session, reports the session as ended and still throws', async () => {
      server.use(http.get('/api/thing', () => problemResponse(401, problem(401))));
      const { client, onSessionExpired } = createClient();

      const error = await failureOf(client.get('/api/thing'));

      expect(error.kind).toBe('unauthorized');
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    it('on an anonymous call (sign in: wrong name or PIN), only throws', async () => {
      server.use(
        http.post('/api/thing', () =>
          problemResponse(401, problem(401, { detail: 'Real name or PIN is incorrect.' })),
        ),
      );
      const { client, onSessionExpired } = createClient();

      const error = await failureOf(client.post('/api/thing', {}, { anonymous: true }));

      expect(error.kind).toBe('unauthorized');
      expect(error.message).toBe('Real name or PIN is incorrect.');
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('is not triggered by other statuses', async () => {
      server.use(http.get('/api/thing', () => problemResponse(403, problem(403))));
      const { client, onSessionExpired } = createClient();

      await failureOf(client.get('/api/thing'));

      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('returns the file and the name the server gave it', async () => {
      server.use(
        http.get(
          '/api/file',
          () =>
            new HttpResponse('{"a":1}', {
              headers: { 'Content-Disposition': 'attachment; filename="buzzer-archive-2030.json"' },
            }),
        ),
      );
      const { client } = createClient();

      const file = await client.download('/api/file');

      expect(file.fileName).toBe('buzzer-archive-2030.json');
      expect(await file.blob.text()).toBe('{"a":1}');
    });

    it('has no file name when the server sends none', async () => {
      server.use(http.get('/api/file', () => new HttpResponse('x')));
      const { client } = createClient();

      expect((await client.download('/api/file')).fileName).toBeUndefined();
    });

    it('throws an ApiError on failure, like every other call', async () => {
      server.use(http.get('/api/file', () => problemResponse(404, problem(404))));
      const { client } = createClient();

      const error = await failureOf(client.download('/api/file'));

      expect(error.kind).toBe('notFound');
    });
  });
});
