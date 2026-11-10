import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/vt323/latin-ext-400.css';
import type { ThemePack } from '@/theme/types';
import afkAllstarsIcon from './icons/afk-allstars.png';
import cheatCodesIcon from './icons/cheat-codes.png';
import defaultIcon from './icons/default.svg';
import payToWinIcon from './icons/pay-to-win.png';
import rageQuittersIcon from './icons/rage-quitters.png';
import rngLoversIcon from './icons/rng-lovers.png';
import smurfsIcon from './icons/smurfs.png';

// The artwork's two extremes (PlanMVP §9.3): the page and ink are one colour, text and borders the other.
const ink = '#111111';
const offWhite = '#F2F2F2';

// A hard offset with no blur. Black would vanish on a near-black page, so it is a dark grey.
const hardShadow = '4px 4px 0 #3A3A3A';

// Press Start 2P is a wide pixel font drawn on an 8px grid: it is crisp at multiples of 8 and every glyph is a full
// em wide. VT323 is narrow and small for its size, so Fluent's body sizes are raised to keep it readable on a phone.
const headingFont = "'Press Start 2P', 'Courier New', monospace";
const bodyFont = "'VT323', 'Courier New', monospace";

/**
 * 2026 "Sully's 5th Annual Games Night": an 80s arcade cabinet. Dark, flat colours, square corners, chunky borders and
 * a hard shadow. Deliberately not neon: no glow, gradients or chrome, and the chrome is grey so that the six team
 * colours (which cover the whole hue wheel) are the only strong colours on screen.
 */
