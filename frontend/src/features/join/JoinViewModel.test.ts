import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { JoinTeam, Me } from '@/api/types';
import { deferred } from '@/test/deferred';
import { makeJoinTeams, makeMe } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createTestFakes, createTestServices, type TestFakes } from '@/test/testServices';
import { JoinViewModel } from './JoinViewModel';

function create(options: { urlCode?: string; rememberedCode?: string; teams?: number } = {}) {
  const fakes = createTestFakes();
  fakes.joinCodeMemory.code = options.rememberedCode;
  fakes.eventApi.joinTeams = makeJoinTeams(options.teams ?? 3, 2);
  const services = createTestServices({}, fakes);
  const vm = new JoinViewModel(services.session, fakes.eventApi, services.event, fakes.joinCodeMemory, options.urlCode);
  return { vm, fakes, services };
}

/** A registration that passes every check: code entered, teams loaded, the second team picked. */
async function fillRegistration(vm: JoinViewModel) {
  vm.setJoinCode('  CODE-1 ');
  vm.setRealName('  Real Name ');
  vm.setDisplayName(' Nick ');
  vm.setPin('1234');
  vm.loadTeams();
  await flushPromises();
  vm.selectTeam(2);
}

function failure(init: ConstructorParameters<typeof ApiError>[0]) {
  return new ApiError(init);
}

describe('JoinViewModel: the join code', () => {
  it('starts empty when there is neither a link code nor a remembered one', () => {
    expect(create().vm.joinCode).toBe('');
  });

  it('prefers the code in the link over the remembered one', () => {
    expect(create({ urlCode: ' LINK ', rememberedCode: 'OLD' }).vm.joinCode).toBe('LINK');
  });

  it('falls back to the code remembered from the last visit', () => {
    expect(create({ rememberedCode: 'OLD' }).vm.joinCode).toBe('OLD');
  });

  it('remembers a code once the server has shown teams for it', async () => {
    const { vm, fakes } = create();
    vm.setJoinCode(' CODE ');

    vm.loadTeams();
    await flushPromises();

    expect(fakes.joinCodeMemory.remembered).toEqual(['CODE']);
  });

  it('shows the event name once the event is loaded', async () => {
    const { vm, services } = create();
    expect(vm.eventName).toBeUndefined();

    await services.event.load();

    expect(vm.eventName).toBe('Games Night');
  });
});

