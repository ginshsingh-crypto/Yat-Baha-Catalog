/**
 * Behavior tests for the real ReportsContext provider. Native storage, auth and
 * transport are adapters; state transitions run through React and the source TSX.
 * Run: node --test tests/reports-context.cjs (from artifacts/yat-biha).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { create, act } = require('react-test-renderer');
const ts = require('typescript');

global.IS_REACT_ACT_ENVIRONMENT = true;
const source = fs.readFileSync(path.resolve(__dirname, '../context/ReportsContext.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const input = { type: 'lost', title: 'محفظة اختبار', category: 'wallet', description: 'محفظة بنية ذات علامة خاصة', city: 'الرياض', place: 'بوابة الحديقة', date: '2026-11-14', photoUri: 'data:image/jpeg;base64,YWJj' };
const storedReport = (id, extra = {}) => ({ ...input, id, status: 'open', createdAt: 1, updatedAt: 1, ...extra });

function harness({ preview = true, initial = [], shared = [] } = {}) {
  const prefix = preview ? 'yatbiha.preview.' : 'yatbiha.';
  const data = new Map(initial);
  const fault = { get: null, set: null, remove: null };
  const calls = { auth: 0, list: 0, mutation: 0, writes: [] };
  const auth = { userId: null, isLoaded: true, isSignedIn: false };
  let renderer, state;
  const rejects = (rule, key) => rule === true || (typeof rule === 'function' && rule(key));
  const storage = {
    async getItem(key) { await Promise.resolve(); if (rejects(fault.get, key)) throw new Error('Read failure'); return data.get(key) ?? null; },
    async setItem(key, value) { await Promise.resolve(); if (rejects(fault.set, key)) throw new Error('Quota'); calls.writes.push(['set', key]); data.set(key, value); },
    async removeItem(key) { await Promise.resolve(); if (rejects(fault.remove, key)) throw new Error('Removal failure'); calls.writes.push(['remove', key]); data.delete(key); },
    async multiGet(keys) { return Promise.all(keys.map(async (key) => [key, await this.getItem(key)])); },
    async multiSet(entries) { for (const [key, value] of entries) await this.setItem(key, value); },
    async multiRemove(keys) { for (const key of keys) await this.removeItem(key); },
    async getAllKeys() { return [...data.keys()]; },
  };
  const deny = () => { throw new Error('Preview invoked authentication or network behavior'); };
  const api = {
    useListReports() { calls.list++; return { data: shared, isLoading: false, error: null, refetch: async () => {} }; },
    async createReport(value) { calls.mutation++; return storedReport('shared-created', { ...value, isOwner: true }); },
    async updateReport() { calls.mutation++; },
    async deleteReport() { calls.mutation++; },
    requestPhotoUpload: deny,
  };
  const mod = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: 'ReportsContext.test-runtime.js' })((name) => {
    if (name === 'react') return React;
    if (name === '@/config/runtime') return { IS_PREVIEW: preview };
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === '@clerk/expo') return { useAuth: preview ? deny : () => { calls.auth++; return auth; } };
    if (name === '@tanstack/react-query') return { useQueryClient: preview ? deny : () => ({ invalidateQueries: async () => {} }) };
    if (name === '@workspace/api-client-react') return preview ? new Proxy({}, { get: () => deny }) : api;
    throw new Error(`Unexpected import ${name}`);
  }, mod, mod.exports);
  function Probe() { state = mod.exports.useReports(); return null; }
  const tree = () => React.createElement(mod.exports.ReportsProvider, null, React.createElement(Probe));
  return {
    prefix, data, fault, calls, auth, exports: mod.exports,
    get state() { return state; },
    async mount() { await act(async () => { renderer = create(tree()); }); assert.equal(state.loading, false, 'hydration should settle'); },
    async unmount() { if (renderer) { await act(async () => renderer.unmount()); renderer = undefined; } },
    async rerender() { await act(async () => renderer.update(tree())); },
    async run(operation) { let result; await act(async () => { result = await operation(state); }); return result; },
  };
}

async function withHarness(options, check) {
  const h = harness(options);
  try { await h.mount(); await check(h); } finally { await h.unmount(); }
}

async function assertProtected(h, expected = new Map(h.data)) {
  await h.run(async state => {
    await assert.rejects(() => state.createReport(input), /تعذّر التأكد/);
    await assert.rejects(() => state.updateReport('healthy', { title: 'must not overwrite' }), /تعذّر التأكد/);
    await assert.rejects(() => state.deleteReport('healthy'), /تعذّر التأكد/);
    await assert.rejects(() => state.toggleSaved('healthy'), /تعذّر التأكد/);
  });
  assert.deepEqual(h.data, expected, 'failed hydration must never overwrite stored user data');
}

test('preview: concurrent writes, persistence, photo retention, edits and isolated clear', async () => {
  await withHarness({ initial: [['yatbiha.reports.v1', 'production sentinel'], ['yatbiha.saved.v1', '["real-bookmark"]']] }, async h => {
    const { findMatches, DEMO_REPORTS } = h.exports;
    assert.equal(h.state.showDemo, true);
    assert.equal(h.state.all.length, 8);
    assert.equal(findMatches(DEMO_REPORTS[0], DEMO_REPORTS)[0].id, 'demo-8');
    const created = await h.run(state => Promise.all([state.createReport(input), state.createReport({ ...input, type: 'found' })]));
    assert.equal(h.state.mine.length, 2);
    assert.equal(JSON.parse(h.data.get(h.prefix + 'index.v2')).length, 2);
    assert.ok(h.state.mine.every(r => r.local && r.isOwner));
    assert.deepEqual(findMatches(created[0], h.state.all).map(r => r.id), [created[1].id], 'sample reports must not match real reports');
    await h.run(state => Promise.all(created.map(r => state.toggleSaved(r.id))));
    assert.equal(h.state.saved.length, 2);
    await h.unmount(); await h.mount();
    assert.equal(h.state.mine.length, 2); assert.equal(h.state.saved.length, 2);
    assert.equal(h.state.getReport(created[0].id).photoUri, input.photoUri);
    await h.run(state => state.updateReport(created[1].id, { status: 'returned', title: 'Updated wallet' }));
    assert.equal(h.state.getReport(created[1].id).title, 'Updated wallet');
    assert.equal(findMatches(h.state.getReport(created[0].id), h.state.all).length, 0);
    await h.run(state => state.deleteReport(created[0].id));
    assert.equal(h.state.mine.length, 1); assert.equal(h.state.saved.length, 1);
    assert.equal(h.data.has(h.prefix + 'report.v2.' + created[0].id), false);
    await h.run(state => state.setShowDemo(false));
    assert.equal(h.state.getReport('demo-1'), undefined);
    for (const key of ['yat-biha.preview.capture-draft.v1', 'yat-biha.preview.handover.demo-1', h.prefix + 'saved-searches.v1']) h.data.set(key, 'private feature data');
    h.data.set('yat-biha.local.capture-draft.v1', 'production draft');
    h.data.set('unrelated.app', 'preserve');
    await h.run(state => state.clearAll());
    assert.equal(h.state.mine.length, 0); assert.equal(h.state.saved.length, 0);
    assert.equal([...h.data.keys()].some(key => key.startsWith('yat-biha.preview.')), false, 'clear purges feature drafts and handovers');
    assert.equal(h.data.has(h.prefix + 'saved-searches.v1'), false);
    assert.equal(h.data.get('yatbiha.reports.v1'), 'production sentinel');
    assert.equal(h.data.get('yatbiha.saved.v1'), '["real-bookmark"]');
    assert.equal(h.data.get('yat-biha.local.capture-draft.v1'), 'production draft');
    assert.equal(h.data.get('unrelated.app'), 'preserve');
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.list, 0); assert.equal(h.calls.mutation, 0);
  });
});

test('write failures preserve visible state, clean orphan records and do not poison queue', async () => {
  await withHarness({}, async h => {
    const report = await h.run(state => state.createReport(input));
    h.fault.set = true;
    await h.run(async state => { await assert.rejects(() => state.createReport(input), /لم يتم الحفظ/); await assert.rejects(() => state.updateReport(report.id, { title: 'Not saved' })); await assert.rejects(() => state.toggleSaved(report.id)); });
    assert.equal(h.state.mine.length, 1); assert.equal(h.state.getReport(report.id).title, input.title); assert.equal(h.state.saved.length, 0);
    h.fault.set = key => key === h.prefix + 'index.v2';
    await h.run(state => assert.rejects(() => state.createReport(input), /فهرس البلاغات/));
    assert.equal([...h.data.keys()].filter(key => key.startsWith(h.prefix + 'report.v2.')).length, 1, 'index failure cleans new orphan');
    h.fault.set = null;
    await h.run(state => state.createReport(input));
    assert.equal(h.state.mine.length, 2);
  });
});

test('read failure blocks mutations until a successful reload', async () => {
  const healthy = storedReport('healthy');
  const h = harness({ initial: [['yatbiha.preview.index.v2', '["healthy"]'], ['yatbiha.preview.report.v2.healthy', JSON.stringify(healthy)]] });
  h.fault.get = key => key === h.prefix + 'index.v2';
  try {
    await h.mount(); assert.ok(h.state.loadError); await assertProtected(h);
    h.fault.get = null;
    await h.run(state => state.retryLoad());
    assert.equal(h.state.loadError, null); assert.equal(h.state.mine.length, 1);
    await h.run(state => state.createReport(input)); assert.equal(h.state.mine.length, 2);
  } finally { await h.unmount(); }
});

for (const [name, value] of [
  ['invalid JSON', '{broken'], ['non-object', 'null'], ['missing required fields', '{"id":"broken"}'],
  ['mismatched record id', JSON.stringify(storedReport('different'))],
  ['non-finite timestamp', JSON.stringify(storedReport('broken', { createdAt: null }))],
]) {
  test(`malformed stored report (${name}) keeps healthy data visible and blocks destructive writes`, async () => {
    await withHarness({ initial: [['yatbiha.preview.index.v2', '["healthy","broken"]'], ['yatbiha.preview.report.v2.healthy', JSON.stringify(storedReport('healthy'))], ['yatbiha.preview.report.v2.broken', value]] }, async h => {
      assert.ok(h.state.loadError); assert.equal(h.state.mine.length, 1); assert.equal(h.state.mine[0].id, 'healthy');
      await assertProtected(h);
    });
  });
}

test('missing indexed record blocks mutation and explicit clear recovers a writable empty store', async () => {
  await withHarness({ initial: [['yatbiha.preview.index.v2', '["missing"]']] }, async h => {
    assert.ok(h.state.loadError); await assertProtected(h);
    await h.run(state => state.clearAll()); assert.equal(h.state.loadError, null);
    await h.run(state => state.createReport(input)); assert.equal(h.state.mine.length, 1);
  });
});

for (const [key, value] of [['index.v2', '{"not":"an array"}'], ['index.v2', '["healthy",null]'], ['saved.v1', '["healthy",4]'], ['reports.v1', '[{"id":"incomplete"}]']]) {
  test(`invalid ${key} preserves original storage`, async () => {
    await withHarness({ initial: [['yatbiha.preview.' + key, value]] }, async h => { assert.ok(h.state.loadError); await assertProtected(h); });
  });
}

test('legacy records migrate after successful writes and survive failed migration', async () => {
  const initial = [['yatbiha.preview.reports.v1', JSON.stringify([storedReport('legacy')])]];
  await withHarness({ initial }, async h => {
    assert.equal(h.state.mine.length, 1); assert.equal(h.state.mine[0].id, 'legacy');
    assert.equal(h.data.has(h.prefix + 'reports.v1'), false);
    assert.ok(h.data.has(h.prefix + 'report.v2.legacy'));
  });
  const h = harness({ initial }); h.fault.set = true;
  try { await h.mount(); assert.ok(h.state.loadError); assert.equal(h.data.get(h.prefix + 'reports.v1'), initial[0][1]); await assertProtected(h); }
  finally { await h.unmount(); }
});

test('production keeps shared data/auth guards while local clearing preserves preview data', async () => {
  const shared = storedReport('shared-1', { isOwner: false, local: false, type: 'found' });
  await withHarness({ preview: false, shared: [shared], initial: [['yatbiha.reports.v1', JSON.stringify([storedReport('legacy-1')])], ['yatbiha.preview.report.v2.private', 'preview data'], ['yat-biha.preview.capture-draft.v1', 'preview draft'], ['yat-biha.local.capture-draft.v1', 'production draft']] }, async h => {
    assert.ok(h.calls.auth > 0 && h.calls.list > 0); assert.equal(h.state.showDemo, false);
    assert.equal(h.exports.DEMO_REPORTS[7].status, 'returned');
    assert.equal(h.state.mine.length, 1); assert.equal(h.state.all.length, 2);
    assert.equal(h.state.getReport('legacy-1').local, true);
    await h.run(async state => { await assert.rejects(() => state.createReport(input), /سجّل الدخول/); await assert.rejects(() => state.publishLocal('legacy-1'), /سجّل الدخول/); await assert.rejects(() => state.updateReport('shared-1', { title: 'Not mine' }), /لا يمكنك/); });
    assert.equal(h.calls.mutation, 0);
    await h.run(state => state.updateReport('legacy-1', { title: 'Edited locally' }));
    assert.equal(h.state.getReport('legacy-1').title, 'Edited locally');
    await h.run(state => state.clearAll());
    assert.equal(h.state.mine.length, 0); assert.equal(h.state.all.length, 1);
    assert.equal(h.data.get('yatbiha.preview.report.v2.private'), 'preview data');
    assert.equal(h.data.get('yat-biha.preview.capture-draft.v1'), 'preview draft');
    assert.equal(h.data.has('yat-biha.local.capture-draft.v1'), false);
  });
});

test('report deletion commits its index before removing private return notes', async () => {
  await withHarness({}, async h => {
    const report = await h.run(state => state.createReport(input));
    const privateKey = 'yat-biha.preview.recovery.v1.' + encodeURIComponent(report.id);
    h.data.set(privateKey, 'private note sentinel');
    h.fault.set = key => key === h.prefix + 'index.v2';
    await h.run(state => assert.rejects(() => state.deleteReport(report.id)));
    assert.equal(h.state.mine.length, 1);
    assert.equal(h.data.get(privateKey), 'private note sentinel');
    h.fault.set = null;
    await h.run(state => state.deleteReport(report.id));
    assert.equal(h.state.mine.length, 0);
    assert.equal(h.data.has(privateKey), false);
  });
});

test('failed private-note cleanup is explicit and can be completed by local clearing', async () => {
  await withHarness({}, async h => {
    const report = await h.run(state => state.createReport(input));
    const privateKey = 'yat-biha.preview.recovery.v1.' + encodeURIComponent(report.id);
    h.data.set(privateKey, 'private note sentinel');
    h.fault.remove = key => key === privateKey;
    await h.run(state => assert.rejects(() => state.deleteReport(report.id), /ملاحظات الإعادة/));
    assert.equal(h.state.mine.length, 0);
    assert.equal(h.data.get(privateKey), 'private note sentinel');
    h.fault.remove = null;
    await h.run(state => state.clearAll());
    assert.equal(h.data.has(privateKey), false);
  });
});
