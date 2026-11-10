import type { JoinCodeMemory } from '@/domain/joinCodeMemory';

const STORAGE_KEY = 'buzzer.joinCode';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * `JoinCodeMemory` over `localStorage`. The code is only a convenience, so a browser that refuses storage (a private
 * window, blocked site data, a full disk) must never stop anyone joining: every failure is swallowed and the code is
 * simply not remembered. `getStorage` is a function because merely reading `window.localStorage` can throw.
 */
export class BrowserJoinCodeMemory implements JoinCodeMemory {
  private readonly getStorage: () => StorageLike;

  constructor(getStorage: () => StorageLike = () => window.localStorage) {
    this.getStorage = getStorage;
  }

  recall(): string | undefined {
    try {
      const code = this.getStorage().getItem(STORAGE_KEY)?.trim();
      return code ? code : undefined;
    } catch {
      return undefined;
    }
  }

  remember(code: string): void {
    try {
      this.getStorage().setItem(STORAGE_KEY, code.trim());
    } catch {
      // Not remembered; the next visit starts with an empty code box.
    }
  }
}
