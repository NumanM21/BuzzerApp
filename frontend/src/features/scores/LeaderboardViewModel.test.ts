import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { makeAdminMe, makeMe, makeTeamScores } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { LeaderboardViewModel } from './LeaderboardViewModel';

async function setup(options: { teamCount?: number; pointsStep?: number; me?: ReturnType<typeof makeMe> } = {}) {
  const { teamCount = 3, pointsStep = 10, me = makeMe({ teamId: 2 }) } = options;
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  fakes.scoresApi.teamScores = makeTeamScores(teamCount, pointsStep);
  const services = createTestServices({}, fakes);
  await services.session.restore();
  const vm = new LeaderboardViewModel(services.scores, services.session);
  return { vm, fakes, services };
}

describe('LeaderboardViewModel', () => {
  it('is loading until the scores arrive, and loads only the team scores', async () => {
    const { vm, fakes } = await setup();
    expect(vm.state).toBe('loading');

    vm.activate();
    await flushPromises();

    expect(vm.state).toBe('ready');
    expect(fakes.scoresApi.calls).toEqual(['getTeamScores']);
  });

  it.each([1, 2, 6, 13])('shows %i teams in the server\'s order with the server\'s ranks', async (count) => {
    const { vm } = await setup({ teamCount: count, me: makeMe({ teamId: 1 }) });
    vm.activate();
    await flushPromises();

    expect(vm.rows.map((row) => row.teamId)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(vm.rows.map((row) => row.rank)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
  });

  it('shows equal totals with the rank the server sent, not a counted place', async () => {
    const { vm, fakes } = await setup({ teamCount: 3 });
    fakes.scoresApi.teamScores = [
      { ...makeTeamScores(3)[0], total: 50, rank: 1 },
      { ...makeTeamScores(3)[1], total: 50, rank: 1 },
      { ...makeTeamScores(3)[2], total: 20, rank: 3 },
    ];

    vm.activate();
    await flushPromises();

    expect(vm.rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('marks the viewer\'s team, and no team for an admin', async () => {
    const player = await setup({ teamCount: 3, me: makeMe({ teamId: 3 }) });
    player.vm.activate();
    await flushPromises();
    expect(player.vm.rows.map((row) => row.isMine)).toEqual([false, false, true]);

    const admin = await setup({ teamCount: 3, me: makeAdminMe() });
    admin.vm.activate();
    await flushPromises();
    expect(admin.vm.rows.some((row) => row.isMine)).toBe(false);
  });

  it('is empty when there are no teams', async () => {
    const { vm } = await setup({ teamCount: 0 });
    vm.activate();
    await flushPromises();
    expect(vm.state).toBe('empty');
  });

  it('shows the error when the first load fails, and recovers on reload', async () => {
    const { vm, fakes } = await setup();
    fakes.scoresApi.failNext(new ApiError({ status: 500, kind: 'server', title: 'The server had a problem' }));

    vm.activate();
    await flushPromises();
    expect(vm.state).toBe('error');
    expect(vm.loadError).toBe('The server had a problem');

    vm.reload();
    await flushPromises();
    expect(vm.state).toBe('ready');
    expect(vm.loadError).toBeUndefined();
  });

  it('keeps the list on screen, with the error, when a reload fails', async () => {
    const { vm, fakes } = await setup();
    vm.activate();
    await flushPromises();

    fakes.scoresApi.failNext(new ApiError({ status: 500, kind: 'server', title: 'The server had a problem' }));
    vm.reload();
    await flushPromises();

    expect(vm.state).toBe('ready');
    expect(vm.rows).toHaveLength(3);
    expect(vm.loadError).toBe('The server had a problem');
  });

  it('follows a change the hub announces', async () => {
    const { vm, fakes } = await setup();
    vm.activate();
    await flushPromises();

    fakes.scoresApi.teamScores = makeTeamScores(3).map((score, index) => ({ ...score, total: index * 100 }));
    fakes.events.emitScoresChanged();
    await flushPromises();

    expect(vm.rows.map((row) => row.total)).toEqual([0, 100, 200]);
  });
});
