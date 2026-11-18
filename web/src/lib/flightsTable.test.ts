import { describe, expect, it } from 'vitest';
import {
  buildHaystacks,
  COLUMNS,
  csvEscape,
  csvFileName,
  csvNumber,
  defaultPrefs,
  defaultVisibleColumns,
  flightsToCsv,
  normalizeText,
  parsePrefs,
  searchFlights,
  sortFlights,
} from '@/lib/flightsTable';
import { makeFlight } from '../../tests/flightFactory';

describe('normalizeText', () => {
  it('retire casse et accents', () => {
    expect(normalizeText('Épicéa Ça-Œuvre')).toBe('epicea ca-œuvre');
  });
});

describe('recherche', () => {
  const flights = [
    makeFlight('2025-01-01', { pilot: 'Rémy', site: 'Saint-Hilaire', wing: 'Omega X-Alps', mode: 'Rando' }),
    makeFlight('2025-01-02', { pilot: 'Zoé', site: 'Montbron', wing: 'Ozone', instrument: 'Flymaster' }),
  ];
  const index = buildHaystacks(flights);
  it('insensible à la casse et aux accents', () => {
    expect(searchFlights(flights, index, 'REMY')).toEqual([flights[0]]);
    expect(searchFlights(flights, index, 'zoe')).toEqual([flights[1]]);
  });
  it('cherche dans voile, instrument, mode et site, tous les mots requis', () => {
    expect(searchFlights(flights, index, 'flymaster')).toEqual([flights[1]]);
    expect(searchFlights(flights, index, 'rando')).toEqual([flights[0]]);
    expect(searchFlights(flights, index, 'saint hilaire omega')).toEqual([flights[0]]);
    expect(searchFlights(flights, index, 'montbron omega')).toEqual([]);
  });
  it('recherche vide : tout', () => {
    expect(searchFlights(flights, index, '  ')).toBe(flights);
  });
});

describe('tri', () => {
  const a = makeFlight('2025-03-01', { time: '10:00', durationMin: 30, ceilingM: 1000, pilot: 'B' });
  const b = makeFlight('2025-03-01', { time: '14:00', durationMin: null, ceilingM: 500, pilot: 'A' });
  const c = makeFlight('2025-02-01', { time: null, durationMin: 90, ceilingM: 1000, pilot: 'C' });
  const d = makeFlight('2025-04-01', { time: '09:00', durationMin: 60, ceilingM: null, pilot: 'D' });
  const all = [a, b, c, d];

  it('date et heure décroissantes', () => {
    expect(sortFlights(all, [{ id: 'date', desc: true }])).toEqual([d, b, a, c]);
  });
  it('null toujours en fin, dans les deux sens', () => {
    expect(sortFlights(all, [{ id: 'duration', desc: false }]).at(-1)).toBe(b);
    expect(sortFlights(all, [{ id: 'duration', desc: true }]).at(-1)).toBe(b);
    expect(sortFlights(all, [{ id: 'ceiling', desc: true }]).at(-1)).toBe(d);
    expect(sortFlights(all, [{ id: 'ceiling', desc: false }]).at(-1)).toBe(d);
  });
  it('multicolonne : plafond décroissant puis durée décroissante', () => {
    expect(
      sortFlights(all, [
        { id: 'ceiling', desc: true },
        { id: 'duration', desc: true },
      ]),
    ).toEqual([c, a, b, d]);
  });
  it('texte : ordre alphabétique français, sans modifier l’entrée', () => {
    const copy = [...all];
    expect(sortFlights(all, [{ id: 'pilot', desc: false }]).map((f) => f.pilot)).toEqual(['A', 'B', 'C', 'D']);
    expect(all).toEqual(copy);
  });
  it('sans tri : ordre d’origine', () => {
    expect(sortFlights(all, [])).toEqual(all);
  });
  it('tri stable à valeurs égales', () => {
    expect(sortFlights([a, c], [{ id: 'ceiling', desc: true }])).toEqual([a, c]);
  });
});

