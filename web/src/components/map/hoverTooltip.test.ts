import { describe, expect, it } from 'vitest';
import { buildHoverContent, clusterHoverText, siteHoverText } from '@/components/map/hoverTooltip';

const N = ' ';

describe('siteHoverText', () => {
  it('donne le nom, les vols et la discipline dominante', () => {
    expect(siteHoverText({ name: 'Lavaud', flights: 9, dominant: 'paramoteur' })).toEqual({
      title: 'Lavaud',
      detail: `9${N}vols · Paramoteur`,
    });
  });
  it('accorde le singulier et omet la discipline quand elle est indéterminée', () => {
    expect(siteHoverText({ name: 'X', flights: 1, dominant: 'tout' })).toEqual({
      title: 'X',
      detail: `1${N}vol`,
    });
    expect(siteHoverText({ name: 'X', flights: 2 }).detail).toBe(`2${N}vols`);
  });
});

describe('clusterHoverText', () => {
  it('donne sites et vols', () => {
    expect(clusterHoverText({ point_count: 12, flights: 340 })?.title).toBe(`12${N}sites · 340${N}vols`);
    expect(clusterHoverText({ point_count: 2, flights: 1 })?.title).toBe(`2${N}sites · 1${N}vol`);
  });
  it('se replie sur les sites seuls sans total de vols', () => {
    expect(clusterHoverText({ point_count: 5 })?.title).toBe(`5${N}sites`);
  });
  it('renvoie null sans nombre de sites exploitable', () => {
    expect(clusterHoverText({})).toBeNull();
    expect(clusterHoverText({ point_count: 'x' })).toBeNull();
  });
});

describe('buildHoverContent', () => {
  it("n'interprète jamais le HTML", () => {
    const el = buildHoverContent({ title: '<img src=x onerror=alert(1)>', detail: '<b>1</b>' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('<img');
  });
});
