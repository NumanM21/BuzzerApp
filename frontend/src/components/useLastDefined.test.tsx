import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLastDefined } from './useLastDefined';

describe('useLastDefined', () => {
  it('is undefined until there has been a value', () => {
    const { result } = renderHook(({ value }) => useLastDefined(value), { initialProps: { value: undefined as string | undefined } });

    expect(result.current).toBeUndefined();
  });

  it('follows the value while there is one', () => {
    const { result, rerender } = renderHook(({ value }) => useLastDefined(value), { initialProps: { value: 'first' as string | undefined } });
    expect(result.current).toBe('first');

    rerender({ value: 'second' });

    expect(result.current).toBe('second');
  });

  it('keeps the last value once it is gone, so a closing dialog still has its content', () => {
    const { result, rerender } = renderHook(({ value }) => useLastDefined(value), { initialProps: { value: 'open' as string | undefined } });

    rerender({ value: undefined });
    expect(result.current).toBe('open');

    rerender({ value: undefined });
    expect(result.current).toBe('open');
  });

  it('takes the next value after a gap (another dialog opens)', () => {
    const { result, rerender } = renderHook(({ value }) => useLastDefined(value), { initialProps: { value: 'one' as string | undefined } });
    rerender({ value: undefined });

    rerender({ value: 'two' });

    expect(result.current).toBe('two');
  });

  it('keeps the same object, not a copy (a dialog keeps its own view model)', () => {
    const viewModel = { name: 'the dialog' };
    const { result, rerender } = renderHook(({ value }) => useLastDefined(value), {
      initialProps: { value: viewModel as { name: string } | undefined },
    });

    rerender({ value: undefined });

    expect(result.current).toBe(viewModel);
  });
});
