/** The live connection as a person would describe it. `realtime/types.ts` re-exports it for the connection itself. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const notices: Record<Exclude<ConnectionState, 'connected'>, string> = {
  connecting: 'Connecting to the game…',
  reconnecting: 'Connection lost. Reconnecting…',
  disconnected: 'Not connected to the game',
};

/** What to tell a person when the connection isn't up; `undefined` while it is. One wording for every screen. */
export function connectionNoticeFor(state: ConnectionState): string | undefined {
  return state === 'connected' ? undefined : notices[state];
}
