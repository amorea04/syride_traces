# Brief commun, phase 2 : socle front et design

Lis d'abord `ROADMAP_WEBAPP.md` : §3.2 (choix techniques), §3.3 bis, §3.4 (arborescence), §4 (contrat de données), §5.0 (gabarit), §6 (direction artistique), §8 « Phase 2 », §9.1, §11 (décisions, surtout **D12**).
Le contrat fait foi : `src/web_export/schema.json` (JSON Schema 2020-12). Données d'exemple : `web/tests/fixtures/data/` (synthétiques, commitables) ; vraies données : `web/public/data/` (ignorées par Git, ne jamais les copier ailleurs).

## Contexte technique
- Racine : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/` ; branche `web/phase-2-socle` (déjà créée, ne change pas de branche).
- Node 22 LTS (`node -v` = v22.23.4), npm 10. Tout le front vit dans `web/`.
- Pile imposée : React 19 + Vite + TypeScript strict, Mantine 8 (+ `@tabler/icons-react`), ECharts 5 via `echarts-for-react`, MapLibre GL JS (tuiles OpenFreeMap, sans clé), TanStack Table v8 + `@tanstack/react-virtual`, Zustand, React Router 7 (mode SPA, `BrowserRouter` + `_redirects`), Vitest, Playwright, ESLint (flat config), Prettier, `json-schema-to-typescript`.
- Versions **exactes** dans `package.json` (pas de `^`/`~`), `package-lock.json` commitable. Alias d'import `@/` → `web/src/`.
- Python (pour le script de non-régression des stats) : `python` = anaconda **3.8.16**, pandas présent ; pas de syntaxe 3.9+ évaluée à l'exécution ; n'installe aucun paquet Python. Lancer les tests Python : `make test-py`.
- Règle partagée Python/TS : **moyennes et max ignorent les valeurs ≤ 0** (déjà exportées en `null` par le schéma) ; un vol `incomplete` est compté mais ses mesures restent telles qu'exportées.
- Lien Syride unique : `https://www.syride.com/fr/pilotes/<pseudo exact, URL-encodé>/<syride_num>` (fonction `syrideFlightUrl()` dans `web/src/lib/syride.ts`).
- Clé de vol : `pilot_slugs[pilot] + "-" + syride_num` (la colonne `key` n'est pas exportée).

## Interdits
- **D12** : aucune trace, aucune géométrie de vol, aucune coordonnée par vol ; la position d'un vol est celle de son site.
- Ne commite rien, aucune opération git (le maître d'œuvre s'en charge). Ne touche pas à `sites_coordinates.json` (modification locale d'Adrien).
- Ne modifie pas `ROADMAP_WEBAPP.md` (le maître d'œuvre coche).
- **Ne touche qu'aux fichiers de ton lot** : d'autres agents travaillent en parallèle dans le même dossier. N'ajoute aucune dépendance npm après le scaffold (si c'est indispensable, signale-le dans ton compte rendu au lieu de l'installer).
- Refus d'Adrien : badges, médailles, confettis, podium, scène de ciel, radar, croisement sites × mois, visite guidée, percentile de groupe.
- Aucun appel réseau à l'exécution hors données locales et tuiles OpenFreeMap ; polices système uniquement (D10).

## Conventions
- Code, commentaires et libellés en français, sobres ; constantes nommées ; fonctions pures testées dans `web/src/lib/` ; pas de `any` non justifié.
- Nombres au format français (espace fine insécable pour les milliers, virgule décimale, « 2 096 h 01 ») : règles de `src/rapport/report_format.py`.
- Tests Vitest à côté du code (`*.test.ts`) ou dans `web/tests/` ; ils tournent sur les fixtures synthétiques, jamais sur `web/public/data/`.
- Commandes : `cd web && npm run lint && npm run typecheck && npm test` doivent passer à la fin de chaque lot.

## Compte rendu attendu (ton dernier message, factuel)
Ce qui est fait et vérifié, ce qui ne l'est pas (et pourquoi), fichiers créés ou modifiés, résultats des commandes (sortie résumée), chiffres mesurés, points d'attention pour le relecteur.