describe('CSV', () => {
  it('échappe selon la RFC 4180', () => {
    expect(csvEscape('simple')).toBe('simple');
    expect(csvEscape('a;b')).toBe('"a;b"');
    expect(csvEscape('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvEscape('l1\nl2')).toBe('"l1\nl2"');
  });
  it('neutralise les débuts de formule', () => {
    expect(csvEscape('=SOMME(A1)')).toBe("'=SOMME(A1)");
  });
  it('nombres : virgule décimale, sans milliers, sans zéros inutiles', () => {
    expect(csvNumber(1234.5)).toBe('1234,5');
    expect(csvNumber(2450, 0)).toBe('2450');
    expect(csvNumber(12.34, 1)).toBe('12,3');
    expect(csvNumber(0.04, 1)).toBe('0');
    expect(csvNumber(-3.5)).toBe('-3,5');
  });
  it('nom de fichier daté', () => {
    expect(csvFileName('2026-08-31')).toBe('vols-2026-08-31.csv');
    expect(csvFileName('2026-08-31T10:00:00Z')).toBe('vols-2026-08-31.csv');
  });
  it('document complet : BOM, en-tête, lignes, lien Syride, colonnes visibles uniquement', () => {
    const f1 = makeFlight('2025-06-14', {
      pilot: 'Tof Torsac',
      time: '10:32',
      site: 'Mont; "X"',
      durationMin: 95,
      distKm: 1234.56,
      ceilingM: null,
      syrideNum: 42,
    });
    const f2 = makeFlight('2025-06-15', { pilot: 'j2f', time: null, syrideNum: 7 });
    const csv = flightsToCsv([f1, f2], ['date', 'pilot', 'site', 'duration', 'distance', 'ceiling']);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe(
      'Date;Heure;Pilote;Site;Durée (min);Distance (km);Plafond (m);Lien Syride',
    );
    expect(lines[1]).toBe(
      '2025-06-14;10:32;Tof Torsac;"Mont; ""X""";95;1234,6;;https://www.syride.com/fr/pilotes/Tof%20Torsac/42',
    );
    expect(lines[2]).toBe('2025-06-15;;j2f;Site A;60;;;https://www.syride.com/fr/pilotes/j2f/7');
    expect(lines).toHaveLength(4);
  });
  it('sélection vide : en-tête seul', () => {
    expect(flightsToCsv([], ['pilot']).slice(1)).toBe('Pilote;Lien Syride\r\n');
  });
});

describe('préférences', () => {
  it('défauts : colonnes de la maquette, instrument et mode masqués', () => {
    const visible = defaultVisibleColumns();
    expect(visible).toContain('date');
    expect(visible).not.toContain('instrument');
    expect(visible).not.toContain('source');
    expect(COLUMNS.length).toBeGreaterThan(visible.length);
  });
  it('JSON absent ou invalide : défauts', () => {
    expect(parsePrefs(null)).toEqual(defaultPrefs());
    expect(parsePrefs('{pas du json')).toEqual(defaultPrefs());
    expect(parsePrefs('42')).toEqual(defaultPrefs());
  });
  it('filtre les identifiants inconnus et garde l’ordre des colonnes', () => {
    const prefs = parsePrefs(
      JSON.stringify({
        sort: [
          { id: 'duration', desc: true },
          { id: 'inconnue', desc: false },
          { id: 'duration', desc: false },
        ],
        visible: ['site', 'bidule', 'date'],
      }),
    );
    expect(prefs.sort).toEqual([{ id: 'duration', desc: true }]);
    expect(prefs.visible).toEqual(['date', 'site']);
  });
  it('liste de colonnes vide : défauts', () => {
    expect(parsePrefs(JSON.stringify({ visible: [] })).visible).toEqual(defaultVisibleColumns());
  });
});
