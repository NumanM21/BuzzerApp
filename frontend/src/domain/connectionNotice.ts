/** The live connection as a person would describe it. Same words as the realtime layer's `ConnectionState`. */
export type ConnectionName = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const notices: Record<Exclude<ConnectionName, 'connected'>, string> = {
  connecting: 'Connecting to the game…',
  reconnecting: 'Connection lost. Reconnecting…',
  disconnected: 'Not connected to the game',
};

/** What to tell a person when the connection isn't up; `undefined` while it is. One wording for every screen. */
export function connectionNoticeFor(state: ConnectionName): string | undefined {
  return state === 'connected' ? undefined : notices[state];
}
