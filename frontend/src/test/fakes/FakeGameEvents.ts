import type { GameEvents, Unsubscribe } from '@/realtime/GameEvents';

/** `GameEvents` the test drives by hand: `emitTeamsChanged()` and friends play the hub's messages. */
export class FakeGameEvents implements GameEvents {
  private readonly teamsChanged = new Set<() => void>();
  private readonly scoresChanged = new Set<() => void>();
  private readonly reconnected = new Set<() => void>();

  onTeamsChanged(callback: () => void): Unsubscribe {
    return subscribe(this.teamsChanged, callback);
  }

  onScoresChanged(callback: () => void): Unsubscribe {
    return subscribe(this.scoresChanged, callback);
  }

  onReconnected(callback: () => void): Unsubscribe {
    return subscribe(this.reconnected, callback);
  }

  emitTeamsChanged(): void {
    this.teamsChanged.forEach((callback) => callback());
  }

  emitScoresChanged(): void {
    this.scoresChanged.forEach((callback) => callback());
  }

  emitReconnected(): void {
    this.reconnected.forEach((callback) => callback());
  }
}

function subscribe(listeners: Set<() => void>, callback: () => void): Unsubscribe {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
