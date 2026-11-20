// Budgets de poids (phase 6.2) : `npm run size` après `npm run build`. Sans dépendance.
// - JS initial : le script de `index.html` et ses `modulepreload`, en gzip ;
// - données initiales : `meta.json` + `flights.<hash>.json` + `sites.<hash>.json` (ce que charge DataProvider), en gzip.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_JS_KB = 250;
export const BUDGET_DATA_KB = 250; // relevé de 200 Ko le 20/11/2026 (D21)

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).replace('.', ',') + ' Ko';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html introuvable : lancer `npm run build` d’abord.');
  process.exit(2);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.js)"[^>]*>/g)].map((m) => m[1]);
const base = (html.match(/<script[^>]*src="([^"]*?)assets\//) ?? [])[1] ?? '/';
const jsFiles = [...new Set(refs)].map((r) => join(dist, r.slice(base.length)));
const js = jsFiles.map((f) => ({ f, gz: gz(f) }));
const jsTotal = js.reduce((a, b) => a + b.gz, 0);

const dataDir = join(dist, 'data');
const dataFiles = [
  'meta.json',
  ...readdirSync(dataDir).filter((n) => /^(flights|sites)\.[0-9a-f]+\.json$/.test(n)),
];
const data = dataFiles.map((n) => ({ f: n, gz: gz(join(dataDir, n)) }));
const dataTotal = data.reduce((a, b) => a + b.gz, 0);

const cssFiles = (html.match(/href="[^"]+\.css"/g) ?? []).map((h) =>
  join(dist, h.slice(6 + base.length - 1, -1)),
);
console.log('JS initial (gzip) :');
for (const { f, gz: g } of js.sort((a, b) => b.gz - a.gz).slice(0, 5))
  console.log(`  ${kb(g).padStart(10)}  ${f.split('/').pop()}`);
console.log(`  ${js.length} fichiers, total ${kb(jsTotal)} (budget ${BUDGET_JS_KB} Ko)`);
console.log(`CSS initial (gzip) : ${kb(cssFiles.filter(existsSync).reduce((a, f) => a + gz(f), 0))}`);
console.log('Données initiales (gzip) :');
for (const { f, gz: g } of data) console.log(`  ${kb(g).padStart(10)}  ${f}`);
console.log(`  total ${kb(dataTotal)} (budget ${BUDGET_DATA_KB} Ko)`);

let failed = false;
if (jsTotal > BUDGET_JS_KB * 1024) {
  console.error(`ÉCHEC : JS initial ${kb(jsTotal)} > ${BUDGET_JS_KB} Ko`);
  failed = true;
}
if (dataTotal > BUDGET_DATA_KB * 1024) {
  console.error(`ÉCHEC : données initiales ${kb(dataTotal)} > ${BUDGET_DATA_KB} Ko`);
  failed = true;
}
process.exit(failed ? 1 : 0);
