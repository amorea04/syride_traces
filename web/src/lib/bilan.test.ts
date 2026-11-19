import { describe, expect, it } from 'vitest';
import {
  adjacentYears,
  defaultCompareYears,
  inDiscipline,
  parseCompareYears,
  pilotFlights,
  pilotYears,
  writeCompareYears,
  yearFlights,
} from '@/lib/bilan';
import { makeFlight } from '../../tests/flightFactory';

const me = { pilot: 'Alice', pilotSlug: 'alice' };
const flights = [
  makeFlight('2022-05-01', me),
  makeFlight('2023-05-01', me),
  makeFlight('2024-05-01', { ...me, activity: 'paramoteur' }),
  makeFlight('2025-03-01', me),
  makeFlight('2025-09-01', { ...me, activity: 'paramoteur' }),
  makeFlight('2025-03-01', { pilot: 'Bob', pilotSlug: 'bob' }),
];

describe('sélection des vols', () => {
  it('filtre par discipline', () => {
    expect(inDiscipline(flights[2]!, 'tout')).toBe(true);
    expect(inDiscipline(flights[2]!, 'parapente')).toBe(false);
    expect(inDiscipline(flights[2]!, 'paramoteur')).toBe(true);
  });

  it('pilotFlights : un pilote, une discipline, toutes années', () => {
    expect(pilotFlights(flights, 'alice', 'tout')).toHaveLength(5);
    expect(pilotFlights(flights, 'alice', 'paramoteur')).toHaveLength(2);
    expect(pilotFlights(flights, 'inconnu', 'tout')).toHaveLength(0);
  });

  it('yearFlights : une année, arrêtée à la coupure incluse', () => {
    const mine = pilotFlights(flights, 'alice', 'tout');
    expect(yearFlights(mine, 2025)).toHaveLength(2);
    expect(yearFlights(mine, 2025, '2025-03-01')).toHaveLength(1);
    expect(yearFlights(mine, 2025, '2025-02-28')).toHaveLength(0);
    expect(yearFlights(mine, 2023, null)).toHaveLength(1);
  });

  it('pilotYears : de la plus récente à la plus ancienne, toutes disciplines', () => {
    expect(pilotYears(flights, 'alice')).toEqual([2025, 2024, 2023, 2022]);
    expect(pilotYears(flights, 'bob')).toEqual([2025]);
  });
});

describe('années comparées', () => {
  const available = [2025, 2024, 2023, 2022];

  it('défaut : les 2 années précédentes disponibles', () => {
    expect(defaultCompareYears(available, 2025)).toEqual([2024, 2023]);
    expect(defaultCompareYears(available, 2023)).toEqual([2022]);
    expect(defaultCompareYears(available, 2022)).toEqual([]);
    expect(defaultCompareYears([2025, 2022], 2025)).toEqual([2022]);
  });

  it('paramètre absent : défaut', () => {
    expect(parseCompareYears(new URLSearchParams(''), available, 2025)).toEqual([2024, 2023]);
  });

  it('paramètre vide : aucune année', () => {
    expect(parseCompareYears(new URLSearchParams('comparer='), available, 2025)).toEqual([]);
  });

  it('lit une liste, la trie, ignore inconnues, doublons et année du bilan, plafonne à 2', () => {
    expect(parseCompareYears(new URLSearchParams('comparer=2022,2024'), available, 2025)).toEqual([2024, 2022]);
    expect(parseCompareYears(new URLSearchParams('comparer=2025,2024,2024,1999,abc'), available, 2025)).toEqual([2024]);
    expect(parseCompareYears(new URLSearchParams('comparer=2024,2023,2022'), available, 2025)).toEqual([2024, 2023]);
  });

  it('écrit le choix, retire le paramètre s’il est celui par défaut, garde les autres paramètres', () => {
    const base = new URLSearchParams('activite=paramoteur');
    expect(writeCompareYears(base, [2022], available, 2025).toString()).toBe('activite=paramoteur&comparer=2022');
    expect(writeCompareYears(base, [2023, 2024], available, 2025).toString()).toBe('activite=paramoteur');
    expect(writeCompareYears(base, [], available, 2025).get('comparer')).toBe('');
    expect(writeCompareYears(new URLSearchParams('comparer=2022'), [2024, 2023], available, 2025).has('comparer')).toBe(false);
  });
});

describe('années voisines', () => {
  const available = [2025, 2024, 2022];
  it('donne l’année précédente et la suivante disponibles', () => {
    expect(adjacentYears(available, 2024)).toEqual({ prev: 2022, next: 2025 });
    expect(adjacentYears(available, 2025)).toEqual({ prev: 2024, next: null });
    expect(adjacentYears(available, 2022)).toEqual({ prev: null, next: 2024 });
  });
});
