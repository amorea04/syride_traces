import { describe, expect, it } from 'vitest';
import {
  flightOfTheYear,
  isRecordFlight,
  kpiRows,
  milestonePoints,
  milestoneTag,
  milestoneTarget,
  monthBuckets,
  nextEquivalence,
  OVERVIEW_IDS,
  paramsForYear,
  sparkValues,
  topoPaths,
  KPI_DEFS,
} from '@/lib/bilanOverview';
import { computeKpis, deltaPct } from '@/lib/records';
import type { Story } from '@/data/schema.gen';
import { makeFlight } from '../../tests/flightFactory';

const me = { pilot: 'Alice', pilotSlug: 'alice' };
const cur = [
  makeFlight('2025-01-10', { ...me, durationMin: 30, distKm: 10, ceilingM: 1000, speedMax: 50, site: 'A' }),
  makeFlight('2025-01-10', { ...me, durationMin: 90, distKm: null, ceilingM: 2000, speedMax: 60, site: 'B' }),
  makeFlight('2025-03-05', { ...me, durationMin: 60, distKm: 30, ceilingM: null, speedMax: null, site: 'A' }),
];
const ref = [
  makeFlight('2024-02-01', { ...me, durationMin: 60, distKm: 20, ceilingM: 1000, speedMax: 60 }),
  makeFlight('2024-02-02', { ...me, durationMin: 60, distKm: 20, ceilingM: 1000, speedMax: 60 }),
  makeFlight('2024-02-03', { ...me, durationMin: 60, distKm: 20, ceilingM: 1000, speedMax: 60 }),
  makeFlight('2024-02-03', { ...me, durationMin: 60, distKm: 20, ceilingM: 1000, speedMax: 60 }),
];

describe('kpiRows', () => {
  const rows = kpiRows(cur, [2024], new Map([[2024, ref]]), OVERVIEW_IDS);
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  it('donne les 8 cartes dans l’ordre', () => {
    expect(rows.map((r) => r.id)).toEqual([...OVERVIEW_IDS]);
    expect(kpiRows(cur, [], new Map())).toHaveLength(KPI_DEFS.length);
  });

  it('reprend les définitions du rapport (compute_kpis)', () => {
    const k = computeKpis(cur);
    expect(byId('vols').value).toBe(3);
    expect(byId('temps').value).toBe(180);
    expect(byId('jours').value).toBe(2);
    expect(byId('sites').value).toBe(2);
    expect(byId('duree').value).toBe(60);
    expect(byId('distance').value).toBe(k.distanceTotal);
    expect(byId('distance').value).toBe(40);
    expect(byId('plafond').value).toBe(2000);
    expect(byId('vitesse').value).toBe(60);
  });

  it('écarts : année du bilan contre année comparée entière, comme delta_pct', () => {
    expect(byId('vols').deltas).toEqual([{ year: 2024, pct: deltaPct(3, 4) }]);
    expect(byId('vols').deltas[0]!.pct).toBeCloseTo(-25);
    expect(byId('temps').deltas[0]!.pct).toBeCloseTo(-25);
    expect(byId('jours').deltas[0]!.pct).toBeCloseTo(-33.333, 2);
    expect(byId('plafond').deltas[0]!.pct).toBeCloseTo(100);
    expect(byId('vitesse').deltas[0]!.pct).toBeCloseTo(0);
  });

  it('volumes colorés, le reste neutre', () => {
    expect(['vols', 'temps', 'jours'].map((id) => byId(id).kind)).toEqual(['volume', 'volume', 'volume']);
    expect(['sites', 'duree', 'distance', 'plafond', 'vitesse'].every((id) => byId(id).kind === 'neutre')).toBe(true);
  });

  it('mesure partielle : note « sur N vols mesurés » ; plafond sur 2 vols de 3', () => {
    expect(byId('plafond').measuredNote).toEqual({ ok: 2, n: 3 });
    expect(byId('vols').measuredNote).toBeNull();
  });

  it('mesure absente de tous les vols : non mesuré, ni mini-courbe ni valeur', () => {
    const none = kpiRows(cur.map((f) => ({ ...f, distKm: null })), [], new Map(), ['distance']);
    expect(none[0]).toMatchObject({ notMeasured: true, spark: null, value: null, text: '–' });
  });

  it('année comparée sans vol : écart non calculable', () => {
    const empty = kpiRows(cur, [2023], new Map(), ['vols']);
    expect(empty[0]!.deltas).toEqual([{ year: 2023, pct: null }]);
  });

  it('formats : carte et tableau', () => {
    expect(byId('temps').cardText).toBe('3 h 00');
    expect(kpiRows(cur, [], new Map(), ['temps'])[0]!.text).toBe('3 h');
    expect(byId('plafond').cardText).toBe('2 000');
    expect(byId('plafond').text).toBe('2 000 m');
  });
});

