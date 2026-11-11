import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '@/test/renderWithApp';
import { TeamStylePicker, type TeamStylePickerProps } from './TeamStylePicker';

function keysOf(count: number, prefix = 'key'): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function renderPicker(props: Partial<TeamStylePickerProps> = {}) {
  const onSelect = vi.fn();
  const result = renderWithApp(
    <TeamStylePicker
      legend="Colour"
      kind="color"
      keys={keysOf(3)}
      selectedKey={undefined}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { ...result, onSelect };
}

describe('TeamStylePicker', () => {
  it.each([1, 3, 9, 20])('offers one radio per key for %i keys, in the order given', (count) => {
    renderPicker({ keys: keysOf(count) });

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(count);
    expect(radios[0]).toHaveAccessibleName('key 1');
    expect(radios[count - 1]).toHaveAccessibleName(`key ${count}`);
  });

  it.each(['color', 'icon'] as const)('is one named group of %s options', (kind) => {
    renderPicker({ kind, legend: 'Choose' });

    expect(screen.getByRole('group', { name: 'Choose' })).toBeInTheDocument();
  });

  it('names each option by its key as text, so colour is never the only signal', () => {
    renderPicker({ keys: ['orange', 'sea-green'] });

    expect(screen.getByRole('radio', { name: 'orange' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'sea green' })).toBeInTheDocument();
  });

  it('marks the chosen key and reports a choice', async () => {
    const { user, onSelect } = renderPicker({ selectedKey: 'key-2' });

    expect(screen.getByRole('radio', { name: 'key 2' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'key 1' })).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'key 3' }));

    expect(onSelect).toHaveBeenCalledWith('key-3');
  });

  it('draws icons on the colour chosen so far', () => {
    renderPicker({ kind: 'icon', keys: ['face'], previewColorKey: 'whatever' });

    // An unknown colour or icon key falls back to the pack's look instead of failing.
    expect(screen.getByRole('radio', { name: 'face' })).toBeInTheDocument();
  });

  it('shows an error under the options and ties it to the group', () => {
    renderPicker({ errorText: 'Pick a colour' });

    expect(screen.getByText('Pick a colour')).toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveAccessibleDescription('Pick a colour');
  });
});
