import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import { toError } from './toError';

/**
 * An async action behind a button, like an `ICommand` in C# MVVM.
 *
 * - `isRunning` lets the view disable the button and show progress.
 * - A second `run` while one is running is ignored, so a double tap can't submit twice.
 * - A failure becomes `error` and `run` resolves to `false`. It never rejects, so a view never needs try/catch and
 *   nothing ends up as an unhandled rejection.
 *
 * `run` resolves to `true` when the action finished, so a view model can follow up ("close the dialog").
 */
export class Command<TArgs extends unknown[] = []> {
  isRunning = false;
  error: Error | undefined = undefined;

  private readonly execute: (...args: TArgs) => Promise<unknown>;

  constructor(execute: (...args: TArgs) => Promise<unknown>) {
    this.execute = execute;
    makeAutoObservable<Command<TArgs>, 'execute'>(
      this,
      { error: observableRef, execute: false },
      { autoBind: true },
    );
  }

  async run(...args: TArgs): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }
    this.isRunning = true;
    this.error = undefined;
    try {
      await this.execute(...args);
      runInAction(() => {
        this.isRunning = false;
      });
      return true;
    } catch (reason) {
      runInAction(() => {
        this.error = toError(reason);
        this.isRunning = false;
      });
      return false;
    }
  }

  clearError(): void {
    this.error = undefined;
  }
}
