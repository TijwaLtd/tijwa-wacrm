/* Tijwa CRM service worker.
 *
 * Deliberately small and vanilla — no Workbox build step. Three jobs:
 *   1. Web Push: receive push events, show an OS notification (unless
 *      a window already has focus, in which case hand the payload to
 *      the page for an in-app toast).
 *   2. notificationclick: focus / navigate the app to the payload URL.
 *   3. Offline: network-first navigations with an /offline.html
 *      fallback; cache-first only for immutable static assets.
 *
 * NEVER cache /api/* or authenticated HTML bodies — the CRM is fully
 * dynamic and cached auth state is a security foot-gun.
 */

const VERSION = 'v1';
const STATIC_CACHE = `tijwa-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('tijwa-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Web Push ──────────────────────────────────────────────────
// Payload shape (see src/lib/notifications/push.ts):
//   { title, body, url, tag, icon?, badge? }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: 'Tijwa CRM', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Tijwa CRM';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'tijwa',
    renotify: true,
    data: { url: payload.url || '/dashboard' },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(
    (async () => {
      // If any same-origin window is focused, the page's realtime
      // listener already showed a toast — skip the OS notification
      // so the user doesn't get both.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const focused = clients.some((c) => c.focused);
      if (focused) {
        for (const client of clients) {
          client.postMessage({ type: 'tijwa:push', payload });
        }
        return;
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an already-open window (any OS) instead of spawning a
      // duplicate — matches how chat apps restore instead of stack.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API + auth/session traffic: straight to the network, never cached.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/auth/')) return;

  // Immutable build assets + icons: cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/site.webmanifest'
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations: network-first, offline → cached fallback page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }),
    );
  }
});
