import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => {
  throw new Error('chunk injoignable');
});

import { loadMap } from '@/theme/map/loader';

afterEach(() => vi.restoreAllMocks());

describe('loadMap', () => {
  it('signale l’échec de MapLibre sans rejet non géré ni création de carte', async () => {
    const onReady = vi.fn();
    const onBaseFailed = vi.fn();
    const failed = new Promise<void>((resolve) =>
      loadMap({ scheme: () => 'light', onReady, onBaseFailed, onMapLibreFailed: resolve }),
    );
    await failed;
    expect(onReady).not.toHaveBeenCalled();
    expect(onBaseFailed).not.toHaveBeenCalled();
  });
});
