import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeMe, makePublicSnapshot } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { createTestFakes, createTestServices } from '@/test/testServices';

async function visit(me: Me | undefined) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const result = await renderApp('/dev/realtime', createTestServices({}, fakes));
  return { ...result, connection: fakes.connection };
}

describe('RealtimeDebugPage', () => {
  it('shows the connection and the latest snapshot as they change', async () => {
    const { connection } = await visit(makeMe());
    expect(await screen.findByRole('heading', { name: 'Realtime' })).toBeInTheDocument();

    act(() => {
      connection.setState('connected');
      connection.emitRoundUpdated(makePublicSnapshot({ version: 1, phase: 'open' }));
    });

    expect(screen.getByText('connected')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buzz' })).toBeInTheDocument();
  });

  it('gives an admin no buttons: the host screen runs the round', async () => {
    await visit(makeAdminMe());

    expect(await screen.findByRole('heading', { name: 'Realtime' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sends someone not signed in to the join screen', async () => {
    const { router } = await visit(undefined);

    expect(await screen.findByRole('heading', { name: 'Join the game' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.join);
  });
});
