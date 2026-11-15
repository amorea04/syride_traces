// Génère src/data/schema.gen.ts depuis ../src/web_export/schema.json (un type exporté par $defs).
import { readFile, writeFile } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const SCHEMA = new URL('../../src/web_export/schema.json', import.meta.url);
const OUT = new URL('../src/data/schema.gen.ts', import.meta.url);
const BANNER = `/* eslint-disable */
// FICHIER GÉNÉRÉ par \`npm run gen:types\` à partir de src/web_export/schema.json. Ne pas modifier à la main.
`;

// Noms de définitions qui masqueraient un global (Date) : renommés dans les types générés.
const RENAMES = { Date: 'IsoDate', Time: 'ClockTime' };

const raw = (await readFile(SCHEMA, 'utf8')).replace(
  /#\/\$defs\/(Date|Time)"/g,
  (_, n) => `#/$defs/${RENAMES[n]}"`,
);
const schema = JSON.parse(raw);
const defs = Object.fromEntries(
  Object.entries(schema.$defs ?? {}).map(([k, v]) => {
    const name = RENAMES[k] ?? k;
    // Le titre du schéma (chemin de fichier) est remplacé par le nom de la définition.
    return [name, { ...v, title: name }];
  }),
);
// Schéma racine = objet qui référence chaque définition, pour qu'elles soient toutes exportées.
const root = {
  $schema: schema.$schema,
  title: 'SchemaRoot',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(Object.keys(defs).map((k) => [k, { $ref: `#/$defs/${k}` }])),
  $defs: defs,
};
const ts = await compile(root, 'SchemaRoot', {
  bannerComment: BANNER,
  additionalProperties: false,
  format: true,
});
await writeFile(OUT, ts);
console.log(`écrit ${OUT.pathname} (${Object.keys(defs).length} définitions)`);
