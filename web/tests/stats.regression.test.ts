/**
 * Non-régression croisée : les statistiques TypeScript (`src/lib/`) doivent donner les mêmes valeurs que les
 * fonctions Python d'origine (app_functions.py et rapport/report_data.py) sur les mêmes vols.
 * Les valeurs attendues viennent de `tests/fixtures/expected_stats.json`, produit par `scripts/expected_stats.py`
 * (`make expected-stats`) ; tolérance 1e-6.
 *
 * Écarts volontaires, voir les en-têtes de `stats.ts`, `records.ts` et `metrics.ts` :
 *   - `nbSites` : Python compte un site de plus s'il existe des vols sans site (`nbSitesPython` le garde) ;
 *   - `highlights.bestDay` : `n` et `sites` corrigés côté attendu (`nPython` garde la valeur brute) ;
 *   - mesures <= 0 : déjà `null` dans l'export, donc identiques (le pkl brut les compterait dans `create_grouped_df`).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeFlights, type Flight } from '@/data/flight';
import type { FlightsFile, SitesFile } from '@/data/schema.gen';
import { computeMetrics, getFlightParams, groupFlights, AXIS_IDS, type AxisId } from '@/lib/stats';
import {
  computeCareer,
  computeCoverage,
  computeHighlights,
  computeKpis,
  deltaPct,
  durationStats,
  instrumentRows,
  siteRows,
  topRecords,
  wingRows,
} from '@/lib/records';
import {
  computeRhythm,
  cumulativeSteps,
  dailySummaries,
  flightModes,
  hourDistribution,
  monthDistribution,
  seasonsBreakdown,
  weekdayDistribution,
  weekHourMatrix,
} from '@/lib/rhythm';
import { METRIC_IDS } from '@/lib/metrics';

const TOLERANCE = 1e-6;
const DATA_DIR = join(import.meta.dirname, 'fixtures/data');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface Filter {
  pilot?: string;
  activity?: string;
  year?: number;
}
interface Case {
  name: string;
  filter: Filter;
  params: Record<string, unknown>;
  groups: Record<AxisId, { key: string; values: Record<string, number | null> }[]>;
  indicators: Record<string, unknown>;
  rhythms: { year: number; end: string; rhythm: unknown }[];
}
interface Dataset {
  name: string;
  source?: string;
  flights?: FlightsFile;
  sites?: SitesFile;
  cases: Case[];
  careers: { pilot: string; year: number; cutoff: [number, number] | null; career: unknown }[];
  deltaPct: [number | null, number | null, number | null][];
}

const expected = readJson<{ datasets: Dataset[] }>(join(import.meta.dirname, 'fixtures/expected_stats.json'));

/** Clés ajoutées côté Python pour garder la valeur brute d'un écart assumé : non comparées. */
const IGNORED_KEYS = new Set(['nbSitesPython', 'nPython']);

/** Différences entre une valeur calculée et la valeur attendue ; chaque clé attendue doit exister côté TS. */
function diff(actual: unknown, wanted: unknown, path: string, out: string[] = []): string[] {
  if (wanted === null || wanted === undefined) {
    if (actual !== null && actual !== undefined) out.push(`${path} : ${String(actual)} au lieu de null`);
  } else if (typeof wanted === 'number') {
    if (typeof actual !== 'number' || !(Math.abs(actual - wanted) <= TOLERANCE)) {
      out.push(`${path} : ${String(actual)} au lieu de ${wanted}`);
    }
  } else if (Array.isArray(wanted)) {
    if (!Array.isArray(actual) || actual.length !== wanted.length) {
      out.push(
        `${path} : longueur ${Array.isArray(actual) ? actual.length : String(actual)} au lieu de ${wanted.length}`,
      );
    } else {
      wanted.forEach((w, i) => diff(actual[i], w, `${path}[${i}]`, out));
    }
  } else if (typeof wanted === 'object') {
    if (typeof actual !== 'object' || actual === null) {
      out.push(`${path} : ${String(actual)} au lieu d'un objet`);
    } else {
      for (const [k, w] of Object.entries(wanted)) {
        if (IGNORED_KEYS.has(k)) continue;
        diff((actual as Record<string, unknown>)[k], w, `${path}.${k}`, out);
      }
    }
  } else if (actual !== wanted) {
    out.push(`${path} : ${String(actual)} au lieu de ${String(wanted)}`);
  }
  return out;
}

function decodeDataset(ds: Dataset): { flights: Flight[]; sites: SitesFile } {
  if (ds.flights && ds.sites) return { flights: decodeFlights(ds.flights), sites: ds.sites };
  const sourceName = ds.source ?? '';
  const sitesName = readdirSync(DATA_DIR).find((f) => /^sites\.[0-9a-f]+\.json$/.test(f)) ?? '';
  return {
    flights: decodeFlights(readJson<FlightsFile>(join(DATA_DIR, sourceName))),
    sites: readJson<SitesFile>(join(DATA_DIR, sitesName)),
  };
}

function select(flights: Flight[], f: Filter): Flight[] {
  return flights.filter(
    (x) =>
      (f.pilot === undefined || x.pilot === f.pilot) &&
      (f.activity === undefined || x.activity === f.activity) &&
      (f.year === undefined || x.year === f.year),
  );
}

describe('couverture du jeu de test', () => {
  it('contient des séries, des pauses, un vol incomplet, des mesures et des sites manquants', () => {
    for (const ds of expected.datasets) {
      const { flights } = decodeDataset(ds);
      expect(flights.some((f) => f.incomplete)).toBe(true);
      expect(flights.some((f) => f.site === null)).toBe(true);
      expect(flights.some((f) => f.ceilingM === null)).toBe(true);
      const rhythm = computeRhythm(flights, 2025, '2025-12-31');
      expect(rhythm?.streak).not.toBeNull();
      expect(rhythm?.gap).not.toBeNull();
    }
    const dense = decodeDataset(expected.datasets.find((d) => d.name === 'dense') as Dataset).flights;
    expect(computeRhythm(dense, 2025, '2025-12-31')?.streak?.days).toBeGreaterThanOrEqual(3);
  });
});

