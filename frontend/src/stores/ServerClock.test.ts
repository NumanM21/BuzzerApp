import { describe, expect, it } from 'vitest';
import { ServerClock } from './ServerClock';

function setup(startMs: number) {
  const phone = { nowMs: startMs };
  const clock = new ServerClock(() => phone.nowMs);
  return { phone, clock };
}

const serverAt = (ms: number) => new Date(ms).toISOString();

describe('ServerClock', () => {
  it("is the phone's clock until the first snapshot", () => {
    const { clock } = setup(1_000_000);

    expect(clock.now()).toBe(1_000_000);
    expect(clock.offsetMs).toBe(0);
  });

  it.each([
    ['behind', 90_000],
    ['ahead', -45_500],
  ])('corrects a phone that is %s of the server', (_, phoneErrorMs) => {
    const serverMs = Date.UTC(2030, 0, 1, 20, 0, 0);
    const { phone, clock } = setup(serverMs - phoneErrorMs);

    clock.sync(serverAt(serverMs));
    phone.nowMs += 2_500;

    expect(clock.now()).toBe(serverMs + 2_500);
    expect(clock.offsetMs).toBe(phoneErrorMs);
  });

  it('follows the latest snapshot', () => {
    const { phone, clock } = setup(0);
    clock.sync(serverAt(5_000));

    phone.nowMs = 10_000;
    clock.sync(serverAt(10_200));

    expect(clock.offsetMs).toBe(200);
  });

  it('ignores a time it cannot read', () => {
    const { clock } = setup(0);
    clock.sync(serverAt(5_000));

    clock.sync('not a date');

    expect(clock.offsetMs).toBe(5_000);
  });
});
