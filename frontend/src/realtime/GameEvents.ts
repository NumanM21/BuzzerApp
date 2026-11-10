/** Stops listening. Every subscription returns one. */
export type Unsubscribe = () => void;

/**
 * What the stores need from the live connection: the hub's "this data changed" messages, and the moment the
 * connection came back after a drop (anything may have changed meanwhile). F4's `GameConnection` implements it.
 * Stores depend on this small interface, not on SignalR, so they are tested with a fake.
 */
export interface GameEvents {
  onTeamsChanged(callback: () => void): Unsubscribe;
  onScoresChanged(callback: () => void): Unsubscribe;
  onReconnected(callback: () => void): Unsubscribe;
}

/** Stands in until F4 supplies the real connection: nothing ever fires. */
export class NoGameEvents implements GameEvents {
  onTeamsChanged(): Unsubscribe {
    return () => {};
  }

  onScoresChanged(): Unsubscribe {
    return () => {};
  }

  onReconnected(): Unsubscribe {
    return () => {};
  }
}