describe('JoinViewModel: the team picker', () => {
  it('fetches nothing on arrival without a code, and nothing while a code is being typed', () => {
    const { vm, fakes } = create();

    vm.activate();
    vm.setJoinCode('C');
    vm.setJoinCode('CO');
    vm.setJoinCode('COD');

    expect(fakes.eventApi.joinTeamCodes).toEqual([]);
    expect(vm.pickerState).toBe('needsCode');
  });

  it('fetches on arrival when a code came with the link, once even if the page activates twice', async () => {
    const { vm, fakes } = create({ urlCode: 'LINK' });

    vm.activate();
    vm.activate();
    await flushPromises();

    expect(fakes.eventApi.joinTeamCodes).toEqual(['LINK']);
    expect(vm.pickerState).toBe('ready');
  });

  it('fetches a remembered code on arrival too', async () => {
    const { vm, fakes } = create({ rememberedCode: 'OLD' });

    vm.activate();
    await flushPromises();

    expect(fakes.eventApi.joinTeamCodes).toEqual(['OLD']);
  });

  it('looks a code up once, however often the box is left or Continue is pressed', async () => {
    const { vm, fakes } = create();
    vm.setJoinCode('CODE');

    vm.loadTeams();
    vm.loadTeams();
    vm.continueWithCode();
    await flushPromises();
    vm.loadTeams();
    vm.continueWithCode();

    expect(fakes.eventApi.joinTeamCodes).toEqual(['CODE']);
  });

  it('looks up a changed code, and shows no list at all while the box holds a code it has not looked up', async () => {
    const { vm, fakes } = create();
    vm.setJoinCode('ONE');
    vm.loadTeams();
    await flushPromises();
    expect(vm.pickerState).toBe('ready');

    vm.setJoinCode('TWO');
    expect(vm.pickerState).toBe('needsCode');
    expect(vm.teamOptions).toEqual([]);

    vm.loadTeams();
    await flushPromises();
    expect(fakes.eventApi.joinTeamCodes).toEqual(['ONE', 'TWO']);
    expect(vm.pickerState).toBe('ready');
  });

  it('ignores the answer for an earlier code that arrives after the answer for a later one', async () => {
    const { vm, fakes } = create();
    const slow = deferred<JoinTeam[]>();
    const original = fakes.eventApi.getJoinTeams.bind(fakes.eventApi);
    fakes.eventApi.getJoinTeams = (code) => (code === 'ONE' ? slow.promise : original(code));
    vm.setJoinCode('ONE');
    vm.loadTeams();
    vm.setJoinCode('TWO');
    vm.loadTeams();
    await flushPromises();

    slow.resolve(makeJoinTeams(9));
    await flushPromises();

    expect(vm.teamOptions).toHaveLength(3);
  });

  it('shows the teams in the order the server sent them', async () => {
    const { vm, fakes } = create();
    fakes.eventApi.joinTeams = makeJoinTeams(4).reverse();
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();

    expect(vm.teamOptions.map((team) => team.id)).toEqual([4, 3, 2, 1]);
  });

  it.each([1, 2, 6, 13])('offers every one of %i teams, with how many players are in each', async (count) => {
    const { vm } = create({ teams: count });
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();

    expect(vm.teamOptions).toHaveLength(count);
    expect(vm.teamOptions[0]).toMatchObject({ name: 'Team 1', detail: '2 players' });
  });

  it('says "1 player" and "0 players" correctly', async () => {
    const { vm, fakes } = create();
    fakes.eventApi.joinTeams = [
      { ...makeJoinTeams(1)[0], memberCount: 1 },
      { ...makeJoinTeams(2)[1], memberCount: 0 },
    ];
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();

    expect(vm.teamOptions.map((team) => team.detail)).toEqual(['1 player', '0 players']);
  });

  it('reports an event with no teams', async () => {
    const { vm } = create({ teams: 0 });
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();

    expect(vm.pickerState).toBe('empty');
  });

  it('reports an unrecognised code on the code, tries it only once, and tries a new one', async () => {
    const { vm, fakes } = create();
    fakes.eventApi.failNext(failure({ status: 404, kind: 'notFound' }));
    vm.setJoinCode('WRONG');

    vm.loadTeams();
    await flushPromises();
    vm.loadTeams();
    vm.continueWithCode();

    expect(vm.joinCodeError).toBe('That join code is not recognised');
    expect(vm.pickerState).toBe('needsCode');
    expect(fakes.eventApi.joinTeamCodes).toEqual(['WRONG']);

    vm.setJoinCode('RIGHT');
    expect(vm.joinCodeError).toBeUndefined();
    vm.loadTeams();
    await flushPromises();
    expect(vm.pickerState).toBe('ready');
  });

  it('shows a lost connection under the picker and tries again on the next ask', async () => {
    const { vm, fakes } = create();
    fakes.eventApi.failNext(ApiError.network());
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();

    expect(vm.pickerState).toBe('error');
    expect(vm.teamsError).toBe(ApiError.network().message);
    expect(vm.joinCodeError).toBeUndefined();

    vm.continueWithCode();
    await flushPromises();
    expect(vm.pickerState).toBe('ready');
    expect(vm.teamsError).toBeUndefined();
  });

  it('asks Continue for a code when the box is empty', () => {
    const { vm, fakes } = create();

    vm.continueWithCode();

    expect(vm.joinCodeError).toBe('Enter the join code');
    expect(fakes.eventApi.joinTeamCodes).toEqual([]);
  });

  it('does not fetch teams for a person who is signing in', async () => {
    const { vm, fakes } = create();
    vm.selectTab('signIn');
    vm.setJoinCode('CODE');

    vm.loadTeams();
    await flushPromises();
    expect(fakes.eventApi.joinTeamCodes).toEqual([]);

    vm.selectTab('register');
    await flushPromises();
    expect(fakes.eventApi.joinTeamCodes).toEqual(['CODE']);
  });

  it('forgets a chosen team that the new code\'s list does not have', async () => {
    const { vm, fakes } = create({ teams: 3 });
    vm.setJoinCode('ONE');
    vm.loadTeams();
    await flushPromises();
    vm.selectTeam(3);

    fakes.eventApi.joinTeams = makeJoinTeams(2);
    vm.setJoinCode('TWO');
    vm.loadTeams();
    await flushPromises();

    expect(vm.teamId).toBeUndefined();
  });

  describe('when the server asks for a pause', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts the seconds under the picker and lets Continue work again afterwards', async () => {
      const { vm, fakes } = create();
      fakes.eventApi.failNext(failure({ status: 429, kind: 'rateLimited', retryAfterSeconds: 10 }));
      vm.setJoinCode('CODE');

      vm.loadTeams();
      await flushPromises();
      expect(vm.teamsError).toBe('Too many attempts. Try again in 10 seconds');
      expect(vm.canLoadTeams).toBe(false);

      vm.continueWithCode();
      expect(fakes.eventApi.joinTeamCodes).toHaveLength(1);

      vi.advanceTimersByTime(4000);
      expect(vm.teamsError).toBe('Too many attempts. Try again in 6 seconds');

      vi.advanceTimersByTime(6000);
      expect(vm.canLoadTeams).toBe(true);
      vm.continueWithCode();
      await flushPromises();
      expect(vm.pickerState).toBe('ready');
    });
  });
});

