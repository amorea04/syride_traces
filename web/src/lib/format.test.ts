import { describe, expect, it } from 'vitest';
import {
  DAYS_LONG,
  EMPTY,
  NBSP,
  THOUSANDS_SEP as T,
  fmtDate,
  fmtDateNumeric,
  fmtDateShort,
  fmtDuration,
  fmtHm,
  fmtHours,
  fmtInt,
  fmtNum,
  fmtOrDash,
  fmtPercent,
  fmtRange,
  fmtReadable,
  fmtSignedPct,
  plural,
  roundHalfEven,
} from '@/lib/format';

// Les cas ci-dessous reprennent les docstrings et le comportement de report_format.py.
describe('roundHalfEven (round Python)', () => {
  it('arrondit les ex æquo au pair', () => {
    expect([0.5, 1.5, 2.5, 3.5, -0.5, -1.5].map(roundHalfEven)).toEqual([0, 2, 2, 4, 0, -2]);
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe('fmtInt', () => {
  it('sépare les milliers (fmt_int(2450) = « 2 450 »)', () => {
    expect(fmtInt(2450)).toBe(`2${T}450`);
    expect(fmtInt(999)).toBe('999');
    expect(fmtInt(1_234_567)).toBe(`1${T}234${T}567`);
    expect(fmtInt(0)).toBe('0');
  });
  it('arrondit comme Python', () => {
    expect(fmtInt(2.5)).toBe('2');
    expect(fmtInt(3.5)).toBe('4');
    expect(fmtInt(1234.6)).toBe(`1${T}235`);
    expect(fmtInt(-0.2)).toBe('0');
    expect(fmtInt(-1234)).toBe(`-1${T}234`);
  });
});

describe('fmtNum', () => {
  it('virgule décimale (fmt_num(34.5) = « 34,5 »)', () => {
    expect(fmtNum(34.5)).toBe('34,5');
    expect(fmtNum(1234.56, 1)).toBe(`1${T}234,6`);
  });
  it('garde les zéros inutiles', () => {
    expect(fmtNum(34, 1)).toBe('34,0');
    expect(fmtNum(34, 2)).toBe('34,00');
    expect(fmtNum(12, 0)).toBe('12');
  });
  it('ex æquo au pair comme format() Python', () => {
    expect(fmtNum(0.25, 1)).toBe('0,2');
    expect(fmtNum(0.75, 1)).toBe('0,8');
  });
});

describe('fmtReadable', () => {
  it('une décimale sous 10, entier au-dessus : 3,2 ; 4 ; 27', () => {
    expect(fmtReadable(3.2)).toBe('3,2');
    expect(fmtReadable(4)).toBe('4');
    expect(fmtReadable(4.04)).toBe('4');
    expect(fmtReadable(27.4)).toBe('27');
    expect(fmtReadable(2450.2)).toBe(`2${T}450`);
  });
});

describe('durées', () => {
  it('fmtDuration (fmt_duration(2538) = « 42 h 18 min »)', () => {
    expect(fmtDuration(2538)).toBe(`42${NBSP}h${NBSP}18${NBSP}min`);
    expect(fmtDuration(35)).toBe(`35${NBSP}min`);
    expect(fmtDuration(180)).toBe(`3${NBSP}h`);
    expect(fmtDuration(0)).toBe(`0${NBSP}min`);
    expect(fmtDuration(65)).toBe(`1${NBSP}h${NBSP}05${NBSP}min`);
    expect(fmtDuration(59.6)).toBe(`1${NBSP}h`);
  });
  it('fmtHm : « 2 096 h 01 »', () => {
    expect(fmtHm(2096 * 60 + 1)).toBe(`2${T}096${NBSP}h${NBSP}01`);
    expect(fmtHm(125)).toBe(`2${NBSP}h${NBSP}05`);
    expect(fmtHm(0)).toBe(`0${NBSP}h${NBSP}00`);
  });
  it('fmtHours : « 42,3 h »', () => {
    expect(fmtHours(2538)).toBe(`42,3${NBSP}h`);
    expect(fmtHours(90, 2)).toBe(`1,50${NBSP}h`);
  });
});

describe('pourcentages', () => {
  it('fmtSignedPct', () => {
    expect(fmtSignedPct(12.4)).toBe(`+12${NBSP}%`);
    expect(fmtSignedPct(-8.2)).toBe(`\u22128${NBSP}%`);
    expect(fmtSignedPct(0.3)).toBe('=');
    expect(fmtSignedPct(null)).toBe('–');
    expect(fmtSignedPct(undefined)).toBe('–');
    expect(fmtSignedPct(0.5)).toBe('=');
    expect(fmtSignedPct(1.5)).toBe(`+2${NBSP}%`);
  });
  it('fmtPercent', () => {
    expect(fmtPercent(12.4)).toBe(`12${NBSP}%`);
    expect(fmtPercent(12.45, 1)).toBe(`12,4${NBSP}%`);
  });
});

describe('plural', () => {
  it("0 et 1 au singulier, comme en français (plural(61, 'vol') = « 61 vols »)", () => {
    expect(plural(61, 'vol')).toBe(`61${NBSP}vols`);
    expect(plural(1, 'vol')).toBe(`1${NBSP}vol`);
    expect(plural(0, 'vol')).toBe(`0${NBSP}vol`);
    expect(plural(2, 'vol')).toBe(`2${NBSP}vols`);
    expect(plural(9587, 'vol')).toBe(`9${T}587${NBSP}vols`);
  });
  it('pluriel irrégulier', () => {
    expect(plural(3, 'cheval', 'chevaux')).toBe(`3${NBSP}chevaux`);
    expect(plural(1, 'cheval', 'chevaux')).toBe(`1${NBSP}cheval`);
  });
});

describe('dates', () => {
  it('fmtDate', () => {
    expect(fmtDate('2026-07-12')).toBe(`12${NBSP}juillet`);
    expect(fmtDate('2026-07-12', { withYear: true })).toBe(`12${NBSP}juillet${NBSP}2026`);
    expect(fmtDate('2026-07-12', { withYear: true, weekday: true })).toBe(
      `dimanche 12${NBSP}juillet${NBSP}2026`,
    );
    expect(fmtDate('2026-03-01')).toBe(`1${NBSP}mars`);
  });
  it('fmtDate rejette une date invalide', () => {
    expect(() => fmtDate('hier')).toThrow();
  });
  it('fmtRange', () => {
    expect(fmtRange('2026-03-03', '2026-03-03')).toBe(`le 3${NBSP}mars`);
    expect(fmtRange('2026-03-03', '2026-03-07')).toBe(`du 3 au 7${NBSP}mars`);
    expect(fmtRange('2026-02-28', '2026-03-03')).toBe(`du 28${NBSP}février au 3${NBSP}mars`);
  });
  it('fmtDateShort et fmtDateNumeric', () => {
    expect(fmtDateShort('2026-07-12')).toBe(`12${NBSP}juil.`);
    expect(fmtDateShort('2026-05-01')).toBe(`1${NBSP}mai`);
    expect(fmtDateNumeric('2026-07-02')).toBe('02/07/2026');
  });
  it('jours : lundi en tête', () => {
    expect(DAYS_LONG[0]).toBe('lundi');
  });
});

describe('fmtOrDash', () => {
  it('remplace une valeur absente', () => {
    expect(fmtOrDash(null, fmtInt)).toBe(EMPTY);
    expect(fmtOrDash(undefined, fmtInt)).toBe(EMPTY);
    expect(fmtOrDash(1500, fmtInt)).toBe(`1${T}500`);
    expect(fmtOrDash(0, fmtInt)).toBe('0');
  });
});
