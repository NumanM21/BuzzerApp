import type { Unsubscribe } from './GameEvents';

/** The callbacks subscribed to one kind of message. */
export class ListenerSet<T = void> {
  private readonly listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    // A copy: a listener that unsubscribes (or subscribes) while being called must not disturb this round of calls.
    [...this.listeners].forEach((listener) => listener(value));
  }
}