describe('JoinViewModel: checking the form before it is sent', () => {
  it('reports every missing field of a registration and sends nothing', async () => {
    const { vm, fakes } = create();

    await vm.submit();

    expect(Object.keys(vm.fieldErrors).sort()).toEqual(['displayName', 'joinCode', 'pin', 'realName', 'teamId']);
    expect(fakes.sessionApi.calls).toEqual([]);
  });

  it('asks a person signing in for the code, name and PIN only', async () => {
    const { vm, fakes } = create();
    vm.selectTab('signIn');

    await vm.submit();

    expect(Object.keys(vm.fieldErrors).sort()).toEqual(['joinCode', 'pin', 'realName']);
    expect(fakes.sessionApi.calls).toEqual([]);
  });

  it('measures names after trimming', async () => {
    const { vm } = create();
    await fillRegistration(vm);
    vm.setDisplayName(' a ');

    await vm.submit();

    expect(vm.fieldErrors.displayName).toBe('Use 2 to 20 characters');
    expect(vm.fieldErrors.realName).toBeUndefined();
  });

  it('keeps only digits in the PIN, at most four', () => {
    const { vm } = create();

    vm.setPin('12ab-345678');

    expect(vm.pin).toBe('1234');
  });

  it('takes a field\'s error away as soon as that field is edited, and leaves the others', async () => {
    const { vm } = create();
    await vm.submit();

    vm.setRealName('Real Name');

    expect(vm.fieldErrors.realName).toBeUndefined();
    expect(vm.fieldErrors.pin).toBeDefined();
  });
});

