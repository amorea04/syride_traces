import { describe, expect, it } from 'vitest';
import {
  barWidth,
  buildFlightContext,
  compareFlights,
  deltaPercent,
  fmtOrdinal,
  isNotableRank,
  metricComparisons,
  neighbours,
  populationsOf,
  rankOf,
  rankSentence,
  rankStatements,
  sameDayFlights,
} from '@/lib/flightContext';
import { makeFlight } from '../../tests/flightFactory';

describe('rangs', () => {
  it('rankOf : 1 = plus haut, ex æquo au même rang', () => {
    expect(rankOf(10, [10, 8, 12, 10])).toBe(2);
    expect(rankOf(12, [10, 8, 12, 10])).toBe(1);
    expect(rankOf(8, [10, 8, 12, 10])).toBe(4);
  });

  it('fmtOrdinal et phrases', () => {
    expect(fmtOrdinal(1)).toBe('1ᵉʳ');
    expect(fmtOrdinal(3)).toBe('3ᵉ');
    expect(rankSentence('plus long vol', 3, 'de j2f')).toBe('3ᵉ plus long vol de j2f');
    expect(rankSentence('plus haut plafond', 1, 'en 2025 à Montbron')).toBe(
      'Plus haut plafond en 2025 à Montbron',
    );
  });

  it('isNotableRank : top 3 ou 10 %, population minimale', () => {
    expect(isNotableRank(1, 4)).toBe(false);
    expect(isNotableRank(3, 20)).toBe(true);
    expect(isNotableRank(4, 20)).toBe(false);
    expect(isNotableRank(10, 100)).toBe(true);
    expect(isNotableRank(11, 100)).toBe(false);
  });

  it('rankStatements : rang 1 en or, pas de doublon annuel, ignore les absents', () => {
    const pilotFlights = Array.from({ length: 6 }, (_, i) =>
      makeFlight('2025-05-0' + (i + 1), {
        pilotSlug: 'j2f',
        pilot: 'j2f',
        siteId: 1,
        site: 'Montbron',
        ceilingM: 500 + i * 100,
      }),
    );
    const best = pilotFlights[5]!;
    const statements = rankStatements(best, { pilot: pilotFlights, site: pilotFlights });
    const plafond = statements.filter((s) => s.metric === 'plafond');
    // Même population annuelle que toutes années : une seule phrase par portée (pilote, site).
    expect(plafond.map((s) => s.scope)).toEqual(['pilot', 'site']);
    expect(plafond[0]).toMatchObject({ rank: 1, gold: true, total: 6 });
    expect(plafond[0]!.text).toBe('Plus haut plafond de j2f');
    // Durée identique pour tous (60) : rang 1 ex æquo, mais gold seulement si rang 1.
    expect(statements.every((s) => s.gold === (s.rank === 1))).toBe(true);
    // Un vol sans mesure n'a pas de phrase pour cette métrique.
    const none = makeFlight('2025-06-01', { pilotSlug: 'j2f', ceilingM: null, durationMin: null });
    expect(
      rankStatements(none, { pilot: pilotFlights, site: [] }).filter((s) => s.metric === 'plafond'),
    ).toEqual([]);
  });

  it('rankStatements : le rang annuel distinct de la portée toutes années est dit', () => {
    const old = Array.from({ length: 6 }, (_, i) =>
      makeFlight(`2024-05-0${i + 1}`, { pilotSlug: 'a', pilot: 'A', durationMin: 200 + i }),
    );
    const now = Array.from({ length: 6 }, (_, i) =>
      makeFlight(`2025-05-0${i + 1}`, { pilotSlug: 'a', pilot: 'A', durationMin: 10 + i }),
    );
    const f = now[5]!;
    const s = rankStatements(f, { pilot: [...old, ...now], site: [] });
    expect(s.map((x) => x.text)).toContain('Plus long vol de A en 2025');
    expect(s.find((x) => x.scope === 'pilot')).toBeUndefined();
  });
});

