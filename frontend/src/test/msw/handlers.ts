import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AdjustmentRequest, ProblemDetails } from '@/api/types';
import {
  makeAdjustments,
  makeEventInfo,
  makeFinalizeResponse,
  makeJoinTeams,
  makeMe,
  makePlayer,
  makePlayers,
  makePlayerScores,
  makeTeams,
  makeTeamScores,
} from '@/test/factories';

/** A failed call as the server sends it: ProblemDetails with its own content type. */
export function problemResponse(status: number, body: ProblemDetails, headers?: Record<string, string>): Response {
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
}

/**
 * The server's happy path for every route, with answers built from the factories. A test overrides one with
 * `server.use(http.get('/api/teams', ...))`. The bodies match Appendix A, so a change to the wire format shows up
 * where these are used. The URLs are relative, like the app's own calls.
 */
export const defaultHandlers: HttpHandler[] = [
  http.get('/api/event', () => HttpResponse.json(makeEventInfo())),
  http.get('/api/event/teams', () => HttpResponse.json(makeJoinTeams(3, 2))),

  http.post('/api/session/register', () => HttpResponse.json(makeMe(), { status: 201 })),
  http.post('/api/session/signin', () => HttpResponse.json(makeMe())),
  http.post('/api/session/signout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/session/me', () => HttpResponse.json(makeMe())),

  http.get('/api/teams', () => HttpResponse.json(makeTeams(3, { membersPerTeam: 2 }))),
  http.post('/api/teams', async ({ request }) => {
    const { name, colorKey, iconKey } = (await request.json()) as { name: string; colorKey: string; iconKey: string };
    return HttpResponse.json({ id: 4, name, colorKey, iconKey, sortOrder: 4 }, { status: 201 });
  }),
  http.patch('/api/teams/:id', async ({ request, params }) => {
    const { name } = (await request.json()) as { name: string };
    return HttpResponse.json({ ...makeTeams(1)[0], id: Number(params.id), name });
  }),
  http.delete('/api/teams/:id', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/players', () => HttpResponse.json(makePlayers(6, 3))),
  http.patch('/api/players/me', () => HttpResponse.json(makePlayer())),
  http.patch('/api/players/:id/team', ({ params }) => HttpResponse.json(makePlayer({ id: Number(params.id) }))),
  http.patch('/api/players/:id', ({ params }) => HttpResponse.json(makePlayer({ id: Number(params.id) }))),
  http.post('/api/players/:id/promote', ({ params }) =>
    HttpResponse.json(makePlayer({ id: Number(params.id), role: 'admin', teamId: null, teamName: null })),
  ),

  http.get('/api/scores/teams', () => HttpResponse.json(makeTeamScores(3))),
  http.get('/api/scores/players', () => HttpResponse.json(makePlayerScores(6, 3))),
  http.get('/api/scores/adjustments', () => HttpResponse.json(makeAdjustments(3))),
  http.post('/api/scores/adjustments', async ({ request }) => {
    const body = (await request.json()) as AdjustmentRequest;
    const [first] = makeAdjustments(1);
    return HttpResponse.json({ ...first, target: body.target, targetId: body.targetId }, { status: 201 });
  }),
  http.post('/api/scores/adjustments/:id/reverse', ({ params }) => {
    const [first] = makeAdjustments(1);
    return HttpResponse.json({ ...first, id: 99, reversesAdjustmentId: Number(params.id), amount: -first.amount }, { status: 201 });
  }),

  http.post('/api/archive/finalize', () => HttpResponse.json(makeFinalizeResponse())),
];
