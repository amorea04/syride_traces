// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveInside } from '../vite.data-path';

const ROOT = '/srv/data';

describe('resolveInside', () => {
  it('accepte un fichier du dossier', () => {
    expect(resolveInside(ROOT, 'meta.json')).toBe('/srv/data/meta.json');
    expect(resolveInside(ROOT, 'insights/a%20b.json')).toBe('/srv/data/insights/a b.json');
  });
  it('refuse la traversée, y compris vers un dossier voisin de même préfixe', () => {
    expect(resolveInside(ROOT, '../secret')).toBeNull();
    expect(resolveInside(ROOT, '../data-secret/x.json')).toBeNull();
    expect(resolveInside(ROOT, '%2e%2e/data-secret/x.json')).toBeNull();
    expect(resolveInside(ROOT, 'a/../../x')).toBeNull();
  });
  it('refuse un encodage invalide, un octet nul et la racine seule', () => {
    expect(resolveInside(ROOT, '%E0%A4%A')).toBeNull();
    expect(resolveInside(ROOT, 'a%00b')).toBeNull();
    expect(resolveInside(ROOT, '')).toBeNull();
  });
});
