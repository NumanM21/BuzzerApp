/**
 * Every look the buzzer can have. The list exists at runtime as well as a type so that the theme contract test and
 * the preview page can go over every state; the rule that picks one for a snapshot arrives in F4.
 */
export const buzzerVisualStates = ['ready', 'yourTeamUp', 'queued', 'out', 'waiting'] as const;

export type BuzzerVisualState = (typeof buzzerVisualStates)[number];
