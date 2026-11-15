/** Polyfills jsdom nécessaires à Mantine (matchMedia, ResizeObserver, scrollIntoView). À importer avant le rendu. */
import { vi } from 'vitest';

export function installDomMocks(options: { mobile?: boolean } = {}): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: options.mobile === true && query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
}
