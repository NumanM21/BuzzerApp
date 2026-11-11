import { describe, expect, it } from 'vitest';
import { compareNames } from './names';

describe('compareNames', () => {
  it('ignores case', () => {
    expect(compareNames('alice', 'Alice')).toBe(0);
    expect(compareNames('bob', 'Alice')).toBeGreaterThan(0);
    expect(compareNames('Alice', 'bob')).toBeLessThan(0);
  });

  it('sorts a list the same way whatever the case', () => {
    const sorted = ['bea', 'Ada', 'cy', 'ABE', 'Bo'].sort(compareNames);
    expect(sorted).toEqual(['ABE', 'Ada', 'bea', 'Bo', 'cy']);
  });

  it('puts a prefix before the longer name', () => {
    expect(compareNames('Ann', 'Anna')).toBeLessThan(0);
  });
});
