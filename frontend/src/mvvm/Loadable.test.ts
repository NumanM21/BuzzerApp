import { describe, expect, it, vi } from 'vitest';
import { deferred, type Deferred } from '@/test/deferred';
import { Loadable } from './Loadable';

/** A Loadable whose every fetch waits for the test to settle it, in any order. */
function controlledLoadable() {
  const calls: Deferred<string>[] = [];
  const loadable = new Loadable(() => {
    const call = deferred<string>();
    calls.push(call);
    return call.promise;
  });
  return { loadable, calls };
}

describe('Loadable', () => {
  it('starts idle with no value', () => {
    const loadable = new Loadable(() => Promise.resolve(1));

    expect(loadable.status).toBe('idle');
    expect(loadable.value).toBeUndefined();
    expect(loadable.error).toBeUndefined();
  });

  it('is loading while the fetch runs, then ready with its value', async () => {
    const { loadable, calls } = controlledLoadable();

    const load = loadable.load();
    expect(loadable.status).toBe('loading');
    expect(loadable.isLoading).toBe(true);

    calls[0].resolve('first');
    await load;

    expect(loadable.status).toBe('ready');
    expect(loadable.value).toBe('first');
  });

  it('keeps the previous value while a reload runs', async () => {
    const { loadable, calls } = controlledLoadable();
    const first = loadable.load();
    calls[0].resolve('first');
    await first;

    const reload = loadable.load();

    expect(loadable.status).toBe('loading');
    expect(loadable.value).toBe('first');
    calls[1].resolve('second');
    await reload;
    expect(loadable.value).toBe('second');
  });

  it('lets the load started last win when an earlier one answers later', async () => {
    const { loadable, calls } = controlledLoadable();
    const early = loadable.load();
    const late = loadable.load();

    calls[1].resolve('newer');
    await late;
    calls[0].resolve('older');
    await early;

    expect(loadable.value).toBe('newer');
    expect(loadable.status).toBe('ready');
  });

  it('stays loading when an earlier load finishes before the latest one', async () => {
    const { loadable, calls } = controlledLoadable();
    const early = loadable.load();
    void loadable.load();

    calls[0].resolve('older');
    await early;

    expect(loadable.status).toBe('loading');
    expect(loadable.value).toBeUndefined();
  });

  it('ignores the failure of a load that a newer one replaced', async () => {
    const { loadable, calls } = controlledLoadable();
    const early = loadable.load();
    const late = loadable.load();
    calls[1].resolve('newer');
    await late;

    calls[0].reject(new Error('old failure'));
    await early;

    expect(loadable.status).toBe('ready');
    expect(loadable.error).toBeUndefined();
  });

  it('turns a failure into error state and keeps the old value', async () => {
    const { loadable, calls } = controlledLoadable();
    const first = loadable.load();
    calls[0].resolve('first');
    await first;

    const reload = loadable.load();
    calls[1].reject(new Error('Server unavailable'));
    await reload;

    expect(loadable.status).toBe('error');
    expect(loadable.error?.message).toBe('Server unavailable');
    expect(loadable.value).toBe('first');
  });

  it('clears the error after a later success', async () => {
    const { loadable, calls } = controlledLoadable();
    const failing = loadable.load();
    calls[0].reject(new Error('down'));
    await failing;

    const retry = loadable.load();
    calls[1].resolve('back');
    await retry;

    expect(loadable.error).toBeUndefined();
    expect(loadable.status).toBe('ready');
  });

  it('ensureLoaded joins a running load instead of starting another', async () => {
    const fetcher = vi.fn(() => Promise.resolve('value'));
    const loadable = new Loadable(fetcher);

    await Promise.all([loadable.ensureLoaded(), loadable.ensureLoaded()]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadable.value).toBe('value');
  });

  it('ensureLoaded does nothing once a value is loaded', async () => {
    const fetcher = vi.fn(() => Promise.resolve('value'));
    const loadable = new Loadable(fetcher);
    await loadable.load();

    await loadable.ensureLoaded();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ensureLoaded retries after an error', async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up');
    const loadable = new Loadable(fetcher);
    await loadable.ensureLoaded();
    expect(loadable.status).toBe('error');

    await loadable.ensureLoaded();

    expect(loadable.value).toBe('up');
  });

  it('ensureLoaded retries after a fetcher that threw before returning a promise', async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => {
        throw new Error('sync failure');
      })
      .mockResolvedValue('up');
    const loadable = new Loadable(fetcher);
    await loadable.ensureLoaded();

    await loadable.ensureLoaded();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(loadable.value).toBe('up');
  });

  describe('reloadIfRequested', () => {
    it('does nothing while nobody has asked for the data', async () => {
      const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue('value');
      const loadable = new Loadable(fetcher);

      await loadable.reloadIfRequested();

      expect(fetcher).not.toHaveBeenCalled();
      expect(loadable.status).toBe('idle');
    });

    it('reloads data that was loaded', async () => {
      const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('old').mockResolvedValue('new');
      const loadable = new Loadable(fetcher);
      await loadable.load();

      await loadable.reloadIfRequested();

      expect(loadable.value).toBe('new');
    });

    it('retries data whose last load failed', async () => {
      const fetcher = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up');
      const loadable = new Loadable(fetcher);
      await loadable.load();

      await loadable.reloadIfRequested();

      expect(loadable.value).toBe('up');
    });
  });

  describe('reset', () => {
    it('forgets the value and the error', async () => {
      const loadable = new Loadable(() => Promise.resolve('value'));
      await loadable.load();

      loadable.reset();

      expect(loadable.status).toBe('idle');
      expect(loadable.value).toBeUndefined();
      expect(loadable.error).toBeUndefined();
    });

    it('drops a load that is still running, so a late answer cannot bring the data back', async () => {
      const { loadable, calls } = controlledLoadable();
      const load = loadable.load();

      loadable.reset();
      calls[0].resolve('late');
      await load;

      expect(loadable.status).toBe('idle');
      expect(loadable.value).toBeUndefined();
    });

    it('loads again afterwards', async () => {
      const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue('value');
      const loadable = new Loadable(fetcher);
      await loadable.load();
      loadable.reset();

      await loadable.ensureLoaded();

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(loadable.value).toBe('value');
    });
  });
});
