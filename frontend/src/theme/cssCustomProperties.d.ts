import 'react';

// Lets a component pass a value from the pack as a CSS variable (`style={{ '--team-fill': fill }}`) without a cast.
// That is the one allowed use of inline `style`: the stylesheet itself stays in makeStyles.
declare module 'react' {
  interface CSSProperties {
    [variable: `--${string}`]: string | undefined;
  }
}
