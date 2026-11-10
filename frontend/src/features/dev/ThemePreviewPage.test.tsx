import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultCopy } from '@/theme/defaultCopy';
import { themeCatalog } from '@/theme/registry';
import { renderWithAppAsync } from '@/test/renderWithApp';
import { createTestServices } from '@/test/testServices';
import { ThemePreviewPage } from './ThemePreviewPage';

// One flow through the real page, view model and registry: the view model's rules are covered by its own test.

function renderPage() {
  return renderWithAppAsync(<ThemePreviewPage />, { services: createTestServices({ themes: themeCatalog }) });
}

function teamCardsUnder(headingName: string) {
  const section = screen.getByRole('heading', { name: headingName }).closest('section');
  if (!section) {
    throw new Error(`No section for "${headingName}"`);
  }
  return within(section).getAllByRole('region');
}

describe('ThemePreviewPage', () => {
  it('reflows the sample teams when the team count changes', async () => {
    await renderPage();
    const slider = screen.getByRole('slider', { name: /Number of teams/ });

    fireEvent.change(slider, { target: { value: '13' } });

    expect(screen.getByRole('heading', { name: 'Teams (13)' })).toBeInTheDocument();
    expect(teamCardsUnder('Teams (13)')).toHaveLength(13);
  });

  it('shows the buzzer in every state, each with its label', async () => {
    await renderPage();

    for (const label of [
      defaultCopy.buzzerReady,
      defaultCopy.buzzerYourTeamUp,
      defaultCopy.buzzerQueued,
      defaultCopy.buzzerOut,
      defaultCopy.buzzerWaiting,
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('counts a buzzer press once', async () => {
    const { user } = await renderPage();
    const buzzer = screen.getByRole('button', { name: new RegExp(defaultCopy.buzzerReady) });

    await user.click(buzzer);

    expect(screen.getByText('Presses: 1')).toBeInTheDocument();
  });
});
