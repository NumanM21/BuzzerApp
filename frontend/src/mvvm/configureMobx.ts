import { configure } from 'mobx';

/**
 * Called once by `main.tsx` and once by the test setup, so the app and the tests run under the same rules.
 * `enforceActions: 'always'` makes MobX warn whenever observable state changes outside an action, which is how a
 * forgotten `runInAction` after an `await` shows up (the test setup turns that warning into a failure).
 */
export function configureMobx(): void {
  configure({ enforceActions: 'always' });
}
