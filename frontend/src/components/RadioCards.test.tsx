import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '@/test/renderWithApp';
import { RadioCard, RadioCardGroup, type RadioCardDensity } from './RadioCards';

const labels = ['First', 'Second', 'Third'];

function renderGroup(options: { selected?: string; errorText?: string; density?: RadioCardDensity } = {}) {
  const onSelect = vi.fn<(label: string) => void>();
  const density = options.density ?? 'roomy';
  const result = renderWithApp(
    <RadioCardGroup legend="Pick one" density={density} errorText={options.errorText}>
      {labels.map((label) => (
        <RadioCard
          key={label}
          groupName="group"
          selected={label === options.selected}
          onSelect={() => onSelect(label)}
          teamFill="inherit"
          frame="neutral"
          density={density}
        >
          <span>{label}</span>
        </RadioCard>
      ))}
    </RadioCardGroup>,
  );
  return { ...result, onSelect };
}

describe('RadioCardGroup and RadioCard', () => {
  it.each<RadioCardDensity>(['roomy', 'compact'])('is one named group of real radio buttons (%s)', (density) => {
    renderGroup({ density });

    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('name'))).toEqual(['group', 'group', 'group']);
  });

  it('names each radio by what its card says, and checks only the chosen one', () => {
    renderGroup({ selected: 'Second' });

    expect(screen.getByRole('radio', { name: 'Second' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'First' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Third' })).not.toBeChecked();
  });

  it('chooses a card when any part of it is tapped, not only the small radio', async () => {
    const { user, onSelect } = renderGroup({ selected: 'First' });

    await user.click(screen.getByText('Third'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Third');
  });

  it('shows an error as text tied to the group, and nothing when there is none', () => {
    const { unmount } = renderGroup({ errorText: 'Pick something' });
    expect(screen.getByRole('group', { name: 'Pick one' })).toHaveAccessibleDescription('Pick something');
    unmount();

    renderGroup();
    expect(screen.getByRole('group', { name: 'Pick one' })).not.toHaveAttribute('aria-describedby');
  });
});
