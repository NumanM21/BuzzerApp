import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { isApiError } from './isApiError';

describe('isApiError', () => {
  it('recognises an ApiError', () => {
    expect(isApiError(ApiError.network())).toBe(true);
  });

  it.each([new Error('plain'), new TypeError('x'), 'a string', undefined, null, { kind: 'network' }])(
    'rejects %j',
    (value) => {
      expect(isApiError(value)).toBe(false);
    },
  );
});