for (const ds of expected.datasets) {
  describe(`jeu « ${ds.name} »`, () => {
    const { flights, sites } = decodeDataset(ds);
    const hasCoords = (id: number): boolean => sites.sites[id]?.lat != null;

    describe.each(ds.cases)('$name', (c) => {
      const sel = select(flights, c.filter);
      const ind = c.indicators as Record<string, unknown>;

      it('get_flight_params', () => {
        expect(diff(getFlightParams(sel), c.params, 'params')).toEqual([]);
      });

      it.each(AXIS_IDS)('create_grouped_df, axe %s', (axis) => {
        const rows = groupFlights(sel, axis);
        const wanted = c.groups[axis];
        expect(rows.map((r) => r.key).sort()).toEqual(wanted.map((r) => r.key).sort());
        // L'ordre est celui du Python, sauf l'heure (nouvel axe, croissante ; le Python la trie à l'envers).
        const order = axis === 'heure' ? [...wanted].sort((a, b) => Number(a.key) - Number(b.key)) : wanted;
        expect(rows.map((r) => r.key)).toEqual(order.map((r) => r.key));
        const byKey = new Map(rows.map((r) => [r.key, r]));
        const problems: string[] = [];
        for (const w of wanted) {
          const actual = byKey.get(w.key);
          for (const id of METRIC_IDS)
            diff(actual?.values[id], w.values[id], `${axis}/${w.key}/${id}`, problems);
        }
        expect(problems).toEqual([]);
      });

      it('cohérence : les lignes par année totalisent les vols', () => {
        const total = computeMetrics(sel).nb_vols;
        const byYear = groupFlights(sel, 'annee').reduce((s, r) => s + (r.values.nb_vols ?? 0), 0);
        expect(byYear).toBe(total);
      });

      it('compute_kpis', () => {
        expect(diff(computeKpis(sel), ind.kpis, 'kpis')).toEqual([]);
      });

      it('répartitions mois, jour, heure et matrice jour × heure', () => {
        const problems: string[] = [];
        diff(monthDistribution(sel), ind.monthly, 'monthly', problems);
        diff(weekdayDistribution(sel), ind.weekday, 'weekday', problems);
        diff(hourDistribution(sel), ind.hours, 'hours', problems);
        diff(weekHourMatrix(sel), ind.weekHour, 'weekHour', problems);
        expect(problems).toEqual([]);
      });

      it('jours de vol et courbe cumulée', () => {
        const problems: string[] = [];
        diff(dailySummaries(sel), ind.daily, 'daily', problems);
        diff(cumulativeSteps(sel), ind.steps, 'steps', problems);
        expect(problems).toEqual([]);
      });

      it('sites, voiles, instruments', () => {
        const problems: string[] = [];
        diff(siteRows(sel), ind.sites, 'sites', problems);
        diff(wingRows(sel), ind.wings, 'wings', problems);
        diff(instrumentRows(sel), ind.instruments, 'instruments', problems);
        expect(problems).toEqual([]);
      });

      it('_records', () => {
        expect(diff(topRecords(sel), ind.records, 'records')).toEqual([]);
      });

      it('_highlights', () => {
        const actual = computeHighlights(sel);
        const sorted = actual.bestDay
          ? { ...actual, bestDay: { ...actual.bestDay, sites: [...actual.bestDay.sites].sort() } }
          : actual;
        expect(diff(sorted, ind.highlights, 'highlights')).toEqual([]);
      });

      it('_flight_modes et _seasons', () => {
        const problems: string[] = [];
        diff(flightModes(sel), ind.flightModes, 'flightModes', problems);
        diff(seasonsBreakdown(sel), ind.seasons, 'seasons', problems);
        expect(problems).toEqual([]);
      });

      it('_coverage', () => {
        expect(diff(computeCoverage(sel, hasCoords), ind.coverage, 'coverage')).toEqual([]);
      });

      it('_duration_stats', () => {
        expect(diff(durationStats(sel), ind.durations, 'durations')).toEqual([]);
      });

      it.each(c.rhythms)('compute_rhythm, année $year jusqu’au $end', (r) => {
        expect(diff(computeRhythm(sel, r.year, r.end), r.rhythm, 'rhythm')).toEqual([]);
      });
    });

    it.each(ds.careers)('compute_career $pilot $year coupure $cutoff', (c) => {
      const mine = flights.filter((f) => f.pilot === c.pilot);
      expect(diff(computeCareer(mine, c.year, c.cutoff), c.career, 'career')).toEqual([]);
    });

    it.each(ds.deltaPct)('delta_pct(%s, %s)', (current, reference, wanted) => {
      expect(diff(deltaPct(current, reference), wanted, 'deltaPct')).toEqual([]);
    });
  });
}

describe('écarts assumés avec le Python', () => {
  it('nbSites ignore les vols sans site, que get_flight_params compte comme un site de plus', () => {
    for (const ds of expected.datasets) {
      const c = ds.cases[0] as Case;
      expect(c.params.nbSitesPython).toBe((c.params.nbSites as number) + 1);
    }
  });
});

// Empêche l'oubli d'un jeu de test vide.
it('les jeux attendus ne sont pas vides', () => {
  expect(expected.datasets.length).toBeGreaterThanOrEqual(2);
  for (const ds of expected.datasets) expect(ds.cases.length).toBeGreaterThan(0);
});
