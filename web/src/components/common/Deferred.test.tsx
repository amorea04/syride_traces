import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deferred } from '@/components/common/Deferred';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubObserver(): Callback[] {
  const callbacks: Callback[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  return callbacks;
}

describe('Deferred', () => {
  it('« near » : garde l’ancre puis monte le contenu à l’approche de l’écran', () => {
    const callbacks = stubObserver();
    const { container } = render(
      <Deferred id="bas" minHeight={300}>
        <p>contenu</p>
      </Deferred>,
    );
    expect(screen.queryByText('contenu')).toBeNull();
    expect(container.querySelector('#bas')).toHaveStyle({ minHeight: '300px' });
    act(() => callbacks[0]!([{ isIntersecting: true }]));
    expect(screen.getByText('contenu')).toBeInTheDocument();
    expect(container.querySelector('[data-deferred]')).toBeNull();
  });

  it('« background » : monte le contenu sans attendre l’écran', () => {
    stubObserver();
    render(
      <Deferred id="bas" minHeight={300} when="background">
        <p>contenu</p>
      </Deferred>,
    );
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it('sans IntersectionObserver, le contenu est monté tout de suite', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <Deferred id="bas" minHeight={300}>
        <p>contenu</p>
      </Deferred>,
    );
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });
});
