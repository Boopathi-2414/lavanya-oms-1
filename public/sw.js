// Lavanya OMS Service Worker v1
// Manual PWA — VitePWA removed to fix pdf.js cache errors
// Caches only app shell (HTML/CSS/JS) — NOT pdf.js worker (causes issues)

const CACHE_NAME = 'lavanya-oms-v1';

// Files to cache for offline use — app shell only
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// Domains to NEVER cache (pdf.js CDN, Supabase API, Claude API)
const SKIP_CACHE_DOMAINS = [
  'cdnjs.cloudflare.com',
  'supabase.co',
  'anthropic.com',
  'shadowfax.in',
  'delhivery.com',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
// Strategy: Network first → cache fallback (for app shell)
// External APIs / CDN / pdf.js → always network, never cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external domains — let them go straight to network
  if (SKIP_CACHE_DOMAINS.some((d) => url.hostname.includes(d))) return;

  // Skip pdf.js worker specifically (caused VitePWA cache errors before)
  if (url.pathname.includes('pdf.worker')) return;

  // For navigation requests (HTML pages) — network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For JS/CSS/image assets — network first, cache as backup
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});sw.js
