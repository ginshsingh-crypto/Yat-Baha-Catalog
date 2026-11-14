// Run from any directory: node /path/to/artifacts/yat-biha/tests/capture-draft.cjs
// Exercises the real hook with deterministic storage; never touches user data or services.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const ts = require('typescript');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const data = new Map([['yat-biha.local.capture.v1.new', 'PRODUCTION_SENTINEL']]);
let fail = false;
let failReads = false;
const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const storage = {
  async getItem(key) { await pause(); if (failReads) throw Error('read failed'); return data.get(key) ?? null; },
  async setItem(key, value) { await pause(); if (fail) throw Error('quota'); data.set(key, value); },
  async removeItem(key) { await pause(); data.delete(key); },
};
function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)((name) => { if (name in imports) return imports[name]; throw Error(name); }, m, m.exports);
  return m.exports;
}
const utils = load('utils/reportCapture.ts', {});
const { useCaptureDraft } = load('hooks/useCaptureDraft.ts', { react: React, '@react-native-async-storage/async-storage': storage, '@/config/runtime': { IS_PREVIEW: true }, '@/utils/reportCapture': utils });
const base = { type: 'lost', title: '', category: '', description: '', city: '', place: '', date: '2026-11-14' };
const key = 'yat-biha.preview.capture.v1.new';
let current = base;
let state;
let renderer;
function Probe() { state = useCaptureDraft('new', current, 0); return null; }
async function mount() { await act(async () => { renderer = create(React.createElement(Probe)); }); await act(async () => { await pause(20); }); }
async function change(value) { current = value; await act(async () => { renderer.update(React.createElement(Probe)); }); }
async function unmount() { await act(async () => { renderer.unmount(); }); await pause(30); }
(async () => {
  await mount();
  assert.equal(state.ready, true);
  assert.equal(state.resolved, true);
  assert.equal(data.has(key), false, 'untouched form has no empty draft');
  await change({ ...base, title: 'محفظة بنية', description: 'وصف الغرض' });
  await act(async () => { await pause(500); });
  assert.equal(state.status, 'saved');
  assert.equal(JSON.parse(data.get(key)).value.title, 'محفظة بنية');
  await unmount();
  current = base;
  await mount();
  assert.equal(state.resolved, false);
  assert.equal(state.existing.value.title, 'محفظة بنية');
  await act(async () => { await pause(500); });
  assert.equal(JSON.parse(data.get(key)).value.title, 'محفظة بنية', 'blank initial state cannot overwrite existing draft');
  await act(async () => { await state.discard(); });
  assert.equal(data.has(key), false);
  await change({ ...base, photoUri: 'data:image/jpeg;base64,YWJj' });
  await unmount();
  assert.equal(JSON.parse(data.get(key)).value.photoUri, 'data:image/jpeg;base64,YWJj', 'fast unmount flushes photo-only edits');
  current = base;
  await mount();
  await act(async () => { await state.discard(); });
  fail = true;
  await change({ ...base, title: 'failed write' });
  await act(async () => { await pause(500); });
  assert.equal(state.status, 'error');
  fail = false;
  await change({ ...base, title: 'recovered write' });
  await act(async () => { await pause(500); });
  assert.equal(state.status, 'saved');
  await act(async () => { await state.finish(); });
  await unmount();
  assert.equal(data.has(key), false, 'successful report cannot resurrect its draft on unmount');

  const preservedDraft = JSON.stringify({ version: 1, value: { ...base, title: 'مسودة سابقة مهمة' }, step: 0, savedAt: 1 });
  data.set(key, preservedDraft);
  failReads = true;
  current = base;
  await mount();
  assert.equal(state.ready, true, 'read error must not leave an infinite loading screen');
  assert.equal(state.hydrationError, 'read');
  assert.equal(state.resolved, false);
  await change({ ...base, title: 'new edits while read is failing' });
  await act(async () => { await pause(500); });
  assert.equal(data.get(key), preservedDraft, 'autosave cannot overwrite a draft it could not read');
  failReads = false;
  await act(async () => { await state.retryHydration(); });
  assert.equal(state.hydrationError, null);
  assert.equal(state.hydrating, false);
  assert.equal(state.existing.value.title, 'مسودة سابقة مهمة', 'retry surfaces the untouched original draft for an explicit restoration choice');
  await unmount();
  assert.equal(data.get(key), preservedDraft, 'unmount cannot overwrite an unresolved existing draft');

  failReads = true;
  current = base;
  await mount();
  await change({ ...base, title: 'a separately submitted new report' });
  await act(async () => { await state.finish(); });
  await unmount();
  assert.equal(data.get(key), preservedDraft, 'successful submit cannot delete an unread older draft');
  failReads = false;

  const corrupt = '{broken draft';
  data.set(key, corrupt);
  current = base;
  await mount();
  assert.equal(state.hydrationError, 'corrupt');
  assert.equal(state.resolved, false);
  await change({ ...base, title: 'new data alongside malformed draft' });
  await act(async () => { await pause(500); });
  assert.equal(data.get(key), corrupt, 'malformed drafts are protected from implicit replacement');
  await unmount();
  assert.equal(data.get(key), corrupt, 'unmount preserves malformed drafts');
  current = base;
  await mount();
  await act(async () => { await state.discard(); });
  assert.equal(state.hydrationError, null);
  assert.equal(state.resolved, true);
  await change({ ...base, title: 'explicit replacement' });
  await act(async () => { await pause(500); });
  assert.equal(JSON.parse(data.get(key)).value.title, 'explicit replacement', 'explicit deletion unblocks autosave for the new draft');
  await act(async () => { await state.finish(); });
  await unmount();
  assert.equal(data.get('yat-biha.local.capture.v1.new'), 'PRODUCTION_SENTINEL', 'preview storage remains isolated');
  console.log('PASS draft lifecycle: restore choice, no blank overwrite, immediate unmount flush, photo-only draft, quota recovery, unread/corrupt draft protection, retry and explicit replacement, submit cleanup, preview isolation.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
