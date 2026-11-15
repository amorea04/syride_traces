import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Chemin absolu du fichier demandé sous `root`, ou `null` si la requête est mal encodée ou sort du dossier
 * (traversée `..`, chemin absolu, autre lecteur). La garde repose sur `path.relative`, pas sur un préfixe de chaîne.
 */
export function resolveInside(root: string, requested: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = resolve(root, decoded);
  const rel = relative(root, file);
  if (rel === '' || rel === '..' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return file;
}
