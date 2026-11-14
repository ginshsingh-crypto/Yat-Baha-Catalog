import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');
const ASSET_EXTENSIONS = new Set(['.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);

/** Used only by the explicit preview exporter, never by a production Expo build. */
export function addOfflinePreview(output, basePath, iconPath) {
  if (basePath && !/^\/[a-zA-Z0-9._-]+$/.test(basePath)) throw new Error('Invalid preview base path');
  const scope = `${basePath}/`;
  const prefix = `yat-biha-preview:${digest(scope).slice(0, 12)}:`;
  copyFileSync(iconPath, resolve(output, 'preview-icon.png'));
  // Preserve original image bytes and aspect ratio inside a square SVG viewport.
  // The image is never raster-edited, stretched, mirrored, or cropped.
  writeFileSync(resolve(output, 'preview-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#F7F8FA"/><image x="16" y="16" width="480" height="480" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${readFileSync(iconPath).toString('base64')}"/></svg>`);
  const manifest = {
    id: scope,
    name: 'يأت بها — معاينة', short_name: 'يأت بها',
    description: 'معاينة محلية لتطبيق المفقودات والمعثورات. بياناتك تبقى في هذا المتصفح.',
    lang: 'ar', dir: 'rtl', start_url: scope, scope,
    display: 'standalone', background_color: '#F7F8FA', theme_color: '#141B2D',
    icons: [{ src: `${scope}preview-icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    categories: ['utilities'],
  };
  writeFileSync(resolve(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(output, 'preview-register.js'), registrationScript(scope));
  let html = readFileSync(resolve(output, 'index.html'), 'utf8').replace(/<!-- yat-preview-pwa:start -->[\s\S]*?<!-- yat-preview-pwa:end -->/g, '');
  const tags = `<!-- yat-preview-pwa:start -->
<meta name="yat-preview-version" content="__YAT_PREVIEW_VERSION__">
<meta name="theme-color" content="#141B2D">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="يأت بها">
<link rel="manifest" href="${scope}manifest.webmanifest">
<link rel="apple-touch-icon" href="${scope}preview-icon.png">
<script src="${scope}preview-register.js" defer></script>
<!-- yat-preview-pwa:end -->`;
  html = html.replace('</head>', `${tags}</head>`);
  const files = readdirSync(output, { recursive: true }).map((file) => file.replaceAll('\\', '/')).filter((file) => {
    if (!statSync(resolve(output, file)).isFile()) return false;
    if (file === 'preview-sw.js' || file === 'index.html' || file === '404.html') return false;
    if (file === 'manifest.webmanifest') return true;
    // Only generated static app resources are in scope; never arbitrary export data.
    return ASSET_EXTENSIONS.has(extname(file)) && (file.startsWith('_expo/') || file.startsWith('assets/') || ['favicon.ico', 'preview-icon.png', 'preview-icon.svg', 'preview-register.js'].includes(file));
  }).sort();
  const hash = createHash('sha256').update(scope).update(html).update(workerScript.toString());
  for (const file of files) hash.update(file).update(readFileSync(resolve(output, file)));
  const version = hash.digest('hex').slice(0, 20);
  html = html.replaceAll('__YAT_PREVIEW_VERSION__', version);
  writeFileSync(resolve(output, 'index.html'), html);
  copyFileSync(resolve(output, 'index.html'), resolve(output, '404.html'));
  const assets = ['index.html', ...files].map((file) => ({ url: `${scope}${encodedPath(file)}`, hash: digest(readFileSync(resolve(output, file))) }));
  writeFileSync(resolve(output, 'preview-sw.js'), workerScript({ scope, prefix, version, assets }));
  return { scope, prefix, version, assets };
}

function registrationScript(scope) {
  return `/* Generated for the device-local preview only. */
(() => {
  const publish = (state) => {
    document.documentElement.dataset.previewOffline = state;
    window.dispatchEvent(new CustomEvent('yat-preview-offline', { detail: { state } }));
  };
  const warn = (error) => console.warn('Preview offline setup unavailable', String(error?.message || error?.name || error || 'Registration failed').replace(/https?:[^ ]+/g, '[preview URL]').slice(0, 240));
  const register = async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) { warn('Service workers require a supported secure browsing context'); publish('unavailable'); return; }
    try {
      const registration = await navigator.serviceWorker.register(${JSON.stringify(`${scope}preview-sw.js`)}, { scope: ${JSON.stringify(scope)}, updateViaCache: 'none' });
      if (registration.waiting) publish('update');
      else navigator.serviceWorker.ready.then(() => { if (!registration.waiting) publish('ready'); });
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') publish(registration.active ? 'update' : 'ready');
          if (installing.state === 'redundant' && !registration.active) { warn('Static preview cache installation failed; no offline generation activated'); publish('unavailable'); }
        });
      });
    } catch (error) { warn(error); publish('unavailable'); }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => { void register(); }, { once: true });
})();
`;
}

function workerScript({ scope, prefix, version, assets }) {
  return `/* Preview-only, build-complete offline cache. No account/API/user data. */
'use strict';
const SCOPE = ${JSON.stringify(scope)};
const PREFIX = ${JSON.stringify(prefix)};
const VERSION = ${JSON.stringify(version)};
const CACHE = PREFIX + VERSION;
const ASSETS = ${JSON.stringify(assets)};
const INDEX = SCOPE + 'index.html';
const BY_PATH = new Map(ASSETS.map((asset) => [decodeURIComponent(asset.url), asset]));
const VERSION_MARKER = 'name="yat-preview-version" content="' + VERSION + '"';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Read and verify every build resource before activation. A 404, HTML
      // fallback, stale deployment file, or quota failure aborts this install.
      // Integrity checks also prevent caching a successful HTML fallback as JS.
      for (let start = 0; start < ASSETS.length; start += 6) {
        await Promise.all(ASSETS.slice(start, start + 6).map(async (asset) => {
          const response = await fetch(new Request(asset.url, { cache: 'reload', credentials: 'omit' }));
          if (!response.ok || response.redirected || response.type === 'opaque') throw new Error('Missing preview resource');
          const bytes = await response.clone().arrayBuffer();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
          if (hash !== asset.hash) throw new Error('Preview resource does not match this build');
          await cache.put(asset.url, response);
        }));
      }
      // No skipWaiting: existing tabs continue using their complete old build.
    } catch (error) {
      console.warn('Preview offline installation unavailable', String(error?.message || 'Static cache installation failed').slice(0, 240));
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Activation happens after old controlled tabs close. Do not clear another
    // site's cache, another base path, local reports, saved searches, or drafts.
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    // No clients.claim: never replace the worker underneath an already-open app.
  })());
});

async function navigation(request) {
  const cache = await caches.open(CACHE);
  const shell = await cache.match(INDEX);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      const html = await response.clone().text();
      // A new deployment is installed separately. Do not serve a new shell
      // while this worker still owns only the previous generation's chunks.
      if (html.includes(VERSION_MARKER)) return response;
    }
  } catch { /* Offline or slow connection: use the complete installed shell. */ }
  finally { clearTimeout(timer); }
  return shell || new Response('تعذّر فتح النسخة المحفوظة. أغلق نوافذ المعاينة وافتحها مجدداً وأنت متصل بالإنترنت.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (request.headers.has('authorization') || request.headers.has('range')) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api' || url.pathname.startsWith(SCOPE + 'api/') || url.pathname === SCOPE + 'api') return;
  if (request.mode === 'navigate') { event.respondWith(navigation(request)); return; }
  if (url.search) return;
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return; }
  const asset = BY_PATH.get(path);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Runtime fetches are never written to cache; only install-time, verified,
    // exported bytes are eligible. An evicted entry can still load online.
    return (await cache.match(asset.url)) || fetch(request);
  })());
});
`;
}
