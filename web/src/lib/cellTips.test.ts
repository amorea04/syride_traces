import { describe, expect, it } from 'vitest';
import {
  calendarDayTip,
  daySites,
  dumbbellPointTip,
  hourHeading,
  hourSlot,
  matrixCellTip,
  nearestInDirection,
  quarterCellTip,
  ribbonCellTip,
  tipPlacement,
} from '@/lib/cellTips';
import { makeFlight } from '../../tests/flightFactory';

describe('infobulles', () => {
  it('tranche horaire et en-tête de colonne avec espaces insécables', () => {
    expect(hourSlot(14)).toBe('entre 14 h et 15 h');
    expect(hourHeading(8)).toBe('8 h');
  });
  it('case de matrice : mois ou jour, tranche horaire, vols et durée', () => {
    const t = matrixCellTip('août', 14, 3, 130);
    expect(t.title).toBe('Août, entre 14 h et 15 h');
    expect(t.lines[0]).toContain('3 vols');
    expect(t.lines[0]).toContain('2 h');
    expect(matrixCellTip('samedi', 9, 0, 0).lines).toEqual(['Aucun vol']);
    expect(matrixCellTip('mai', 9, 1, null).lines).toEqual(['1 vol']);
  });
  it('jour du calendrier : date, vols, durée, disciplines, sites et clic', () => {
    const day = { date: '2025-06-12', n: 2, minutes: 80, disciplines: ['paramoteur', 'parapente'] };
    const t = calendarDayTip('2025-06-12', day, ['Montbron', 'Roche']);
    expect(t.title).toMatch(/^Jeudi 12\sjuin\s2025$/);
    expect(t.lines.join('|')).toContain('2 vols');
    expect(t.lines.join('|')).toContain('Paramoteur et Parapente');
    expect(t.lines.join('|')).toContain('Montbron, Roche');
    expect(t.hint).toBe('Clic : fiche du jour');
    const empty = calendarDayTip('2025-06-13', undefined);
    expect(empty.lines).toEqual(['Aucun vol']);
    expect(empty.hint).toBeUndefined();
  });
  it('sites du jour : le plus fréquenté d’abord', () => {
    const m = daySites([
      makeFlight('2025-06-12', { site: 'B' }),
      makeFlight('2025-06-12', { site: 'A' }),
      makeFlight('2025-06-12', { site: 'A' }),
    ]);
    expect(m.get('2025-06-12')).toEqual(['A', 'B']);
  });
  it('ruban, frise, haltère', () => {
    expect(ribbonCellTip('Aile', 2025, 6, 2, 90).lines[0]).toBe('Juin 2025');
    expect(quarterCellTip('Aile', 2025, 1, 3).lines).toEqual(['1ᵉʳ trimestre 2025', '3 vols']);
    expect(dumbbellPointTip('Alice', 'Vols', '12')).toEqual({ title: 'Alice', lines: ['Vols : 12'] });
  });
});

describe('géométrie', () => {
  const grid = [
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 12, y: 0, width: 10, height: 10 },
    { x: 0, y: 12, width: 10, height: 10 },
    { x: 12, y: 12, width: 10, height: 10 },
  ];
  it('case voisine dans chaque direction', () => {
    expect(nearestInDirection(grid, 0, 'right')).toBe(1);
    expect(nearestInDirection(grid, 0, 'down')).toBe(2);
    expect(nearestInDirection(grid, 3, 'left')).toBe(2);
    expect(nearestInDirection(grid, 3, 'up')).toBe(1);
    expect(nearestInDirection(grid, 0, 'left')).toBeNull();
    expect(nearestInDirection(grid, 9, 'left')).toBeNull();
  });
  it('bulle sous la case, au-dessus en bas d’écran, dans l’écran à gauche', () => {
    const vp = { width: 400, height: 300 };
    const tip = { width: 100, height: 40 };
    expect(tipPlacement({ x: 0, y: 10, width: 10, height: 10 }, tip, vp).left).toBe(6);
    expect(tipPlacement({ x: 200, y: 10, width: 10, height: 10 }, tip, vp).top).toBe(28);
    expect(tipPlacement({ x: 200, y: 280, width: 10, height: 10 }, tip, vp).top).toBe(232);
  });
});
