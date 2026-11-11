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

  // The server compares upper-cased names (.NET's OrdinalIgnoreCase). The characters between "Z" and "a" in the code
  // table ("_", "[", "^" and a few more) sort after every letter that way, and before every letter if names were
  // lower-cased instead; the Teams screen (the server's order) and the admin's player list must agree.
  it.each([
    [['_zed', 'amy', 'Bo'], ['amy', 'Bo', '_zed']],
    [['[tag] Al', 'Zoe', 'al'], ['al', 'Zoe', '[tag] Al']],
    [['^up', 'x', 'X-ray'], ['x', 'X-ray', '^up']],
  ])('orders %j as the server does', (names, expected) => {
    expect([...names].sort(compareNames)).toEqual(expected);
  });

  it('puts a prefix before the longer name', () => {
    expect(compareNames('Ann', 'Anna')).toBeLessThan(0);
  });
});
