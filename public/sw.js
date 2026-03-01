/**
 * ResQMesh Service Worker — Full Offline Support
 * Caches app shell + Leaflet map tiles so the system
 * works with ZERO internet after first load.
 */

const CACHE_NAME = 'resqmesh-v1';
const MAP_CACHE = 'resqmesh-map-tiles-v1';

// Core app shell files to pre-cache
const APP_SHELL = [
    '/',
    '/index.html',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME && k !== MAP_CACHE)
                    .map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch: serve from cache, fallback to network (cache-first for tiles)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // ⚠️ DEV MODE: Never intercept localhost — let Vite HMR work normally.
    // The SW only caches on a real deployed origin (not localhost / 127.0.0.1).
    const isLocalDev =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname.endsWith('.local');

    if (isLocalDev) return; // pass through to network, no caching

    // Map tile caching (OpenStreetMap / CartoDB)
    const isMapTile =
        url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('basemaps.cartocdn.com') ||
        url.hostname.includes('cartodb-basemaps');

    if (isMapTile) {
        event.respondWith(
            caches.open(MAP_CACHE).then(async (cache) => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                try {
                    const response = await fetch(event.request);
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                } catch {
                    // Return blank tile if offline and not cached
                    return new Response('', { status: 204 });
                }
            })
        );
        return;
    }

    // App shell: cache first, then network (production only)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return (
                    cached ||
                    fetch(event.request).then((response) => {
                        return caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, response.clone());
                            return response;
                        });
                    })
                );
            })
        );
        return;
    }
});