describe('JoinViewModel: registering', () => {
  it('sends the trimmed values with the chosen team, and signs the person in', async () => {
    const { vm, fakes, services } = create();
    const register = vi.spyOn(fakes.sessionApi, 'register');
    await fillRegistration(vm);

    await vm.submit();

    expect(register).toHaveBeenCalledExactlyOnceWith({
      joinCode: 'CODE-1',
      realName: 'Real Name',
      displayName: 'Nick',
      pin: '1234',
      teamId: 2,
    });
    expect(services.session.status).toBe('signedIn');
    expect(fakes.joinCodeMemory.code).toBe('CODE-1');
  });

  it('ignores a second submit while the first is on its way', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    const pending = deferred<Me>();
    const register = vi.spyOn(fakes.sessionApi, 'register').mockReturnValue(pending.promise);

    const first = vm.submit();
    const second = vm.submit();
    expect(vm.isSubmitting).toBe(true);
    pending.resolve(makeMe());
    await Promise.all([first, second]);

    expect(register).toHaveBeenCalledTimes(1);
    expect(vm.isSubmitting).toBe(false);
  });

  it('puts each server message under its field', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(
      failure({
        status: 400,
        kind: 'validation',
        fieldErrors: { displayName: ['Too rude.', 'Too long.'], pin: ['Not a PIN.'] },
      }),
    );

    await vm.submit();

    expect(vm.fieldErrors).toEqual({ displayName: 'Too rude. Too long.', pin: 'Not a PIN.' });
    expect(vm.formError).toBeUndefined();
  });

  it('shows a server message for a field the form does not have on the form, so nothing is swallowed', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(
      failure({ status: 400, kind: 'validation', fieldErrors: { pin: ['Bad PIN.'], surprise: ['Unexpected field.'] } }),
    );

    await vm.submit();

    expect(vm.fieldErrors).toEqual({ pin: 'Bad PIN.' });
    expect(vm.formError).toBe('Unexpected field.');
  });

  it('shows the 400 title or detail when the server named no field', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(failure({ status: 400, kind: 'validation', detail: 'The request was malformed.' }));

    await vm.submit();

    expect(vm.formError).toBe('The request was malformed.');
  });

  it('reports an unrecognised code on the code field', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(failure({ status: 404, kind: 'notFound' }));

    await vm.submit();

    expect(vm.joinCodeError).toBe('That join code is not recognised');
    expect(vm.formError).toBeUndefined();
  });

  it('shows the server\'s sentence for a taken real name and offers to sign in instead, keeping the form', async () => {
    const { vm, fakes, services } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(
      failure({
        status: 409,
        kind: 'conflict',
        title: 'Name already taken.',
        detail: 'A player with that real name is already registered. Sign in instead.',
      }),
    );

    await vm.submit();

    expect(vm.formError).toBe('A player with that real name is already registered. Sign in instead.');
    expect(vm.canSwitchToSignIn).toBe(true);
    expect(services.session.status).not.toBe('signedIn');

    vm.signInInstead();

    expect(vm.tab).toBe('signIn');
    expect([vm.joinCode, vm.realName, vm.pin]).toEqual(['  CODE-1 ', '  Real Name ', '1234']);
    expect(vm.formError).toBeUndefined();
    expect(vm.canSwitchToSignIn).toBe(false);
  });

  it('shows the server\'s sentence for a taken display name without offering to sign in', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(
      failure({
        status: 409,
        kind: 'conflict',
        detail: 'That display name is already taken. Pick a different one.',
      }),
    );

    await vm.submit();

    expect(vm.formError).toBe('That display name is already taken. Pick a different one.');
    expect(vm.canSwitchToSignIn).toBe(false);
  });

  it('takes the form message away when the person edits the form, and the person can submit again', async () => {
    const { vm, fakes, services } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(failure({ status: 409, kind: 'conflict', detail: 'That display name is already taken.' }));
    await vm.submit();

    vm.setDisplayName('Another');
    expect(vm.formError).toBeUndefined();
    await vm.submit();

    expect(services.session.status).toBe('signedIn');
  });

  it('shows a lost connection on the form and keeps what was typed', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(ApiError.network());

    await vm.submit();

    expect(vm.formError).toBe(ApiError.network().message);
    expect(vm.realName).toBe('  Real Name ');
    expect(vm.canSubmit).toBe(true);
  });

  it('shows an unexpected failure that is not an API error as its message', async () => {
    const { vm, fakes } = create();
    await fillRegistration(vm);
    fakes.sessionApi.failNext(new Error('Something odd'));

    await vm.submit();

    expect(vm.formError).toBe('Something odd');
  });
});

