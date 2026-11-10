/**
 * Lets promise callbacks that are already due run to the end (an async chain needs one microtask turn per `await`),
 * without waiting on a real timer. Use it after settling a fake's promise when the code under test exposes no
 * promise to await.
 */
export async function flushPromises(turns = 10): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}
