import type { PageVisibility } from '@/app/pageVisibility';
import { ListenerSet } from '@/realtime/ListenerSet';
import type { Unsubscribe } from '@/realtime/GameEvents';

/** `PageVisibility` the test drives: `becomeVisible()` plays the phone being unlocked. */
export class FakePageVisibility implements PageVisibility {
  private readonly visible = new ListenerSet();

  onVisible(callback: () => void): Unsubscribe {
    return this.visible.add(callback);
  }

  becomeVisible(): void {
    this.visible.emit();
  }
}
