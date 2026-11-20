/* Logique de routage du service worker (phase 6.4), en fonctions pures : testée par Vitest (tests/sw.test.ts).
 * Script classique (chargé par `importScripts` dans sw.js), sans dépendance : expose `self.SyrideSw`. */
(function (root) {
  'use strict';

  var TILE_HOST = 'tiles.openfreemap.org';
  /** Plafond du cache des tuiles (entrées), éviction FIFO. */
  var TILE_MAX_ENTRIES = 300;
  /** Purge des tuiles groupée : après ce délai sans nouvelle écriture (ms), ou dès ce nombre d'écritures en attente. */
  var TILE_PURGE_DELAY_MS = 2000;
  var TILE_PURGE_EVERY = 25;

  /** Noms de caches : changer la version purge tout l'ancien à l'activation. */
  var VERSION = 'v2';
  var CACHES = {
    shell: 'syride-shell-' + VERSION,
    data: 'syride-data-' + VERSION,
    tiles: 'syride-tiles-' + VERSION,
  };

  /**
   * Stratégie à appliquer à une requête.
   * @param {{method: string, mode?: string}} request
   * @param {string} url URL absolue de la requête
   * @param {string} scope URL absolue du scope du service worker (se termine par « / »)
   * @returns {'ignore'|'navigate'|'asset'|'meta'|'data'|'tile'|'tile-style'}
   */
  function classify(request, url, scope) {
    if (request.method !== 'GET') return 'ignore';
    var u = new URL(url);
    var s = new URL(scope);
    if (u.host === TILE_HOST && u.protocol === 'https:')
      return /\/styles\//.test(u.pathname) ? 'tile-style' : 'tile';
    if (u.origin !== s.origin || u.pathname.indexOf(s.pathname) !== 0) return 'ignore';
    var rel = u.pathname.slice(s.pathname.length);
    if (rel.indexOf('assets/') === 0) return 'asset';
    if (rel === 'data/meta.json') return 'meta';
    if (rel.indexOf('data/') === 0 && /\.json$/.test(rel)) return 'data';
    if (request.mode === 'navigate') return 'navigate';
    return 'ignore';
  }

  /** Fichiers de données (chemins relatifs à `data/`) que désigne un `meta.json`. */
  function dataFilesOfMeta(meta) {
    var out = [];
    if (meta && meta.files) {
      if (meta.files.flights) out.push(meta.files.flights);
      if (meta.files.sites) out.push(meta.files.sites);
    }
    if (meta && Array.isArray(meta.insights)) {
      for (var i = 0; i < meta.insights.length; i++)
        if (meta.insights[i].file) out.push(meta.insights[i].file);
    }
    return out;
  }

  /** Données initiales d'un meta (celles que charge toujours l'application). */
  function initialDataFiles(meta) {
    return meta && meta.files ? [meta.files.flights, meta.files.sites].filter(Boolean) : [];
  }

  /** Chemins relatifs (`assets/…`) des scripts et feuilles de style que référence un `index.html`. */
  function assetsOfIndex(html, scope) {
    var base = new URL(scope).pathname;
    var out = [];
    var re = /(?:src|href)="([^"]+\.(?:js|css|mjs))"/g;
    var m;
    while ((m = re.exec(html))) {
      var path = m[1];
      if (path.indexOf(base) === 0) path = path.slice(base.length);
      else if (path.charAt(0) === '/') continue;
      if (path.indexOf('assets/') === 0 && out.indexOf(path) < 0) out.push(path);
    }
    return out;
  }

  /**
   * Données hashées à supprimer du cache : celles que ne référence ni le meta courant ni le précédent
   * (deux générations, pour ne pas retirer ce qu'une page encore servie avec l'ancien meta va demander).
   * @param {string[]} cachedPaths chemins relatifs à la racine du scope (`data/flights.xxx.json`)
   */
  function staleDataPaths(cachedPaths, currentMeta, previousMeta) {
    var keep = {};
    var files = dataFilesOfMeta(currentMeta).concat(dataFilesOfMeta(previousMeta));
    for (var i = 0; i < files.length; i++) keep['data/' + files[i]] = true;
    keep['data/meta.json'] = true;
    return cachedPaths.filter(function (p) {
      return p.indexOf('data/') === 0 && !keep[p];
    });
  }

  /**
   * Parmi des URLs que la page a déjà chargées (avant que le service worker la contrôle), celles à mettre en cache :
   * fichiers compilés et données hashées de l'application, jamais le reste.
   * @returns {{url: string, cache: 'shell'|'data'}[]}
   */
  function urlsToCache(urls, scope) {
    var out = [];
    var seen = {};
    for (var i = 0; i < urls.length; i++) {
      var url = urls[i];
      if (typeof url !== 'string' || seen[url]) continue;
      seen[url] = true;
      var kind;
      try {
        kind = classify({ method: 'GET' }, url, scope);
      } catch {
        continue;
      }
      if (kind === 'asset') out.push({ url: url, cache: 'shell' });
      else if (kind === 'data') out.push({ url: url, cache: 'data' });
    }
    return out;
  }

  /** Nombre d'entrées les plus anciennes à retirer pour revenir sous le plafond. */
  function overflow(count, max) {
    return Math.max(0, count - max);
  }

  /**
   * Fichiers compilés à retirer du cache coquille : ceux que l'`index.html` courant ne référence pas.
   * À appeler quand l'index change de déploiement (les fichiers déjà en cache sont alors ceux de l'ancien).
   * @param {string[]} cachedPaths chemins relatifs à la racine du scope
   * @param {string[]} indexAssets `assetsOfIndex` de l'index courant
   */
  function staleAssetPaths(cachedPaths, indexAssets) {
    return cachedPaths.filter(function (p) {
      return p.indexOf('assets/') === 0 && indexAssets.indexOf(p) < 0;
    });
  }

  /** Vrai si deux index ne désignent pas les mêmes fichiers compilés (nouveau déploiement). */
  function sameAssets(a, b) {
    if (a.length !== b.length) return false;
    return a.every(function (p) {
      return b.indexOf(p) >= 0;
    });
  }

  /**
   * Une réponse issue d'une redirection (`redirected === true`, ex. /index.html → / sur Cloudflare Pages) ne peut pas
   * être servie à une navigation : on la reconstruit sans cet indicateur avant de la mettre en cache.
   */
  async function cleanResponse(response) {
    if (!response.redirected) return response;
    var body = await response.blob();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  /** Caches de ce service worker à supprimer (anciennes versions et caches inconnus du même préfixe). */
  function obsoleteCaches(names) {
    var current = [CACHES.shell, CACHES.data, CACHES.tiles];
    return names.filter(function (n) {
      return n.indexOf('syride-') === 0 && current.indexOf(n) < 0;
    });
  }

  root.SyrideSw = {
    CACHES: CACHES,
    TILE_MAX_ENTRIES: TILE_MAX_ENTRIES,
    TILE_PURGE_DELAY_MS: TILE_PURGE_DELAY_MS,
    TILE_PURGE_EVERY: TILE_PURGE_EVERY,
    staleAssetPaths: staleAssetPaths,
    sameAssets: sameAssets,
    cleanResponse: cleanResponse,
    classify: classify,
    dataFilesOfMeta: dataFilesOfMeta,
    initialDataFiles: initialDataFiles,
    assetsOfIndex: assetsOfIndex,
    staleDataPaths: staleDataPaths,
    urlsToCache: urlsToCache,
    overflow: overflow,
    obsoleteCaches: obsoleteCaches,
  };
})(self);
