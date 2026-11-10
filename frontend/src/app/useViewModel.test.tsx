import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createTestServices } from '@/test/testServices';
import type { AppServices } from './AppServices';
import { AppServicesProvider } from './AppServicesProvider';
import { useViewModel, type ViewModel } from './useViewModel';

class RecordingViewModel implements ViewModel {
  readonly events: string[] = [];
  readonly services: AppServices;

  constructor(services: AppServices) {
    this.services = services;
  }

  activate(): void {
    this.events.push('activate');
  }

  dispose(): void {
    this.events.push('dispose');
  }
}

function wrapperFor(services: AppServices) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AppServicesProvider services={services}>{children}</AppServicesProvider>;
  };
}

describe('useViewModel', () => {
  it('builds the view model with the app services and activates it on mount', () => {
    const services = createTestServices();

    const { result } = renderHook(() => useViewModel((s) => new RecordingViewModel(s)), {
      wrapper: wrapperFor(services),
    });

    expect(result.current.services).toBe(services);
    expect(result.current.events).toEqual(['activate']);
  });

  it('keeps the same instance across re-renders', () => {
    const create = vi.fn((s: AppServices) => new RecordingViewModel(s));
    const { result, rerender } = renderHook(() => useViewModel(create), { wrapper: wrapperFor(createTestServices()) });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(first.events).toEqual(['activate']);
  });

  it('disposes the view model on unmount', () => {
    const { result, unmount } = renderHook(() => useViewModel((s) => new RecordingViewModel(s)), {
      wrapper: wrapperFor(createTestServices()),
    });

    unmount();

    expect(result.current.events).toEqual(['activate', 'dispose']);
  });

  it('survives StrictMode, which activates, disposes and activates again', () => {
    const { result } = renderHook(() => useViewModel((s) => new RecordingViewModel(s)), {
      wrapper: wrapperFor(createTestServices()),
      // StrictMode at the root, as in main.tsx. (A <StrictMode> inside the wrapper did not replay the effects here.)
      reactStrictMode: true,
    });

    expect(result.current.events).toEqual(['activate', 'dispose', 'activate']);
  });

  it('works with a view model that has no lifecycle methods', () => {
    const { result } = renderHook(() => useViewModel(() => ({ title: 'plain' })), {
      wrapper: wrapperFor(createTestServices()),
    });

    expect(result.current.title).toBe('plain');
  });
});
