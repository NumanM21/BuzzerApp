import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { problem } from '@/test/factories';
import { FakeGameEvents } from '@/test/fakes/FakeGameEvents';
import { flushPromises } from '@/test/flushPromises';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { createAppServices } from './AppServices';

// The composition root against the fake network: what only the wiring in `createAppServices` can get wrong.
function create() {
  const events = new FakeGameEvents();
  const services = createAppServices({ fetchFunction: (input, init) => fetch(input, init), events });
  return { services, events };
}

describe('createAppServices', () => {
  it('loads the event and the session through the real API classes', async () => {
    const { services } = create();

    await Promise.all([services.event.load(), services.session.restore()]);

    expect(services.event.event).toMatchObject({ themeKey: 'default' });
    expect(services.session.status).toBe('signedIn');
  });

  it('signs the player out when a call that needs a session gets a 401', async () => {
    const { services } = create();
    await services.session.restore();
    server.use(http.get('/api/teams', () => problemResponse(401, problem(401))));

    await services.teams.teams.load();

    expect(services.session.status).toBe('anonymous');
  });

  it('keeps the player signed in when a sign-in attempt gets a 401 (wrong name or PIN)', async () => {
    const { services } = create();
    await services.session.restore();
    server.use(http.post('/api/session/signin', () => problemResponse(401, problem(401, { detail: 'Real name or PIN is incorrect.' }))));

    await expect(services.session.signIn({ joinCode: 'AB12', realName: 'x', pin: '0000' })).rejects.toMatchObject({
      kind: 'unauthorized',
    });

    expect(services.session.status).toBe('signedIn');
  });

  it('reloads what is loaded when the hub says something changed', async () => {
    const { services, events } = create();
    let reads = 0;
    server.use(
      http.get('/api/scores/teams', () => {
        reads += 1;
        return Response.json([]);
      }),
    );
    await services.session.restore();
    await services.scores.teamScores.ensureLoaded();

    events.emitScoresChanged();
    await flushPromises();
    await services.scores.teamScores.ensureLoaded();

    expect(reads).toBe(2);
  });
});
