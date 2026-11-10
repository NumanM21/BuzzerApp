import { describe, expect, it } from 'vitest';
import { problem } from '@/test/factories';
import { ApiError, type ApiErrorKind } from './ApiError';

const fromBody = (status: number, body: unknown, retryAfter: string | null = null) =>
  ApiError.fromResponse(status, JSON.stringify(body), retryAfter);

describe('ApiError.fromResponse', () => {
  it.each<[number, ApiErrorKind]>([
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [429, 'rateLimited'],
    [405, 'server'],
    [415, 'server'],
    [500, 'server'],
    [503, 'server'],
  ])('maps status %i to kind %s', (status, kind) => {
    const error = fromBody(status, problem(status));

    expect(error.status).toBe(status);
    expect(error.kind).toBe(kind);
  });

  it('is an Error, so Loadable and Command can hold it', () => {
    const error = fromBody(409, problem(409));

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });

  it('shows the detail to the person, as the server wrote it', () => {
    const error = fromBody(409, problem(409, { title: 'Conflict', detail: 'That name is taken. Sign in instead.' }));

    expect(error.message).toBe('That name is taken. Sign in instead.');
    expect(error.title).toBe('Conflict');
    expect(error.detail).toBe('That name is taken. Sign in instead.');
  });

  it('falls back to the title when there is no detail', () => {
    const error = fromBody(404, { title: 'Not Found', status: 404 });

    expect(error.message).toBe('Not Found');
    expect(error.detail).toBeUndefined();
  });

  it('falls back to a generic sentence when there is neither, for every kind', () => {
    const kinds: [number, ApiErrorKind][] = [
      [400, 'validation'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'notFound'],
      [409, 'conflict'],
      [429, 'rateLimited'],
      [500, 'server'],
    ];
    for (const [status, kind] of kinds) {
      const error = ApiError.fromResponse(status, '', null);

      expect(error.kind).toBe(kind);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('collects field errors by the request field name', () => {
    const error = fromBody(
      400,
      problem(400, { errors: { displayName: ['Too short.', 'Not allowed.'], pin: ['Must be 4 digits.'] } }),
    );

    expect(error.fieldErrors).toEqual({ displayName: ['Too short.', 'Not allowed.'], pin: ['Must be 4 digits.'] });
  });

  it('has empty field errors when the body has none', () => {
    expect(fromBody(404, problem(404)).fieldErrors).toEqual({});
  });

  it('survives a body that is not ProblemDetails', () => {
    const html = ApiError.fromResponse(502, '<html>Bad gateway</html>', null);
    const array = fromBody(500, ['x']);
    const wrongTypes = fromBody(400, { title: 5, detail: {}, errors: { name: 'not a list', other: [1, 'ok'] } });

    expect(html.kind).toBe('server');
    expect(html.message.length).toBeGreaterThan(0);
    expect(array.message.length).toBeGreaterThan(0);
    expect(wrongTypes.fieldErrors).toEqual({ other: ['ok'] });
    expect(wrongTypes.title).toBeUndefined();
  });

  it('ignores a blank detail', () => {
    expect(fromBody(404, { title: 'Not Found', detail: '   ' }).message).toBe('Not Found');
  });

  it('reads Retry-After in whole seconds', () => {
    expect(fromBody(429, problem(429), '30').retryAfterSeconds).toBe(30);
    expect(fromBody(429, problem(429), null).retryAfterSeconds).toBeUndefined();
    expect(fromBody(429, problem(429), 'soon').retryAfterSeconds).toBeUndefined();
  });
});

describe('ApiError.network', () => {
  it('has no status and a sentence about the connection', () => {
    const error = ApiError.network();

    expect(error.kind).toBe('network');
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/connection/i);
  });
});
