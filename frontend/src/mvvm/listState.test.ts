import { describe, expect, it } from 'vitest';
import { deferred } from '@/test/deferred';
import { Loadable } from './Loadable';
import { listStateOf } from './listState';

describe('listStateOf', () => {
  it('is loading before and during the first load', async () => {
    const pending = deferred<number[]>();
    const list = new Loadable(() => pending.promise);
    expect(listStateOf(list)).toBe('loading');
    const loading = list.load();
    expect(listStateOf(list)).toBe('loading');
    pending.resolve([1]);
    await loading;
    expect(listStateOf(list)).toBe('ready');
  });

  it('is empty for an empty list', async () => {
    const list = new Loadable(() => Promise.resolve<number[]>([]));
    await list.load();
    expect(listStateOf(list)).toBe('empty');
  });

  it('is an error when the first load failed', async () => {
    const list = new Loadable<number[]>(() => Promise.reject(new Error('down')));
    await list.load();
    expect(listStateOf(list)).toBe('error');
  });

  it('stays ready on stale data when a reload fails', async () => {
    let fail = false;
    const list = new Loadable<number[]>(() => (fail ? Promise.reject(new Error('down')) : Promise.resolve([1, 2])));
    await list.load();
    fail = true;
    await list.load();
    expect(list.status).toBe('error');
    expect(listStateOf(list)).toBe('ready');
  });
});