const arcade2026Pack: ThemePack = {
  key: 'arcade-2026',
  fluent: {
    mode: 'dark',
    // Neutral greys: Fluent paints links, focus rings and selected controls from this ramp, and none of that may look
    // like a team.
    brand: {
      10: '#0A0A0A',
      20: '#141414',
      30: '#1E1E1E',
      40: '#2B2B2B',
      50: '#3A3A3A',
      60: '#4D4D4D',
      70: '#666666',
      80: '#7A7A7A',
      90: '#9A9A9A',
      100: '#B8B8B8',
      110: '#CCCCCC',
      120: '#D9D9D9',
      130: '#E4E4E4',
      140: '#EDEDED',
      150: offWhite,
      160: '#F9F9F9',
    },
    overrides: {
      // Square corners everywhere. `borderRadiusCircular` stays: radio buttons and switches must still look like what
      // they are.
      borderRadiusNone: '0',
      borderRadiusSmall: '0',
      borderRadiusMedium: '0',
      borderRadiusLarge: '0',
      borderRadiusXLarge: '0',
      borderRadius2XLarge: '0',
      borderRadius3XLarge: '0',
      borderRadius4XLarge: '0',
      borderRadius5XLarge: '0',
      borderRadius6XLarge: '0',

      // Chunky outlines on Fluent's own controls, and visible ones: Fluent's dark default (#666) is too faint on #292929.
      strokeWidthThin: '2px',
      strokeWidthThick: '3px',
      strokeWidthThicker: '4px',
      strokeWidthThickest: '6px',
      colorNeutralStroke1: '#9E9E9E',
      colorNeutralStroke1Hover: '#BDBDBD',
      colorNeutralStroke1Pressed: '#D9D9D9',

      // Primary buttons and checked boxes: off-white with ink text, the cabinet's own two colours.
      colorBrandBackground: offWhite,
      colorBrandBackgroundHover: '#FFFFFF',
      colorBrandBackgroundPressed: '#BDBDBD',
      colorBrandBackgroundSelected: '#D9D9D9',
      colorNeutralForegroundOnBrand: ink,

      shadow2: hardShadow,
      shadow4: hardShadow,
      shadow8: hardShadow,
      shadow16: hardShadow,
      shadow28: hardShadow,
      shadow64: hardShadow,
      shadow2Brand: hardShadow,
      shadow4Brand: hardShadow,
      shadow8Brand: hardShadow,
      shadow16Brand: hardShadow,
      shadow28Brand: hardShadow,
      shadow64Brand: hardShadow,

      // Neither font has a bold: asking for one makes the browser smear the glyphs.
      fontWeightRegular: 400,
      fontWeightMedium: 400,
      fontWeightSemibold: 400,
      fontWeightBold: 400,

      fontSizeBase100: '14px',
      lineHeightBase100: '18px',
      fontSizeBase200: '16px',
      lineHeightBase200: '20px',
      fontSizeBase300: '20px',
      lineHeightBase300: '24px',
      fontSizeBase400: '22px',
      lineHeightBase400: '28px',
      fontSizeBase500: '24px',
      lineHeightBase500: '32px',
      // The buzzer label: 24px keeps "WAITING" (7 glyphs) inside the buzzer at 360px, where 40px fits five.
      fontSizeHero800: '24px',
      lineHeightHero800: '32px',
    },
  },
  surfaces: {
    page: ink,
    panel: '#1F1F1F',
    panelBorder: offWhite,
  },
  text: {
    body: offWhite,
    muted: '#B3B3B3',
  },
  border: { width: '4px', style: 'solid' },
  shadow: hardShadow,
  fonts: {
    heading: headingFont,
    body: bodyFont,
    numeric: headingFont,
  },
  buzzer: {
    radius: '50%',
    // The six team colours leave no hue for red/amber/green status colours, so the states differ by label, brightness
    // and animation: ready and "your team's up" glow in the player's team colour, the rest are greys of falling
    // brightness.
    states: {
      ready: { colors: 'team', animation: 'pulse' },
      yourTeamUp: { colors: 'team', animation: 'blink' },
      queued: { colors: { fill: '#5A5A5A', text: offWhite }, animation: 'none' },
      waiting: { colors: { fill: '#333333', text: offWhite }, animation: 'none' },
      out: { colors: { fill: '#1C1C1C', text: '#B3B3B3' }, animation: 'none' },
    },
  },
  teams: {
    colors: {
      // The six artwork colours, exact. Text is ink wherever it reaches 4.5:1; red needs white.
      red: { fill: '#D7263D', onFill: '#FFFFFF' },
      yellow: { fill: '#F5B700', onFill: ink },
      green: { fill: '#7FB800', onFill: ink },
      blue: { fill: '#2E8BC0', onFill: ink },
      purple: { fill: '#9B5DE5', onFill: ink },
      pink: { fill: '#E84A8A', onFill: ink },
      // Spares for teams an admin creates on the night, each a clear step away from the six.
      orange: { fill: '#EE6C1A', onFill: ink },
      teal: { fill: '#1FB5A5', onFill: ink },
      white: { fill: offWhite, onFill: ink },
    },
    icons: {
      'rage-quitters': rageQuittersIcon,
      'pay-to-win': payToWinIcon,
      'cheat-codes': cheatCodesIcon,
      smurfs: smurfsIcon,
      'afk-allstars': afkAllstarsIcon,
      'rng-lovers': rngLoversIcon,
      // A face with no background of its own: it takes the team's colour from the icon box, so it suits any colour.
      default: defaultIcon,
    },
    fallback: {
      color: { fill: '#8C8C8C', onFill: ink },
      icon: defaultIcon,
    },
  },
  numbers: { scoreDigits: 5 },
  // No scanlines: the contract only allows an opaque line colour, and one pixel line in three over VT323's one-pixel
  // strokes would erase letters. Add `effects: { scanlines: { color } }` here if a real screen shows it can work.
  copy: {
    buzzerReady: 'BUZZ!',
    buzzerYourTeamUp: "YOUR TEAM'S UP!",
    buzzerQueued: 'IN LINE',
    buzzerOut: 'OUT THIS ROUND',
    buzzerWaiting: 'WAITING FOR HOST',
    teamNoMembers: 'NO PLAYERS YET',
    teamYou: 'YOU',
  },
};

export default arcade2026Pack;