describe('mini-courbes mensuelles', () => {
  const buckets = monthBuckets(cur);
  const def = (id: string) => KPI_DEFS.find((d) => d.id === id)!;
  it('12 mois, par indicateur', () => {
    expect(buckets).toHaveLength(12);
    expect(sparkValues(def('vols'), buckets)).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sparkValues(def('temps'), buckets)![0]).toBe(120);
    expect(sparkValues(def('jours'), buckets)![0]).toBe(1);
    expect(sparkValues(def('duree'), buckets)!.slice(0, 3)).toEqual([60, 0, 60]);
    expect(sparkValues(def('plafond'), buckets)!.slice(0, 3)).toEqual([2000, 0, 0]);
  });
  it('pas de mini-courbe sans valeur ni pour vario et g', () => {
    expect(sparkValues(def('vario'), buckets)).toBeNull();
    expect(sparkValues(def('distance'), monthBuckets(cur.map((f) => ({ ...f, distKm: null }))))).toBeNull();
  });
});

describe('vol de l’année', () => {
  it('plus long vol (règle du rapport), avec son vol', () => {
    const r = flightOfTheYear(cur)!;
    expect(r.entry.value).toBe(90);
    expect(r.flight?.key).toBe(cur[1]!.key);
    expect(flightOfTheYear([])).toBeNull();
  });
  it('isRecordFlight', () => {
    const story = { records_beaten: [{ flight: 'a-1', metric: 'duree' }] } as unknown as NonNullable<Story>;
    expect(isRecordFlight(story, 'a-1')).toBe(true);
    expect(isRecordFlight(story, 'a-1', 'plafond')).toBe(false);
    expect(isRecordFlight(story, 'a-2')).toBe(false);
  });
});

describe('jalons', () => {
  const keys = new Set(['alice-1']);
  const days = new Set(['2025-03-05']);
  it('cible : fiche vol, sinon fiche jour, sinon rien', () => {
    expect(milestoneTarget({ date: '2025-01-10', flight: 'alice-1' }, keys, days)).toEqual({ type: 'flight', key: 'alice-1' });
    expect(milestoneTarget({ date: '2025-03-05', flight: null }, keys, days)).toEqual({ type: 'day', date: '2025-03-05' });
    expect(milestoneTarget({ date: '2025-03-05', flight: 'alice-9' }, keys, days)).toEqual({ type: 'day', date: '2025-03-05' });
    expect(milestoneTarget({ date: '2025-04-01', flight: null }, keys, days)).toBeNull();
  });
  it('étiquettes : or seulement', () => {
    expect(milestoneTag('record', true)).toBe('Record');
    expect(milestoneTag('new_site', true)).toBe('Nouveauté');
    expect(milestoneTag('best_day', true)).toBe('Meilleur jour');
    expect(milestoneTag('nth_flight', false)).toBeNull();
    expect(milestoneTag('record', false)).toBeNull();
  });
  it('points sur la courbe : jour de l’année, titres regroupés, hors courbe ignorés', () => {
    const axis = Array.from({ length: 366 }, (_, i) => `d${i}`);
    const values = axis.map((_, i) => (i < 100 ? i / 10 : null));
    const points = milestonePoints(
      [
        { date: '2025-01-02', title: 'A', gold: false },
        { date: '2025-01-02', title: 'B', gold: true },
        { date: '2025-06-01', title: 'C', gold: true },
      ],
      axis,
      values,
    );
    expect(points).toEqual([{ date: '2025-01-02', axis: 'd1', hours: 0.1, titles: ['A', 'B'], gold: true }]);
  });
});

describe('équivalences et années', () => {
  it('rotation ↻', () => {
    expect(nextEquivalence(0, 3)).toBe(1);
    expect(nextEquivalence(2, 3)).toBe(0);
    expect(nextEquivalence(0, 1)).toBe(0);
    expect(nextEquivalence(0, 0)).toBe(0);
  });

  const available = [2026, 2025, 2024, 2023];
  it('changer d’année garde les filtres et un `comparer` encore valide', () => {
    const p = paramsForYear(new URLSearchParams('activite=paramoteur&comparer=2023'), 2025, available);
    expect(p.get('activite')).toBe('paramoteur');
    expect(p.get('comparer')).toBe('2023');
  });
  it('`comparer` invalide pour la nouvelle année est retiré (année postérieure ou égale, inconnue, trop long)', () => {
    expect(paramsForYear(new URLSearchParams('comparer=2025'), 2024, available).has('comparer')).toBe(false);
    expect(paramsForYear(new URLSearchParams('comparer=2024'), 2024, available).has('comparer')).toBe(false);
    expect(paramsForYear(new URLSearchParams('comparer=1990'), 2025, available).has('comparer')).toBe(false);
    expect(paramsForYear(new URLSearchParams('comparer=2025,2024,2023'), 2026, available).has('comparer')).toBe(false);
  });
  it('« aucune année » reste « aucune » ; un choix égal au défaut est normalisé', () => {
    expect(paramsForYear(new URLSearchParams('comparer='), 2025, available).get('comparer')).toBe('');
    expect(paramsForYear(new URLSearchParams('comparer=2024,2023'), 2025, available).has('comparer')).toBe(false);
  });
  it('sans paramètre : rien d’ajouté', () => {
    expect(paramsForYear(new URLSearchParams('activite=paramoteur'), 2025, available).toString()).toBe('activite=paramoteur');
  });
});

describe('fond topographique', () => {
  it('produit des tracés fermés, dont les courbes maîtresses', () => {
    const { lines, index } = topoPaths();
    expect(lines.startsWith('M')).toBe(true);
    expect(index.length).toBeGreaterThan(0);
    expect(lines.match(/z/g)!.length).toBe(20);
    expect(index.match(/z/g)!.length).toBe(4);
  });
});
