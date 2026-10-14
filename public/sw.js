const CACHE = 'chrono-public-shell-v1';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if (event.data === 'LOGOUT') event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))); });
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 const url = new URL(event.request.url);
 // No API, authenticated document, RSC response or user data is ever cached.
 if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));return;}
 if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html').then(hit => hit || new Response('Sin conexión',{status:503}))));
});

