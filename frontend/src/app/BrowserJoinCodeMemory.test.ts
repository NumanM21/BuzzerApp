import { describe, expect, it } from 'vitest';
import { BrowserJoinCodeMemory } from './BrowserJoinCodeMemory';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

const refusingStorage = () => {
  throw new DOMException('Storage is blocked', 'SecurityError');
};

describe('BrowserJoinCodeMemory', () => {
  it('has nothing to recall at first', () => {
    expect(new BrowserJoinCodeMemory(memoryStorage).recall()).toBeUndefined();
  });

  it('recalls what was remembered, trimmed', () => {
    const storage = memoryStorage();
    const memory = new BrowserJoinCodeMemory(() => storage);

    memory.remember('  CODE-1 ');

    expect(memory.recall()).toBe('CODE-1');
    expect(new BrowserJoinCodeMemory(() => storage).recall()).toBe('CODE-1');
  });

  it('treats a blank stored value as nothing', () => {
    const storage = memoryStorage();
    storage.setItem('buzzer.joinCode', '   ');
    expect(new BrowserJoinCodeMemory(() => storage).recall()).toBeUndefined();
  });

  it('never throws when the browser refuses storage', () => {
    const memory = new BrowserJoinCodeMemory(refusingStorage);

    expect(() => memory.remember('CODE')).not.toThrow();
    expect(memory.recall()).toBeUndefined();
  });

  it('never throws when a read or write on the storage itself fails', () => {
    const memory = new BrowserJoinCodeMemory(() => ({
      getItem: () => {
        throw new Error('read failed');
      },
      setItem: () => {
        throw new Error('quota exceeded');
      },
    }));

    expect(() => memory.remember('CODE')).not.toThrow();
    expect(memory.recall()).toBeUndefined();
  });
});
