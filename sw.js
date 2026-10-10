/*
Copyright © Andrew Bethell. All rights reserved.
Created by Andrew Bethell in his own time for his father following a stroke.
Developed by Andrew Bethell in his own time and at his own expense.
Educational simulation tool. Not for clinical decision-making.
*/

// Change this internal cache revision whenever the published app shell changes.
const CACHE_NAME = 'mnv-shell-password-keyboard-20261010';
const ASSET_CACHE_NAME = 'mnv-assets-cache';
const urlsToCache = [
  './', './index.html', './style.css', './script.js',
  './assets/vendor/lz-string-1.5.0.min.js', './manifest.json', './app-version.json',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
  './assets/favicon-32.png', './assets/favicon.png'
];

async function getShellStatus() {
  const cache = await caches.open(CACHE_NAME);
  const missingFiles = [];
  for (const path of urlsToCache) {
    const response = await cache.match(new URL(path, self.registration.scope).href);
    if (!response || !response.ok) missingFiles.push(path);
  }
  return { cacheName: CACHE_NAME, missingFiles, ready: missingFiles.length === 0 };
}

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  // Commit the whole batch. Never overwrite a working file with an HTTP error.
  await cache.addAll(urlsToCache.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
}

self.addEventListener('install', event => {
  event.waitUntil(installShell());
});

self.addEventListener('activate', event => {
  // Older caches remain available to older workers and for rollback.
  event.waitUntil(self.clients.claim());
});

async function serveRequest(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return fetch(request);

  // Update checks must see the website's version, not the installed snapshot.
  if (url.pathname === new URL('./app-version.json', scope).pathname && url.searchParams.has('check')) {
    return fetch(request, { cache: 'no-store' });
  }
  const path = './' + url.pathname.slice(scope.pathname.length);
  const shellPath = request.mode === 'navigate' ? './index.html' : path;
  if (urlsToCache.includes(shellPath)) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(new URL(shellPath, scope).href);
    // A missing script must not silently come from a different network release.
    return cached?.ok ? cached : new Response('App files are unavailable. Reopen online and use Update App.', { status: 503 });
  }

  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached?.ok) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && (request.destination === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname))) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(serveRequest(event.request));
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting' || event.data?.type === 'skipWaiting') {
    event.waitUntil(self.skipWaiting());
  }
  if (['getShellStatus', 'refreshAppShell'].includes(event.data?.type)) {
    event.waitUntil((async () => {
      try {
        let status = await getShellStatus();
        if (!status.ready && event.data.type === 'refreshAppShell') {
          await installShell();
          status = await getShellStatus();
        }
        event.ports?.[0]?.postMessage(status);
      } catch (error) {
        event.ports?.[0]?.postMessage({ ready: false, error: error.message });
      }
    })());
  }
});
