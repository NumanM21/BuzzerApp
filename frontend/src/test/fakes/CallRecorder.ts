/**
 * What every in-memory API fake shares: a log of the calls made and a way to make the next one fail. Fakes hold one
 * and expose `calls` and `failNext`, so tests read the same on every fake.
 */
export class CallRecorder {
  readonly calls: string[] = [];

  private nextError: Error | undefined;

  failNext(error: Error): void {
    this.nextError = error;
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  /** Logs the call, then rejects if a failure was queued or if `action` throws; otherwise resolves with its result. */
  run<T>(call: string, action: () => T): Promise<T> {
    this.calls.push(call);
    const error = this.nextError;
    this.nextError = undefined;
    if (error) {
      return Promise.reject(error);
    }
    try {
      return Promise.resolve(action());
    } catch (reason) {
      return Promise.reject(reason);
    }
  }
}
