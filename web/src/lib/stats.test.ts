import { describe, expect, it } from 'vitest';
import { makeFlight } from '../../tests/flightFactory';
import { METRIC_IDS, METRICS, metricById } from '@/lib/metrics';
import { getFlightParams, groupFlights } from '@/lib/stats';

describe('metrics', () => {
  it('définit les 19 métriques de l’ancienne application, sans doublon', () => {
    expect(METRICS).toHaveLength(19);
    expect(new Set(METRIC_IDS).size).toBe(19);
    expect(new Set(METRICS.map((m) => m.label)).size).toBe(19);
    expect(metricById('max_plafond').unit).toBe('m');
  });

  it('un vol incomplet compte mais ses mesures de fiche sont ignorées', () => {
    const fs = [
      makeFlight('2025-03-03', { ceilingM: 1000 }),
      makeFlight('2025-03-04', { ceilingM: 3000, incomplete: true, durationMin: 30 }),
    ];
    expect(metricById('moyenne_plafond').aggregate(fs)).toBe(1000);
    expect(metricById('nb_vols').aggregate(fs)).toBe(2);
    expect(metricById('cumul_duree_vol').aggregate(fs)).toBe(1.5);
  });

  it('durée : une durée inconnue est sautée, un zéro est conservé', () => {
    const fs = [
      makeFlight('2025-03-03', { durationMin: 0 }),
      makeFlight('2025-03-04', { durationMin: 60 }),
      makeFlight('2025-03-05', { durationMin: null }),
    ];
    expect(metricById('moyenne_duree_vol').aggregate(fs)).toBe(30);
  });
});

describe('getFlightParams', () => {
  it('arrondit comme np.round et ignore les mesures nulles', () => {
    const p = getFlightParams([
      makeFlight('2025-03-03', { speedAvg: 64.5, durationMin: 59.4 }),
      makeFlight('2025-03-04', { speedAvg: 64.6, site: null }),
    ]);
    expect(p.speedAvg).toEqual({ mean: 64.6, max: 64.6 });
    expect(p.totalMinutes).toBe(119);
    expect(p).toMatchObject({ hours: 1, minutes: 59, nbSites: 1, nbPilots: 1 });
    expect(p.ceiling).toEqual({ mean: null, max: null });
  });
});

describe('groupFlights', () => {
  const fs = [
    makeFlight('2025-02-10', { time: '14:30', wing: 'Zeta' }),
    makeFlight('2024-12-01', { time: '08:00', wing: 'Alpha', site: null }),
    makeFlight('2025-02-11', { time: null, wing: null }),
  ];

  it('mois : ordre du calendrier, clés sans accent, libellés accentués', () => {
    const rows = groupFlights([...fs, makeFlight('2025-08-05')], 'mois');
    expect(rows.map((r) => r.key)).toEqual(['fevrier', 'aout', 'decembre']);
    expect(rows.map((r) => r.label)).toEqual(['février', 'août', 'décembre']);
  });

  it('année décroissante, voile alphabétique, heure croissante', () => {
    expect(groupFlights(fs, 'annee').map((r) => r.key)).toEqual(['2025', '2024']);
    expect(groupFlights(fs, 'voile').map((r) => r.key)).toEqual(['Alpha', 'Zeta']);
    expect(groupFlights(fs, 'heure').map((r) => r.key)).toEqual(['8', '14']);
  });

  it('écarte les vols sans valeur d’axe, comme pandas', () => {
    expect(groupFlights(fs, 'site').reduce((n, r) => n + (r.values.nb_vols ?? 0), 0)).toBe(2);
  });
});
