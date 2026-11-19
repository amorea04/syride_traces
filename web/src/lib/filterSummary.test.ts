import { describe, expect, it } from 'vitest';
import { defaultFilters } from '@/lib/filters';
import { filterSummary } from '@/lib/filterSummary';

const names = { pilot: (s: string) => `P:${s}`, site: (i: number) => `S:${i}` };

describe('filterSummary', () => {
  it('années : « 2023 et 2025 », omises avec la dimension période', () => {
    const f = { ...defaultFilters(), years: [2025, 2023] };
    expect(filterSummary(f, names)).toEqual(['2023 et 2025']);
    expect(filterSummary({ ...f, years: [2025, 2022, 2023] }, names)).toEqual(['2022, 2023 et 2025']);
    expect(filterSummary(f, names, ['period'])).toEqual([]);
  });
  it('est vide sans filtre', () => {
    expect(filterSummary(defaultFilters(), names)).toEqual([]);
  });
  it('affiche les noms d’affichage, jamais les identifiants bruts', () => {
    const f = { ...defaultFilters(), pilots: ['x'], sites: [3], activity: 'paramoteur' as const };
    expect(filterSummary(f, names)).toEqual(['P:x', 'paramoteur', 'S:3']);
  });
  it('liste jusqu’à deux noms puis décompte', () => {
    const two = { ...defaultFilters(), pilots: ['a', 'b'], sites: [1, 2], wings: ['W1', 'W2'] };
    expect(filterSummary(two, names)).toEqual(['P:a et P:b', 'W1 et W2', 'S:1 et S:2']);
    const three = {
      ...defaultFilters(),
      pilots: ['a', 'b', 'c'],
      sites: [1, 2, 3],
      wings: ['W1', 'W2', 'W3'],
    };
    expect(filterSummary(three, names)).toEqual(['3 pilotes', '3 voiles', '3 sites']);
  });
  it('ignore les dimensions omises', () => {
    const f = { ...defaultFilters(), pilots: ['a'], sites: [1], activity: 'paramoteur' as const };
    expect(filterSummary(f, names, ['pilots'])).toEqual(['paramoteur', 'S:1']);
    expect(filterSummary(f, names, ['sites', 'activity'])).toEqual(['P:a']);
  });
  it('décrit la période', () => {
    const year = { ...defaultFilters(), dateFrom: '2025-01-01', dateTo: '2025-12-31' };
    expect(filterSummary(year, names)).toEqual(['2025']);
    expect(filterSummary(year, names, ['period'])).toEqual([]);
    expect(filterSummary({ ...defaultFilters(), dateFrom: '2025-03-01' }, names)[0]).toContain('depuis le 1');
    expect(filterSummary({ ...defaultFilters(), dateTo: '2025-03-01' }, names)[0]).toContain('jusqu’au');
    expect(
      filterSummary({ ...defaultFilters(), dateFrom: '2025-03-01', dateTo: '2025-04-02' }, names)[0],
    ).toMatch(/^du .* au /);
  });
});
