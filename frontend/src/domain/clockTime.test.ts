import { describe, expect, it } from 'vitest';
import { formatClockTime } from './clockTime';

describe('formatClockTime', () => {
  it('shows the hour and minute in the zone asked for', () => {
    expect(formatClockTime('2030-01-01T20:05:00.000Z', { locale: 'en-GB', timeZone: 'UTC' })).toBe('20:05');
    expect(formatClockTime('2030-01-01T20:05:00.000Z', { locale: 'en-GB', timeZone: 'Asia/Karachi' })).toBe('01:05');
  });

  it('reads something that is not a date as nothing', () => {
    expect(formatClockTime('')).toBe('');
    expect(formatClockTime('not a date')).toBe('');
  });
});
