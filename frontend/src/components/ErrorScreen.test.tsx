import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorScreen } from './ErrorScreen';

describe('ErrorScreen', () => {
  // Rendered bare on purpose: it must also work when no theme could be loaded, so it may not need a provider.
  it('says what happened and what to do, without a theme around it', () => {
    render(<ErrorScreen onReload={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('Check your connection, then reload');
  });

  it('reloads when asked', async () => {
    const onReload = vi.fn();
    render(<ErrorScreen onReload={onReload} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
