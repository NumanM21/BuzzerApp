import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { navItemsFor } from '@/domain/navigation';
import { renderWithApp } from '@/test/renderWithApp';
import { AppLayout, type AppLayoutProps } from './AppLayout';

function renderLayout(props: Partial<AppLayoutProps> = {}, route = '/') {
  const onSignOut = vi.fn();
  const result = renderWithApp(
    <AppLayout
      eventName="Games Night"
      displayName="Nick"
      navItems={navItemsFor('player')}
      onSignOut={onSignOut}
      isSigningOut={false}
      {...props}
    >
      <p>The screen</p>
    </AppLayout>,
    { route },
  );
  return { ...result, onSignOut };
}

describe('AppLayout', () => {
  it('shows the event, who is signed in, and the screen', () => {
    renderLayout();

    expect(screen.getByText('Games Night')).toBeInTheDocument();
    expect(screen.getByText('Nick')).toBeInTheDocument();
    expect(screen.getByText('The screen')).toBeInTheDocument();
  });

  it('shows no event title when there is none, and still shows the person', () => {
    renderLayout({ eventName: '' });

    expect(screen.getByText('Nick')).toBeInTheDocument();
  });

  it.each(['player', 'admin'] as const)('links every %s navigation item, each with a text label', (role) => {
    const items = navItemsFor(role);
    renderLayout({ navItems: items });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      items.map((item) => [item.label, item.path]),
    );
  });

  it('marks the current screen, and only that one, for assistive technology', () => {
    renderLayout({ navItems: navItemsFor('player') }, '/teams');

    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Buzz' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Scores' })).not.toHaveAttribute('aria-current');
  });

  it('does not mark Host as current on a screen below it', () => {
    renderLayout({ navItems: navItemsFor('admin') }, '/admin/scores');

    expect(screen.getByRole('link', { name: 'Scores' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Host' })).not.toHaveAttribute('aria-current');
  });

  it('signs out when the button is pressed', async () => {
    const { user, onSignOut } = renderLayout();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('disables the button while signing out', () => {
    renderLayout({ isSigningOut: true });

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  });

  it('shows why signing out failed', () => {
    renderLayout({ signOutError: 'Could not reach the server.' });

    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument();
  });
});
