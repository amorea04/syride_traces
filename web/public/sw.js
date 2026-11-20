/* Service worker (phase 6.4), écrit à la main : hors ligne pour la coquille et les données déjà vues.
 * Stratégies (voir sw-routing.js pour la classification) :
 *  - coquille : index.html précaché (clé = le scope, « / ») ; /assets/* cache-first (noms hashés, immuables).
 *    Purge de la coquille : sw.js ne change pas à chaque déploiement, donc l'install ne suffit pas. Chaque fois que
 *    l'index.html reçu en navigation (ou à l'install) désigne d'autres fichiers compilés que l'index en cache, on
 *    supprime du cache coquille tous les /assets/* que le nouvel index ne référence pas (ils appartiennent à l'ancien
 *    déploiement) ; les chunks paresseux du nouveau se remettent en cache au fil des chargements. Aucune réponse
 *    redirigée n'est mise en cache (Cloudflare Pages redirige /index.html vers / et /offline.html vers /offline) :
 *    elle est reconstruite (cleanResponse) et rangée sous une clé fixe ;
 *  - data/meta.json : stale-while-revalidate (le cache est servi, puis mis à jour pour le chargement suivant) ;
 *  - data/*.json hashés : cache-first ; purge de ce que le meta courant et le précédent ne référencent plus ;
 *  - tuiles OpenFreeMap : cache-first dans un cache plafonné (FIFO, purge groupée) ; styles : réseau d'abord ;
 *  - navigation : réseau d'abord, sinon index.html en cache, sinon offline.html.
 * Aucun autre domaine n'est mis en cache (liens syride.com : toujours le réseau). */
/* global SyrideSw */
importScripts('sw-routing.js');

var SCOPE = self.registration.scope;
var C = SyrideSw.CACHES;
var INDEX_URL = SCOPE;
var OFFLINE_URL = SCOPE + 'offline.html';
var META_URL = SCOPE + 'data/meta.json';
// Les fichiers sont servis avec « Vary: Origin » : sans cette option, une requête de module (mode cors) ne retrouverait
// pas la réponse mise en cache par `cache.add`. Les noms sont hashés : ignorer Vary est sans risque.
var MATCH = { ignoreVary: true };

function relPath(url) {
  return new URL(url).pathname.slice(new URL(SCOPE).pathname.length);
}

