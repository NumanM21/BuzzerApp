import { describe, expect, it } from 'vitest';
import { defaultCopy, mergeCopy } from './defaultCopy';

describe('mergeCopy', () => {
  it('is the default copy when a pack has none', () => {
    expect(mergeCopy(undefined)).toEqual(defaultCopy);
  });

  it('replaces only the keys a pack gives', () => {
    const copy = mergeCopy({ buzzerReady: 'PRESS START' });

    expect(copy.buzzerReady).toBe('PRESS START');
    expect(copy.buzzerOut).toBe(defaultCopy.buzzerOut);
  });

  it('ignores empty text so a label is never blank', () => {
    expect(mergeCopy({ buzzerReady: '' }).buzzerReady).toBe(defaultCopy.buzzerReady);
  });
});
