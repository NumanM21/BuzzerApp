import type { ThemePack } from '@/theme/types';
import circleIcon from './icons/circle.svg';
import diamondIcon from './icons/diamond.svg';
import genericIcon from './icons/generic.svg';
import squareIcon from './icons/square.svg';
import triangleIcon from './icons/triangle.svg';

// Fluent's stock font stacks, so this pack looks like plain Fluent UI.
const systemFonts = "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif";

/**
 * The neutral pack: Fluent's own look, light, system fonts and plainly named team colours. It is the fallback for an
 * unknown theme key forever, and the starting point to copy for a new year's pack.
 */
const defaultPack: ThemePack = {
  key: 'default',
  fluent: {
    mode: 'light',
    // Fluent's own web brand ramp (`brandWeb` in @fluentui/tokens, which isn't a public export).
    brand: {
      10: '#061724',
      20: '#082338',
      30: '#0a2e4a',
      40: '#0c3b5e',
      50: '#0e4775',
      60: '#0f548c',
      70: '#115ea3',
      80: '#0f6cbd',
      90: '#2886de',
      100: '#479ef5',
      110: '#62abf5',
      120: '#77b7f7',
      130: '#96c6fa',
      140: '#b4d6fa',
      150: '#cfe4fa',
      160: '#ebf3fc',
    },
  },
  surfaces: {
    page: '#f5f5f5',
    panel: '#ffffff',
    panelBorder: '#d1d1d1',
  },
  text: {
    body: '#242424',
    muted: '#616161',
  },
  border: { width: '2px', style: 'solid' },
  shadow: '0 2px 4px rgb(0 0 0 / 14%), 0 0 2px rgb(0 0 0 / 12%)',
  fonts: {
    heading: systemFonts,
    body: systemFonts,
    numeric: `Bahnschrift, ${systemFonts}`,
  },
  buzzer: {
    radius: '50%',
    states: {
      ready: { colors: 'team', animation: 'pulse' },
      yourTeamUp: { colors: 'team', animation: 'blink' },
      queued: { colors: { fill: '#e0e0e0', text: '#242424' }, animation: 'none' },
      out: { colors: { fill: '#bdbdbd', text: '#242424' }, animation: 'none' },
      waiting: { colors: { fill: '#ebebeb', text: '#424242' }, animation: 'none' },
    },
  },
  teams: {
    colors: {
      c1: { fill: '#0f6cbd', onFill: '#ffffff' },
      c2: { fill: '#c50f1f', onFill: '#ffffff' },
      c3: { fill: '#107c10', onFill: '#ffffff' },
      c4: { fill: '#5c2e91', onFill: '#ffffff' },
      c5: { fill: '#fde300', onFill: '#242424' },
      c6: { fill: '#005b70', onFill: '#ffffff' },
      c7: { fill: '#bf0077', onFill: '#ffffff' },
      c8: { fill: '#f7630c', onFill: '#242424' },
    },
    icons: {
      circle: circleIcon,
      square: squareIcon,
      triangle: triangleIcon,
      diamond: diamondIcon,
      generic: genericIcon,
    },
    fallback: {
      color: { fill: '#616161', onFill: '#ffffff' },
      icon: genericIcon,
    },
  },
  numbers: { scoreDigits: 0 },
};

export default defaultPack;
