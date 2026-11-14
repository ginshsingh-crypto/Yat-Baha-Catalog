import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { addOfflinePreview } from './preview-offline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icon = resolve(root, 'artifacts/yat-biha/assets/images/icon.png');
function fixture() {
  const output = mkdtempSync(resolve(tmpdir(), 'yat-offline-test-'));
  mkdirSync(resolve(output, '_expo/static/js/web'), { recursive: true });
  mkdirSync(resolve(output, 'assets/vendor'), { recursive: true });
  writeFileSync(resolve(output, 'index.html'), '<!doctype html><html lang="ar"><head><title>يأت بها</title></head><body><div id="root"></div></body></html>');
  writeFileSync(resolve(output, '_expo/static/js/web/[id]-hashed.js'), 'console.log("route");');
  writeFileSync(resolve(output, 'assets/vendor/font-hashed.ttf'), 'font-fixture');
  writeFileSync(resolve(output, 'metadata.json'), '{"test":"not a runtime asset"}');
  writeFileSync(resolve(output, 'secret.json'), '{"test":"never cache arbitrary export data"}');
  return output;
}

function environment(output, config) {
  const origin = 'https://preview.example';
  const cacheObjects = new Map();
  const deleted = [];
  const listeners = new Map();
  const requests = [];
  let network = 'normal';
  const caches = {
    async open(name) {
      if (!cacheObjects.has(name)) {
        const entries = new Map();
        cacheObjects.set(name, {
          entries,
          async put(url, response) { entries.set(url, response.clone()); },
          async match(url) { return entries.get(url)?.clone(); },
        });
      }
      return cacheObjects.get(name);
    },
    async keys() { return [...cacheObjects.keys()]; },
    async delete(name) { deleted.push(name); return cacheObjects.delete(name); },
  };
  class RelativeRequest extends Request {
    constructor(input, options) { super(typeof input === 'string' ? new URL(input, origin) : input, options); }
  }
  const fetch = async (request) => {
    const url = new URL(typeof request === 'string' ? request : request.url, origin);
    requests.push(url.href);
    if (network === 'offline') throw new Error('Offline');
    let rel = decodeURIComponent(url.pathname.slice(config.scope.length));
    if (request.mode === 'navigate') {
      if (network === '404') return new Response('not found', { status: 404 });
      const html = readFileSync(resolve(output, 'index.html'), 'utf8');
      return new Response(network === 'new-build' ? html.replace(config.version, 'new-version') : html, { headers: { 'content-type': 'text/html', 'x-from-network': '1' } });
    }
    if (network === 'missing' && rel.endsWith('.ttf')) return new Response('not found', { status: 404 });
    const bytes = readFileSync(resolve(output, rel));
    return new Response(network === 'corrupt' && rel.endsWith('.js') ? 'fallback HTML' : bytes, { headers: { 'content-type': rel.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
  };
  const context = vm.createContext({
    self: { location: { origin }, addEventListener: (type, handler) => listeners.set(type, handler) },
    caches, fetch, Request: RelativeRequest, Response, URL, Map, Uint8Array, crypto: webcrypto, AbortController, setTimeout, clearTimeout,
  });
  vm.runInContext(readFileSync(resolve(output, 'preview-sw.js'), 'utf8'), context);
  return {
    caches, deleted, requests, setNetwork(value) { network = value; },
    async lifecycle(type) { let pending; listeners.get(type)({ waitUntil(promise) { pending = promise; } }); await pending; },
    async fetch(path, options = {}) {
      let pending;
      const request = { url: new URL(path, origin).href, method: options.method ?? 'GET', mode: options.mode ?? 'cors', headers: new Headers(options.headers) };
      listeners.get('fetch')({ request, respondWith(promise) { pending = promise; } });
      return pending ? await pending : undefined;
    },
  };
}

test('root and repository-subpath exports include correctly scoped, original-brand PWA files', () => {
  for (const basePath of ['', '/Yat-Baha-Catalog']) {
    const output = fixture();
    try {
      const config = addOfflinePreview(output, basePath, icon);
      const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.webmanifest'), 'utf8'));
      new vm.Script(readFileSync(resolve(output, 'preview-register.js'), 'utf8'));
      assert.equal(manifest.scope, basePath + '/');
      assert.equal(manifest.start_url, manifest.scope);
      assert.equal(manifest.lang, 'ar');
      assert.equal(manifest.dir, 'rtl');
      assert.equal(readFileSync(resolve(output, 'preview-icon.png')).compare(readFileSync(icon)), 0);
      const html = readFileSync(resolve(output, 'index.html'), 'utf8');
      assert(html.includes(`href="${basePath}/manifest.webmanifest"`));
      assert(html.includes(`src="${basePath}/preview-register.js" defer`));
      assert(html.includes('lang="ar"'));
      assert(html.includes(config.version));
      assert.equal(readFileSync(resolve(output, '404.html'), 'utf8'), html);
      assert(config.assets.some(({ url }) => url.endsWith('%5Bid%5D-hashed.js')));
      assert(config.assets.every(({ url }) => url.startsWith(manifest.scope) && !url.includes('..') && !url.includes('secret.json') && !url.includes('metadata.json')));
      assert.equal(addOfflinePreview(output, basePath, icon).version, config.version, 'identical exports keep the same generation');
      const before = config.version;
      writeFileSync(resolve(output, '_expo/static/js/web/[id]-hashed.js'), 'console.log("new route");');
      const after = addOfflinePreview(output, basePath, icon);
      assert.notEqual(after.version, before);
      assert.equal((readFileSync(resolve(output, 'index.html'), 'utf8').match(/rel="manifest"/g) ?? []).length, 1);
    } finally { rmSync(output, { recursive: true, force: true }); }
  }
});

test('worker installs complete verified resources, serves offline deep routes, and excludes all nonstatic traffic', async () => {
  const output = fixture();
  try {
    const config = addOfflinePreview(output, '/Yat-Baha-Catalog', icon);
    const env = environment(output, config);
    await env.caches.open('another-app-cache');
    await env.caches.open(config.prefix + 'old-build');
    await env.lifecycle('install');
    const own = await env.caches.open(config.prefix + config.version);
    assert.equal(own.entries.size, config.assets.length);
    assert.equal(env.requests.length, config.assets.length);
    await env.lifecycle('activate');
    assert.deepEqual(env.deleted, [config.prefix + 'old-build']);
    assert((await env.caches.keys()).includes('another-app-cache'));
    const online = await env.fetch('/Yat-Baha-Catalog/report/one', { mode: 'navigate' });
    assert.equal(online.headers.get('x-from-network'), '1');
    env.setNetwork('offline');
    const offline = await env.fetch('/Yat-Baha-Catalog/report/local-id', { mode: 'navigate' });
    assert.equal(offline.status, 200);
    assert((await offline.text()).includes(config.version));
    for (const path of ['/Yat-Baha-Catalog/_expo/static/js/web/[id]-hashed.js', '/Yat-Baha-Catalog/_expo/static/js/web/%5Bid%5D-hashed.js']) {
      assert.equal(await (await env.fetch(path)).text(), 'console.log("route");');
    }
    for (const path of ['/api/photos/secret', '/Yat-Baha-Catalog/api/reports', '/Yat-Baha-Catalog/api', '/another-site/', 'https://third-party.example/photo', '/Yat-Baha-Catalog/unknown.png', '/Yat-Baha-Catalog/secret.json']) assert.equal(await env.fetch(path), undefined);
    assert.equal(await env.fetch('/Yat-Baha-Catalog/api/reports', { mode: 'navigate' }), undefined);
    assert.equal(await env.fetch('/Yat-Baha-Catalog/', { method: 'POST', mode: 'navigate' }), undefined);
    assert.equal(await env.fetch('/Yat-Baha-Catalog/preview-icon.png', { headers: { authorization: 'Bearer private' } }), undefined);
    assert.equal(await env.fetch('/Yat-Baha-Catalog/preview-icon.png?token=private'), undefined);
    assert.equal(own.entries.size, config.assets.length, 'no runtime or user requests are cached');
    env.setNetwork('new-build');
    const held = await env.fetch('/Yat-Baha-Catalog/', { mode: 'navigate' });
    assert((await held.text()).includes(config.version), 'new shell cannot replace old build chunks');
    env.setNetwork('404');
    assert.equal((await env.fetch('/Yat-Baha-Catalog/report/one', { mode: 'navigate' })).status, 200);
    own.entries.delete(config.scope + 'index.html');
    env.setNetwork('new-build');
    assert.equal((await env.fetch('/Yat-Baha-Catalog/', { mode: 'navigate' })).status, 503, 'evicted old shell must not mix a new shell with old chunks');
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('a missing or mismatched resource aborts installation and preserves the previous cache', async () => {
  for (const failure of ['missing', 'corrupt']) {
    const output = fixture();
    try {
      const config = addOfflinePreview(output, '', icon);
      const env = environment(output, config);
      await env.caches.open(config.prefix + 'previous');
      env.setNetwork(failure);
      await assert.rejects(() => env.lifecycle('install'));
      assert(!(await env.caches.keys()).includes(config.prefix + config.version));
      assert((await env.caches.keys()).includes(config.prefix + 'previous'));
    } finally { rmSync(output, { recursive: true, force: true }); }
  }
});

test('actual Expo export has valid scoped HTML references and exact precache hashes', { skip: !process.env.PREVIEW_EXPORT_DIR }, async () => {
  const output = resolve(root, process.env.PREVIEW_EXPORT_DIR);
  const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.webmanifest'), 'utf8'));
  const html = readFileSync(resolve(output, 'index.html'), 'utf8');
  const worker = readFileSync(resolve(output, 'preview-sw.js'), 'utf8');
  const assets = JSON.parse(worker.match(/^const ASSETS = (.*);$/m)[1]);
  const version = JSON.parse(worker.match(/^const VERSION = (.*);$/m)[1]);
  assert.equal(manifest.scope, manifest.start_url);
  assert(manifest.scope.startsWith('/') && manifest.scope.endsWith('/'));
  assert(html.includes(`name="yat-preview-version" content="${version}"`));
  assert.equal(readFileSync(resolve(output, '404.html'), 'utf8'), html);
  assert(assets.length > 10, 'real app must include its split routes and fonts');
  let bytes = 0;
  for (const asset of assets) {
    assert(asset.url.startsWith(manifest.scope));
    assert(!asset.url.includes('__node_modules/.pnpm'));
    const relative = decodeURIComponent(asset.url.slice(manifest.scope.length));
    assert(!relative.includes('..'));
    const content = readFileSync(resolve(output, relative));
    const hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', content))].map((b) => b.toString(16).padStart(2, '0')).join('');
    assert.equal(hash, asset.hash, relative);
    bytes += content.length;
  }
  for (const [, path] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!path.startsWith('/')) continue;
    assert(path.startsWith(manifest.scope), `wrong base path: ${path}`);
    const relative = decodeURIComponent(path.slice(manifest.scope.length));
    assert(readFileSync(resolve(output, relative)).length > 0, `missing HTML resource: ${relative}`);
  }
  assert(readFileSync(resolve(output, 'preview-icon.png')).equals(readFileSync(icon)));
  console.log(`Actual export: ${assets.length} static resources, ${(bytes / 1024 / 1024).toFixed(2)} MiB precache, scope ${manifest.scope}, version ${version}.`);
});
