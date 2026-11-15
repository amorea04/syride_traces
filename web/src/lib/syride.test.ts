import { describe, expect, it } from 'vitest';
import { syrideFlightUrl, syridePilotUrl } from '@/lib/syride';

describe('liens Syride', () => {
  it('pseudo simple', () => {
    expect(syrideFlightUrl('j2f', 1234)).toBe('https://www.syride.com/fr/pilotes/j2f/1234');
    expect(syridePilotUrl('j2f')).toBe('https://www.syride.com/fr/pilotes/j2f');
  });

  it('encode espaces, accents et esperluette', () => {
    expect(syridePilotUrl('Tof Torsac')).toBe('https://www.syride.com/fr/pilotes/Tof%20Torsac');
    expect(syridePilotUrl('Rémydu24')).toBe('https://www.syride.com/fr/pilotes/R%C3%A9mydu24');
    expect(syrideFlightUrl('A&B/c', 7)).toBe('https://www.syride.com/fr/pilotes/A%26B%2Fc/7');
  });
});