describe('JoinViewModel: signing in', () => {
  function fillSignIn(vm: JoinViewModel, fakes: TestFakes) {
    fakes.sessionApi.accounts = [makeMe({ realName: 'Real Name' })];
    vm.selectTab('signIn');
    vm.setJoinCode('CODE');
    vm.setRealName('Real Name');
    vm.setPin('1234');
  }

  it('sends the code, name and PIN, and signs the person in', async () => {
    const { vm, fakes, services } = create();
    const signIn = vi.spyOn(fakes.sessionApi, 'signIn');
    fillSignIn(vm, fakes);

    await vm.submit();

    expect(signIn).toHaveBeenCalledExactlyOnceWith({ joinCode: 'CODE', realName: 'Real Name', pin: '1234' });
    expect(services.session.status).toBe('signedIn');
    expect(fakes.joinCodeMemory.code).toBe('CODE');
  });

  it('keeps the person on the form with the server\'s message for a wrong name or PIN', async () => {
    const { vm, fakes, services } = create();
    fillSignIn(vm, fakes);
    vm.setRealName('Somebody Else');

    await vm.submit();

    expect(vm.formError).toBe('Real name or PIN is incorrect.');
    expect(vm.tab).toBe('signIn');
    expect(services.session.status).not.toBe('signedIn');
    expect(vm.canSwitchToSignIn).toBe(false);
  });

  it('shows a lost connection', async () => {
    const { vm, fakes } = create();
    fillSignIn(vm, fakes);
    fakes.sessionApi.failNext(ApiError.network());

    await vm.submit();

    expect(vm.formError).toBe(ApiError.network().message);
  });

  it('switching tabs clears the errors but keeps what was typed', async () => {
    const { vm } = create();
    await vm.submit();
    vm.setRealName('Real Name');

    vm.selectTab('signIn');

    expect(vm.fieldErrors).toEqual({});
    expect(vm.realName).toBe('Real Name');
    expect(vm.submitLabel).toBe('Sign in');
  });

  describe('when the server asks for a pause', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts the seconds down, blocks submitting until they are over, then lets the person try again', async () => {
      const { vm, fakes, services } = create();
      fillSignIn(vm, fakes);
      fakes.sessionApi.failNext(failure({ status: 429, kind: 'rateLimited', retryAfterSeconds: 30 }));

      await vm.submit();
      expect(vm.formError).toBe('Too many attempts. Try again in 30 seconds');
      expect(vm.canSubmit).toBe(false);

      fakes.sessionApi.clearCalls();
      await vm.submit();
      expect(fakes.sessionApi.calls).toEqual([]);

      vi.advanceTimersByTime(12_000);
      expect(vm.formError).toBe('Too many attempts. Try again in 18 seconds');

      vi.advanceTimersByTime(18_000);
      expect(vm.formError).toBeUndefined();
      expect(vm.canSubmit).toBe(true);

      await vm.submit();
      expect(services.session.status).toBe('signedIn');
    });

    it('says "in a moment" and does not block when the server gave no time', async () => {
      const { vm, fakes } = create();
      fillSignIn(vm, fakes);
      fakes.sessionApi.failNext(failure({ status: 429, kind: 'rateLimited' }));

      await vm.submit();

      expect(vm.formError).toBe('Too many attempts. Try again in a moment');
      expect(vm.canSubmit).toBe(true);
    });

    it('keeps the rate-limit message while the person edits, since the limit still applies', async () => {
      const { vm, fakes } = create();
      fillSignIn(vm, fakes);
      fakes.sessionApi.failNext(failure({ status: 429, kind: 'rateLimited', retryAfterSeconds: 30 }));
      await vm.submit();

      vm.setPin('4321');

      expect(vm.formError).toBe('Too many attempts. Try again in 30 seconds');
    });

    it('stops the countdown when the screen goes away', async () => {
      const { vm, fakes } = create();
      fillSignIn(vm, fakes);
      fakes.sessionApi.failNext(failure({ status: 429, kind: 'rateLimited', retryAfterSeconds: 30 }));
      await vm.submit();

      vm.dispose();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
