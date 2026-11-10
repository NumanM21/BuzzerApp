import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BuzzerVisualState } from '@/domain/buzzer';
import defaultPack from '@/theme/packs/default';
import type { ThemePack } from '@/theme/types';
import { renderWithApp } from '@/test/renderWithApp';
import { Buzzer } from './Buzzer';

const teamColorKey = Object.keys(defaultPack.teams.colors)[0];

// A pack whose `ready` state uses the team colour and whose `out` state uses fixed colours, whatever the default
// pack decides for those states.
const pack: ThemePack = {
  ...defaultPack,
  buzzer: {
    ...defaultPack.buzzer,
    states: {
      ...defaultPack.buzzer.states,
      ready: { colors: 'team', animation: 'pulse' },
      out: { colors: { fill: '#bdbdbd', text: '#242424' }, animation: 'none' },
    },
  },
};

function renderBuzzer(state: BuzzerVisualState = 'ready', props: { disabled?: boolean } = {}) {
  const onPress = vi.fn();
  const result = renderWithApp(
    <Buzzer state={state} teamColorKey={teamColorKey} label="Buzz!" sublabel="Tap fast" onPress={onPress} {...props} />,
    { pack },
  );
  return { ...result, onPress, button: screen.getByRole('button', { name: /Buzz!/ }) };
}

describe('Buzzer', () => {
  it('shows its state in words', () => {
    const { button } = renderBuzzer();

    expect(button).toHaveTextContent('Buzz!');
    expect(button).toHaveTextContent('Tap fast');
    expect(button).toHaveAttribute('data-state', 'ready');
  });

  it('fires on pointer down, before the finger lifts', () => {
    const { button, onPress } = renderBuzzer();

    fireEvent.pointerDown(button, { button: 0, isPrimary: true });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires once for a full tap or click', async () => {
    const { button, onPress, user } = renderBuzzer();

    await user.click(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['{Enter}', ' '])('fires once from the keyboard (%s)', async (key) => {
    const { button, onPress, user } = renderBuzzer();
    button.focus();

    await user.keyboard(key);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores a right click', () => {
    const { button, onPress } = renderBuzzer();

    fireEvent.pointerDown(button, { button: 2, isPrimary: true });

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', async () => {
    const { button, onPress, user } = renderBuzzer('ready', { disabled: true });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('paints a team-coloured state in the team colour', () => {
    const { button } = renderBuzzer('ready');
    const team = pack.teams.colors[teamColorKey];

    expect(button.style.getPropertyValue('--buzzer-fill')).toBe(team.fill);
    expect(button.style.getPropertyValue('--buzzer-text')).toBe(team.onFill);
  });

  it('paints a fixed-colour state in the colours the pack gives', () => {
    const { button } = renderBuzzer('out');

    expect(button.style.getPropertyValue('--buzzer-fill')).toBe('#bdbdbd');
    expect(button.style.getPropertyValue('--buzzer-text')).toBe('#242424');
  });
});
