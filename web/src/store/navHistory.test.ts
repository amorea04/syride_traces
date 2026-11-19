import { describe, expect, it } from 'vitest';
import { backSteps, emptyNavHistory, recordNavigation, type NavHistory } from '@/store/navHistory';

const at = (state: NavHistory, key: string, pathname: string, type: 'PUSH' | 'REPLACE' | 'POP') =>
  recordNavigation(state, { key, pathname }, type);

describe('pile des pages visitées', () => {
  it('première page : pas de retour dans l’application', () => {
    const s = at(emptyNavHistory(), 'default', '/vol/x', 'POP');
    expect(s).toEqual({ entries: [{ key: 'default', pathname: '/vol/x' }], index: 0 });
    expect(backSteps(s)).toBeNull();
  });
  it('les changements de filtre sur le même chemin sont sautés', () => {
    let s = at(emptyNavHistory(), 'default', '/vols', 'POP');
    s = at(s, 'k1', '/vol/x', 'PUSH');
    s = at(s, 'k2', '/vol/x', 'PUSH');
    s = at(s, 'k3', '/vol/x', 'PUSH');
    expect(backSteps(s)).toBe(3);
  });
  it('REPLACE remplace l’entrée courante sans l’empiler', () => {
    let s = at(emptyNavHistory(), 'default', '/vols', 'POP');
    s = at(s, 'k1', '/vol/x', 'PUSH');
    s = at(s, 'k2', '/vol/x', 'REPLACE');
    expect(s.entries).toHaveLength(2);
    expect(backSteps(s)).toBe(1);
  });
  it('retour du navigateur : la pile se replace sur l’entrée connue, l’avance aussi', () => {
    let s = at(emptyNavHistory(), 'default', '/vols', 'POP');
    s = at(s, 'k1', '/vol/x', 'PUSH');
    s = at(s, 'k2', '/vol/x', 'PUSH');
    s = at(s, 'k1', '/vol/x', 'POP');
    expect(s.index).toBe(1);
    expect(backSteps(s)).toBe(1);
    s = at(s, 'default', '/vols', 'POP');
    expect(backSteps(s)).toBeNull();
    s = at(s, 'k2', '/vol/x', 'POP');
    expect(s.index).toBe(2);
    expect(backSteps(s)).toBe(2);
  });
  it('un PUSH après un retour coupe les entrées « en avant »', () => {
    let s = at(emptyNavHistory(), 'default', '/vols', 'POP');
    s = at(s, 'k1', '/vol/x', 'PUSH');
    s = at(s, 'default', '/vols', 'POP');
    s = at(s, 'k2', '/sites', 'PUSH');
    expect(s.entries.map((e) => e.pathname)).toEqual(['/vols', '/sites']);
  });
  it('entrée inconnue (rechargement) : repart d’une pile à une page', () => {
    let s = at(emptyNavHistory(), 'default', '/vols', 'POP');
    s = at(s, 'k1', '/vol/x', 'PUSH');
    s = at(s, 'zzz', '/vol/x', 'POP');
    expect(backSteps(s)).toBeNull();
  });
});
