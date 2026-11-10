import { describe, expect, it, vi } from 'vitest';
import { deferred } from '@/test/deferred';
import { Command } from './Command';

describe('Command', () => {
  it('is running until the action finishes, then reports success', async () => {
    const action = deferred<void>();
    const command = new Command(() => action.promise);

    const run = command.run();
    expect(command.isRunning).toBe(true);

    action.resolve();
    expect(await run).toBe(true);
    expect(command.isRunning).toBe(false);
  });

  it('passes its arguments to the action', async () => {
    const action = vi.fn((name: string, count: number) => Promise.resolve(`${name}${count}`));
    const command = new Command(action);

    await command.run('Team', 2);

    expect(action).toHaveBeenCalledWith('Team', 2);
  });

  it('ignores a second run while the first is still running', async () => {
    const action = deferred<void>();
    const execute = vi.fn(() => action.promise);
    const command = new Command(execute);

    const first = command.run();
    const second = command.run();
    action.resolve();

    expect(await second).toBe(false);
    expect(await first).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('turns a rejection into error state instead of rejecting', async () => {
    const command = new Command(() => Promise.reject(new Error('That name is taken.')));

    const succeeded = await command.run();

    expect(succeeded).toBe(false);
    expect(command.error?.message).toBe('That name is taken.');
    expect(command.isRunning).toBe(false);
  });

  it('catches an action that throws before returning a promise', async () => {
    const command = new Command(() => {
      throw new Error('sync failure');
    });

    expect(await command.run()).toBe(false);
    expect(command.error?.message).toBe('sync failure');
  });

  it('wraps a thrown non-Error so the view always has a message', async () => {
    const command = new Command(() => Promise.reject('plain text'));

    await command.run();

    expect(command.error).toBeInstanceOf(Error);
    expect(command.error?.message).toBe('plain text');
  });

  it('clears the previous error when it runs again', async () => {
    const execute = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('first')).mockResolvedValue();
    const command = new Command(execute);
    await command.run();

    const run = command.run();
    expect(command.error).toBeUndefined();
    await run;
    expect(command.error).toBeUndefined();
  });

  it('can be run again after it finished', async () => {
    const execute = vi.fn(() => Promise.resolve());
    const command = new Command(execute);

    await command.run();
    await command.run();

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