async function putOk(cache, request, response) {
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

/** Met en cache une page de la coquille (sans indicateur de redirection). */
async function putShellPage(cache, key, response) {
  await cache.put(key, await SyrideSw.cleanResponse(response.clone()));
}

/** Retire du cache coquille les /assets/* que l'index désigné ne référence pas (voir l'en-tête). */
async function purgeShellAssets(shell, html) {
  var wanted = SyrideSw.assetsOfIndex(html, SCOPE);
  var keys = await shell.keys();
  var stale = SyrideSw.staleAssetPaths(
    keys.map(function (k) {
      return relPath(k.url);
    }),
    wanted,
  );
  await Promise.all(
    stale.map(function (p) {
      return shell.delete(SCOPE + p);
    }),
  );
}

/** Index précédemment mis en cache (texte), ou null. */
async function cachedIndexHtml(shell) {
  var hit = await shell.match(INDEX_URL, MATCH);
  return hit ? hit.text() : null;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    (async function () {
      var shell = await caches.open(C.shell);
      var offlineResponse = await fetch(OFFLINE_URL, { cache: 'reload' });
      if (offlineResponse.ok) await putShellPage(shell, OFFLINE_URL, offlineResponse);
      var indexResponse = await fetch(INDEX_URL, { cache: 'reload' });
      if (indexResponse.ok) {
        await putShellPage(shell, INDEX_URL, indexResponse);
        var html = await indexResponse.clone().text();
        await purgeShellAssets(shell, html);
        // La page courante a déjà chargé ces fichiers avant l'installation : on les met à l'abri pour le hors ligne.
        await Promise.all(
          SyrideSw.assetsOfIndex(html, SCOPE).map(function (p) {
            return shell.add(SCOPE + p).catch(function () {});
          }),
        );
      }
      var data = await caches.open(C.data);
      var metaResponse = await fetch(META_URL, { cache: 'no-store' });
      if (metaResponse.ok) {
        await data.put(META_URL, metaResponse.clone());
        var meta = await metaResponse.json();
        await Promise.all(
          SyrideSw.initialDataFiles(meta).map(function (f) {
            return data.add(SCOPE + 'data/' + f).catch(function () {});
          }),
        );
      }
    })().catch(function () {
      /* Installation partielle : le service worker fonctionnera, avec moins de cache. */
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      var names = await caches.keys();
      await Promise.all(
        SyrideSw.obsoleteCaches(names).map(function (n) {
          return caches.delete(n);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(cacheName, request) {
  var cache = await caches.open(cacheName);
  var hit = await cache.match(request, MATCH);
  if (hit) return hit;
  return putOk(cache, request, await fetch(request));
}

async function navigate(request) {
  try {
    var response = await fetch(request);
    // Toute page de l'application est le même index.html (repli SPA) : on garde la version la plus récente.
    if (response.ok && (response.headers.get('content-type') || '').indexOf('text/html') >= 0) {
      var shell = await caches.open(C.shell);
      var html = await response.clone().text();
      var before = await cachedIndexHtml(shell);
      await putShellPage(shell, INDEX_URL, response);
      if (
        before !== null &&
        !SyrideSw.sameAssets(SyrideSw.assetsOfIndex(before, SCOPE), SyrideSw.assetsOfIndex(html, SCOPE))
      )
        await purgeShellAssets(shell, html);
    }
    return response;
  } catch {
    var cached = await caches.match(INDEX_URL, MATCH);
    return cached || (await caches.match(OFFLINE_URL, MATCH)) || Response.error();
  }
}

async function purgeStaleData(current, previous) {
  var cache = await caches.open(C.data);
  var keys = await cache.keys();
  var stale = SyrideSw.staleDataPaths(
    keys.map(function (k) {
      return relPath(k.url);
    }),
    current,
    previous,
  );
  await Promise.all(
    stale.map(function (p) {
      return cache.delete(SCOPE + p);
    }),
  );
}

async function refreshMeta(cache, previousMeta) {
  var response = await fetch(META_URL, { cache: 'no-store' });
  if (!response.ok) return response;
  await cache.put(META_URL, response.clone());
  try {
    await purgeStaleData(await response.clone().json(), previousMeta);
  } catch {
    /* Purge facultative. */
  }
  return response;
}

async function metaStrategy(event) {
  var cache = await caches.open(C.data);
  var hit = await cache.match(META_URL, MATCH);
  var meta = null;
  if (hit) {
    try {
      meta = await hit.clone().json();
    } catch {
      meta = null;
    }
  }
  // Un meta en cache n'est servi que si ses données initiales sont aussi en cache (sinon : réseau).
  var usable = false;
  if (meta) {
    var needed = SyrideSw.initialDataFiles(meta);
    var found = await Promise.all(
      needed.map(function (f) {
        return cache.match(SCOPE + 'data/' + f, MATCH);
      }),
    );
    usable = found.every(Boolean);
  }
  var update = refreshMeta(cache, meta);
  if (usable) {
    event.waitUntil(update.catch(function () {}));
    return hit;
  }
  try {
    var fresh = await update;
    // Réponse non valide (5xx…) alors qu'un meta est en cache : on garde le cache.
    return !fresh.ok && hit ? hit : fresh;
  } catch (error) {
    if (hit) return hit;
    throw error;
  }
}

// Purge des tuiles différée : on ne liste pas le cache à chaque écriture. Elle part après un court silence ou dès
// qu'assez d'écritures se sont accumulées ; l'éviction reste FIFO (les plus anciennes clés d'abord).
var tileWrites = 0;
var tileTimer = null;

async function trimTiles() {
  tileWrites = 0;
  var cache = await caches.open(C.tiles);
  var keys = await cache.keys();
  var extra = SyrideSw.overflow(keys.length, SyrideSw.TILE_MAX_ENTRIES);
  for (var i = 0; i < extra; i++) await cache.delete(keys[i]);
}

function scheduleTileTrim() {
  tileWrites++;
  if (tileTimer) clearTimeout(tileTimer);
  if (tileWrites >= SyrideSw.TILE_PURGE_EVERY) {
    tileTimer = null;
    trimTiles().catch(function () {});
    return;
  }
  tileTimer = setTimeout(function () {
    tileTimer = null;
    trimTiles().catch(function () {});
  }, SyrideSw.TILE_PURGE_DELAY_MS);
}

async function tileStrategy(request) {
  var cache = await caches.open(C.tiles);
  var hit = await cache.match(request, MATCH);
  if (hit) return hit;
  var response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    scheduleTileTrim();
  }
  return response;
}

async function tileStyleStrategy(request) {
  var cache = await caches.open(C.tiles);
  try {
    return await putOk(cache, request, await fetch(request));
  } catch (error) {
    var hit = await cache.match(request, MATCH);
    if (hit) return hit;
    throw error;
  }
}

// La page signale les fichiers qu'elle a déjà chargés avant d'être contrôlée (chunk de la route courante, graphiques…) :
// on les enregistre pour que le rechargement hors ligne de cette même page fonctionne.
self.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || data.type !== 'cache-loaded' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      SyrideSw.urlsToCache(data.urls, SCOPE).map(async function (item) {
        var cache = await caches.open(item.cache === 'data' ? C.data : C.shell);
        if (await cache.match(item.url, MATCH)) return;
        try {
          await cache.add(item.url);
        } catch {
          /* Réseau indisponible : tant pis. */
        }
      }),
    ),
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var kind = SyrideSw.classify(request, request.url, SCOPE);
  switch (kind) {
    case 'navigate':
      event.respondWith(navigate(request));
      break;
    case 'asset':
      event.respondWith(cacheFirst(C.shell, request));
      break;
    case 'data':
      event.respondWith(cacheFirst(C.data, request));
      break;
    case 'meta':
      event.respondWith(metaStrategy(event));
      break;
    case 'tile':
      event.respondWith(tileStrategy(request));
      break;
    case 'tile-style':
      event.respondWith(tileStyleStrategy(request));
      break;
    default:
      break;
  }
});
