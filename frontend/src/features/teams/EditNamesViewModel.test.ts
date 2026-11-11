import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { ROUND_RUNNING_NOTE } from '@/domain/text';
import { createTeamsScenario } from '@/test/teamsScenario';
import { EditNamesViewModel, type EditNamesTarget } from './EditNamesViewModel';

const ownTarget: EditNamesTarget = { playerId: 1, displayName: 'Player 1', realName: 'Real Name 1', isOwn: true };
const otherTarget: EditNamesTarget = { playerId: 2, displayName: 'Player 2', realName: 'Real Name 2', isOwn: false };

async function setup(target: EditNamesTarget, isRoundRunning = false) {
  const scenario = await createTeamsScenario({ viewer: target.isOwn ? 'player' : 'admin' });
  const close = vi.fn();
  const vm = new EditNamesViewModel(target, scenario.services.teams, () => isRoundRunning, close);
  return { ...scenario, vm, close };
}

describe('EditNamesViewModel', () => {
  it('starts with both names filled in', async () => {
    const { vm } = await setup(ownTarget);

    expect(vm.displayName).toBe('Player 1');
    expect(vm.realName).toBe('Real Name 1');
  });

  it('closes without asking the server when nothing changed', async () => {
    const { vm, close, fakes } = await setup(ownTarget);

    await vm.submit();

    expect(close).toHaveBeenCalledOnce();
    expect(fakes.playersApi.calls).toEqual([]);
  });

  it('sends only the display name when only it changed, through /players/me for the own row', async () => {
    const { vm, close, fakes } = await setup(ownTarget);
    const update = vi.spyOn(fakes.playersApi, 'updateMyNames');

    vm.setDisplayName('  Ace ');
    await vm.submit();

    expect(update).toHaveBeenCalledWith({ displayName: 'Ace' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('sends only the real name when only it changed, through /players/{id} for another person', async () => {
    const { vm, fakes } = await setup(otherTarget);
    const update = vi.spyOn(fakes.playersApi, 'updatePlayerNames');

    vm.setRealName('Someone Else');
    await vm.submit();

    expect(update).toHaveBeenCalledWith(2, { realName: 'Someone Else' });
  });

  it('reloads the teams after a save', async () => {
    const { vm, fakes } = await setup(ownTarget);
    fakes.teamsApi.clearCalls();

    vm.setDisplayName('Ace');
    await vm.submit();

    expect(fakes.teamsApi.calls).toContain('getTeams');
  });

  it.each([
    ['display name', 'displayName', 'x'],
    ['display name', 'displayName', 'x'.repeat(21)],
    ['real name', 'realName', ' '],
  ] as const)('refuses a changed %s that breaks the rule, and sends nothing', async (_, field, value) => {
    const { vm, close, fakes } = await setup(ownTarget);

    if (field === 'displayName') {
      vm.setDisplayName(value);
    } else {
      vm.setRealName(value);
    }
    await vm.submit();

    expect(vm.form.fieldErrors[field]).toBe('Use 2 to 20 characters');
    expect(fakes.playersApi.calls).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('does not check a name that was left alone', async () => {
    // A real name the server already holds must not block a display-name edit.
    const { vm, fakes } = await setup({ ...ownTarget, realName: null });
    const update = vi.spyOn(fakes.playersApi, 'updateMyNames');

    vm.setDisplayName('Ace');
    await vm.submit();

    expect(vm.form.fieldErrors).toEqual({});
    expect(update).toHaveBeenCalledWith({ displayName: 'Ace' });
  });

  it('puts a display-name clash on the display name and keeps the dialog open', async () => {
    const { vm, close, fakes } = await setup(ownTarget);
    fakes.playersApi.failNext(
      new ApiError({ status: 409, kind: 'conflict', detail: 'Another player already has that display name.' }),
    );

    vm.setDisplayName('Taken');
    await vm.submit();

    expect(vm.form.fieldErrors).toEqual({ displayName: 'Another player already has that display name.' });
    expect(vm.form.formError).toBeUndefined();
    expect(close).not.toHaveBeenCalled();
  });

  it('puts a real-name clash on the real name', async () => {
    const { vm, fakes } = await setup(ownTarget);
    fakes.playersApi.failNext(
      new ApiError({ status: 409, kind: 'conflict', detail: 'Another player already has that real name.' }),
    );

    vm.setRealName('Taken Name');
    await vm.submit();

    expect(vm.form.fieldErrors).toEqual({ realName: 'Another player already has that real name.' });
  });

  it('shows the server field messages from a 400 under their fields', async () => {
    const { vm, fakes } = await setup(ownTarget);
    fakes.playersApi.failNext(
      new ApiError({ status: 400, kind: 'validation', fieldErrors: { displayName: ['Not allowed.'] } }),
    );

    vm.setDisplayName('Nope');
    await vm.submit();

    expect(vm.form.fieldErrors.displayName).toBe('Not allowed.');
  });

  it('clears a field message when the field is edited', async () => {
    const { vm } = await setup(ownTarget);
    vm.setDisplayName('x');
    await vm.submit();

    vm.setDisplayName('xy');

    expect(vm.form.fieldErrors.displayName).toBeUndefined();
  });

  it('says so when a round is running, and not otherwise', async () => {
    expect((await setup(ownTarget, true)).vm.roundNote).toBe(ROUND_RUNNING_NOTE);
    expect((await setup(ownTarget, false)).vm.roundNote).toBeUndefined();
  });
});
