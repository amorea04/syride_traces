import { describe, expect, it } from 'vitest';
import { daysInMonth, nextIsoDay, weekdayOfIso } from '@/lib/isoDay';

describe('isoDay', () => {
  it('lendemain, fin de mois et d’année, bissextile', () => {
    expect(nextIsoDay('2024-02-28')).toBe('2024-02-29');
    expect(nextIsoDay('2023-02-28')).toBe('2023-03-01');
    expect(nextIsoDay('2023-12-31')).toBe('2024-01-01');
  });
  it('jour de la semaine, lundi = 0', () => {
    expect(weekdayOfIso('2024-01-01')).toBe(0);
    expect(weekdayOfIso('2024-01-07')).toBe(6);
    expect(weekdayOfIso('1970-01-01')).toBe(3);
  });
  it('jours du mois', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2023, 12)).toBe(31);
  });
});
