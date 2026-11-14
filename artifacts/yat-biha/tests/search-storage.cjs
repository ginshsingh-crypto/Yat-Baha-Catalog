// Run: node artifacts/yat-biha/tests/search-storage.cjs
// Runs the actual Search screen with a small hook host to exercise async focus/save races.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/(tabs)/search.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function host() {
  const states = [];
  let index = 0;
  let focus;
  const reads = [];
  const writes = [];
  const storage = {
    getItem: () => { const d = deferred(); reads.push(d); return d.promise; },
    setItem: (_key, value) => { const d = deferred(); writes.push({ ...d, value }); return d.promise; },
  };
  const react = {
    useState: (initial) => { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useRef: (initial) => { const i = index++; if (!(i in states)) states[i] = { current: initial }; return states[i]; },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: () => {},
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Keyboard: { dismiss() {} }, Pressable: 'Pressable', TextInput: 'TextInput', View: 'View' },
    '@react-native-async-storage/async-storage': storage,
    '@expo/vector-icons': { Feather: 'Feather' },
    '@expo/vector-icons/Feather': 'Feather',
    'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: (fn) => { focus = fn; } },
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/context/ReportsContext': { CATEGORIES: [{ key: 'wallet', label: 'محفظة' }], CITIES: ['الرياض'], categoryOf: () => ({ label: 'محفظة' }), useReports: () => ({ all: [], loading: false }) },
    '@/components/Screen': { TabScreen: 'TabScreen' },
    '@/components/ui': Object.fromEntries(['Button', 'Chip', 'Empty', 'ErrorBox', 'ReportCard', 'SkeletonList', 'T'].map((key) => [key, key]).concat([['ROW', 'row-reverse'], ['F', {}]])),
    '@/config/runtime': { IS_PREVIEW: true },
    '@/utils/matching': { normalizeArabic: (text) => text.toLowerCase(), searchReports: () => [] },
  };
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, (id) => { if (!(id in mocks)) throw new Error(`Unexpected import ${id}`); return mocks[id]; });
  const render = () => { index = 0; return module.exports.default(); };
  render();
  return { render, focus: () => focus(), reads, writes };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, key, value) => nodes(tree).find((node) => node.props?.[key] === value);
const textPresent = (tree, value) => nodes(tree).some((node) => node.props?.children === value);
const saved = { id: 'saved', q: 'wallet', category: null, city: null, type: 'all', returned: false };

(async () => {
  const h = host();
  const initialBlur = h.focus(); await tick(); h.reads[0].resolve(JSON.stringify([saved])); await tick();
  assert.ok(textPresent(h.render(), 'عمليات بحثك المحفوظة'));
  initialBlur();
  const clearedBlur = h.focus(); await tick(); h.reads[1].resolve(null); await tick();
  assert.ok(!textPresent(h.render(), 'عمليات بحثك المحفوظة'), 'Refocusing after clearAll must remove stale saved searches');
  clearedBlur();

  const obsoleteBlur = h.focus(); await tick();
  obsoleteBlur();
  const freshBlur = h.focus(); await tick();
  h.reads[3].resolve(null); await tick();
  h.reads[2].resolve(JSON.stringify([saved])); await tick();
  assert.ok(!textPresent(h.render(), 'عمليات بحثك المحفوظة'), 'A cancelled older focus read must not restore deleted data');

  find(h.render(), 'testID', 'search-input').props.onChangeText('wallet');
  find(h.render(), 'accessibilityLabel', 'حفظ البحث على هذا الجهاز').props.onPress();
  assert.equal(h.writes.length, 1);
  freshBlur();
  h.focus(); await tick();
  assert.equal(h.reads.length, 4, 'A new focus must wait for an in-flight save');
  h.writes[0].resolve(); await tick();
  assert.equal(h.reads.length, 5);
  h.reads[4].resolve(h.writes[0].value); await tick();
  find(h.render(), 'accessibilityLabel', 'إعادة ضبط البحث والفلاتر').props.onPress();
  assert.ok(textPresent(h.render(), 'عمليات بحثك المحفوظة'), 'The completed save must survive focus rehydration');
  process.stdout.write('3 saved-search focus, cancellation and pending-write checks passed.\n');
})().catch((error) => { console.error(error); process.exitCode = 1; });
