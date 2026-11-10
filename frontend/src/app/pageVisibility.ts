import type { Unsubscribe } from '@/realtime/GameEvents';

/** "The person is looking at the app again": the phone was unlocked, or the tab came back to the front. */
export interface PageVisibility {
  onVisible(callback: () => void): Unsubscribe;
}

/** The browser's `visibilitychange` event. */
export const browserPageVisibility: PageVisibility = {
  onVisible(callback) {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        callback();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
};
