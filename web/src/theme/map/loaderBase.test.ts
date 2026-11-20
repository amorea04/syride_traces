import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => ({ Map: class {}, setWorkerUrl: vi.fn() }));

import { FALLBACK_STYLE, loadMap } from '@/theme/map/loader';

afterEach(() => vi.unstubAllGlobals());

describe('loadMap : fond injoignable', () => {
  it('crée la carte avec le fond de secours et le signale', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const onBaseFailed = vi.fn();
    const base = await new Promise((resolve) =>
      loadMap({
        scheme: () => 'light',
        onReady: (_ml, b) => resolve(b),
        onBaseFailed,
        onMapLibreFailed: () => resolve(null),
      }),
    );
    expect(base).toBe(FALLBACK_STYLE);
    expect(onBaseFailed).toHaveBeenCalledOnce();
  });
});
