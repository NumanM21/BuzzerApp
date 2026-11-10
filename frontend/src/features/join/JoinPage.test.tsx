import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/AppServices';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeMe, problem } from '@/test/factories';
import { FakeJoinCodeMemory } from '@/test/fakes/FakeJoinCodeMemory';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/renderApp';

// The join screen with the real page, view model, stores and API classes over the fake network (MSW): what these
// show is the wire format as well as the page. The rules and every error case are covered in `JoinViewModel.test.ts`.

/** A phone with no session: `/api/session/me` says 401 until a register or sign-in handler is used. */
function startAnonymous() {
  server.use(http.get('/api/session/me', () => problemResponse(401, problem(401))));
  return createAppServices({
    fetchFunction: (input, init) => fetch(input, init),
    joinCodeMemory: new FakeJoinCodeMemory(),
  });
}

/** Opens the app at a join address and waits until the page has been drawn (the start-up calls are real requests). */
async function openJoin(route: string) {
  const app = await renderApp(route, startAnonymous());
  await screen.findByRole('heading', { name: 'Join the game' });
  return app;
}

async function fillRegistration(user: UserEvent) {
  await user.type(screen.getByLabelText('Your real name'), 'Real Person');
  await user.type(screen.getByLabelText('Display name'), 'Nick');
  await user.type(screen.getByLabelText('PIN'), '1234');
  await user.click(await screen.findByRole('radio', { name: /Team 2/ }));
}

describe('JoinPage: registering', () => {
  it('registers with the chosen team, then lands on the buzz screen', async () => {
    let body: unknown;
    server.use(
      http.post('/api/session/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeMe({ displayName: 'Nick', teamId: 2 }), { status: 201 });
      }),
    );
    const { user, router } = await openJoin('/join?code=CODE-1');
    await fillRegistration(user);

    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.play);
    expect(body).toEqual({ joinCode: 'CODE-1', realName: 'Real Person', displayName: 'Nick', pin: '1234', teamId: 2 });
  });

  it('prefills the code from the link and shows the event\'s teams without being asked', async () => {
    await openJoin('/join?code=CODE-1');

    expect(screen.getByLabelText('Join code')).toHaveValue('CODE-1');
    expect(await screen.findAllByRole('radio')).toHaveLength(3);
  });

  it('looks the teams up only when the code is complete, not as it is typed', async () => {
    const codes: (string | null)[] = [];
    server.use(
      http.get('/api/event/teams', ({ request }) => {
        codes.push(new URL(request.url).searchParams.get('code'));
        return HttpResponse.json([]);
      }),
    );
    const { user } = await openJoin('/join');

    await user.type(screen.getByLabelText('Join code'), 'ABCD');
    expect(codes).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/no teams yet/)).toBeInTheDocument();
    expect(codes).toEqual(['ABCD']);
  });

  it('shows the form errors next to their fields without calling the server', async () => {
    let registerCalls = 0;
    server.use(
      http.post('/api/session/register', () => {
        registerCalls += 1;
        return HttpResponse.json(makeMe(), { status: 201 });
      }),
    );
    const { user } = await openJoin('/join?code=CODE-1');
    await screen.findAllByRole('radio');

    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findAllByText('Use 2 to 20 characters')).toHaveLength(2);
    expect(screen.getByText('The PIN is exactly 4 digits')).toBeInTheDocument();
    expect(screen.getByText('Pick your team')).toBeInTheDocument();
    expect(registerCalls).toBe(0);
  });

  it('reports a taken real name, and "Sign in instead" switches tabs and keeps the name', async () => {
    server.use(
      http.post('/api/session/register', () =>
        problemResponse(
          409,
          problem(409, {
            title: 'Name already taken.',
            detail: 'A player with that real name is already registered. Sign in instead.',
          }),
        ),
      ),
    );
    const { user } = await openJoin('/join?code=CODE-1');
    await fillRegistration(user);

    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText(/already registered/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in instead' }));

    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Your real name')).toHaveValue('Real Person');
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });
});

describe('JoinPage: signing in', () => {
  async function openSignInTab(user: UserEvent) {
    await user.click(screen.getByRole('tab', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Your real name'), 'Real Person');
    await user.type(screen.getByLabelText('PIN'), '1234');
  }

  it('signs in with the code, name and PIN, then lands on the buzz screen', async () => {
    let body: unknown;
    server.use(
      http.post('/api/session/signin', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeMe());
      }),
    );
    const { user, router } = await openJoin('/join?code=CODE-1');
    await openSignInTab(user);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.play);
    expect(body).toEqual({ joinCode: 'CODE-1', realName: 'Real Person', pin: '1234' });
  });

  it('sends an admin to the host screen', async () => {
    server.use(http.post('/api/session/signin', () => HttpResponse.json(makeAdminMe())));
    const { user, router } = await openJoin('/join?code=CODE-1');
    await openSignInTab(user);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Host' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.adminHost);
  });

  it('shows the server\'s message for a wrong PIN and stays on the form', async () => {
    server.use(
      http.post('/api/session/signin', () =>
        problemResponse(401, problem(401, { detail: 'Real name or PIN is incorrect.' })),
      ),
    );
    const { user, router } = await openJoin('/join?code=CODE-1');
    await openSignInTab(user);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Real name or PIN is incorrect.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.join);
    expect(screen.getByLabelText('Your real name')).toHaveValue('Real Person');
  });

  it('shows the pause the server asks for after too many attempts', async () => {
    server.use(
      http.post('/api/session/signin', () =>
        problemResponse(429, problem(429), { 'Retry-After': '30' }),
      ),
    );
    const { user } = await openJoin('/join?code=CODE-1');
    await openSignInTab(user);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Too many attempts. Try again in 30 seconds')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('reports an unrecognised code on the code field', async () => {
    server.use(http.post('/api/session/signin', () => problemResponse(404, problem(404))));
    const { user } = await openJoin('/join?code=NOPE');
    await openSignInTab(user);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('That join code is not recognised')).toBeInTheDocument();
  });
});

describe('JoinPage: the PIN box', () => {
  it('is masked, numeric, four digits long, and keeps only digits', async () => {
    const { user } = await openJoin('/join');
    const pin = screen.getByLabelText('PIN');

    await user.type(pin, '12ab34567');

    expect(pin).toHaveAttribute('type', 'password');
    expect(pin).toHaveAttribute('inputmode', 'numeric');
    expect(pin).toHaveAttribute('maxlength', '4');
    expect(pin).toHaveValue('1234');
  });
});