describe('moyennes', () => {
  it('ignore les null et les valeurs ≤ 0, durée comprise sans filtre positif', () => {
    const a = makeFlight('2025-01-01', { pilotSlug: 'a', siteId: 1, durationMin: 60, ceilingM: 1000 });
    const b = makeFlight('2025-01-02', { pilotSlug: 'a', siteId: 1, durationMin: 0, ceilingM: null });
    const c = makeFlight('2025-01-03', { pilotSlug: 'b', siteId: 1, durationMin: 30, ceilingM: 500 });
    const pops = { pilot: [a, b], site: [a, b, c] };
    const rows = metricComparisons(a, pops);
    const duree = rows.find((r) => r.id === 'duree')!;
    expect(duree).toMatchObject({ value: 60, pilotMean: 30, siteMean: 30, pilotCount: 2, siteCount: 3 });
    const plafond = rows.find((r) => r.id === 'plafond')!;
    expect(plafond).toMatchObject({ pilotMean: 1000, siteMean: 750, scaleMax: 1000 });
    expect(rows.find((r) => r.id === 'vario_max')).toMatchObject({
      value: null,
      pilotMean: null,
      siteMean: null,
    });
  });

  it('un vol sans site n a pas de moyenne de site', () => {
    const a = makeFlight('2025-01-01', { siteId: null, site: null });
    expect(metricComparisons(a, { pilot: [a], site: [] })[0]!.siteMean).toBeNull();
  });

  it('deltaPercent et barWidth', () => {
    expect(deltaPercent(15, 10)).toBe(50);
    expect(deltaPercent(null, 10)).toBeNull();
    expect(deltaPercent(5, 0)).toBeNull();
    expect(barWidth(50, 200)).toBe(25);
    expect(barWidth(null, 200)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
  });
});

describe('même jour, précédent et suivant', () => {
  const me = makeFlight('2025-05-10', { key: 'me-1', pilotSlug: 'me', siteId: 1, time: '12:00' });
  const sameSiteOther = makeFlight('2025-05-10', { key: 'o-1', pilotSlug: 'o', siteId: 1, time: '10:00' });
  const myOther = makeFlight('2025-05-10', { key: 'me-2', pilotSlug: 'me', siteId: 2, time: '15:00' });
  const otherElsewhere = makeFlight('2025-05-10', { key: 'o-2', pilotSlug: 'o', siteId: 2, time: '11:00' });
  const otherDay = makeFlight('2025-05-11', { key: 'me-3', pilotSlug: 'me', siteId: 1 });

  it('sépare même site (tous pilotes) et autres vols du pilote ailleurs', () => {
    const all = [me, sameSiteOther, myOther, otherElsewhere, otherDay];
    const r = sameDayFlights(me, all);
    expect(r.sameSite.map((f) => f.key)).toEqual(['o-1']);
    expect(r.elsewhere.map((f) => f.key)).toEqual(['me-2']);
  });

  it('un vol sans site : seuls ses autres vols du jour apparaissent', () => {
    const nosite = makeFlight('2025-05-10', { key: 'n-1', pilotSlug: 'me', siteId: null });
    const r = sameDayFlights(nosite, [nosite, me, sameSiteOther]);
    expect(r.sameSite).toEqual([]);
    expect(r.elsewhere.map((f) => f.key)).toEqual(['me-1']);
  });

  it('ordre date + heure + numéro, précédent et suivant', () => {
    const a = makeFlight('2025-05-10', { pilotSlug: 'me', time: '09:00', syrideNum: 5 });
    const b = makeFlight('2025-05-10', { pilotSlug: 'me', time: '09:00', syrideNum: 6 });
    const c = makeFlight('2025-05-10', { pilotSlug: 'me', time: null, syrideNum: 1 });
    expect([b, a, c].sort(compareFlights)).toEqual([c, a, b]);
    expect(neighbours(a, [b, c, a])).toEqual({ previous: c, next: b });
    expect(neighbours(c, [a, b, c])).toEqual({ previous: null, next: a });
    expect(neighbours(b, [a, b, c])).toEqual({ previous: a, next: null });
  });
});

describe('buildFlightContext', () => {
  it('assemble les populations sur tous les vols', () => {
    const a = makeFlight('2025-05-10', { pilotSlug: 'me', siteId: 1 });
    const b = makeFlight('2025-05-11', { pilotSlug: 'me', siteId: 2 });
    const c = makeFlight('2025-05-11', { pilotSlug: 'o', siteId: 1 });
    const ctx = buildFlightContext(a, [a, b, c]);
    expect(populationsOf(a, [a, b, c])).toEqual({ pilot: [a, b], site: [a, c] });
    expect(ctx.next).toBe(b);
    expect(ctx.previous).toBeNull();
    expect(ctx.comparisons).toHaveLength(5);
  });
});
