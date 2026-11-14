// Run: node artifacts/yat-biha/tests/matching.cjs
// Exercises public ranking/search behaviour without loading the React Native runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../utils/matching.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, require);
const { normalizeArabic, rankMatches, searchReports, matchLabel } = loaded.exports;
const report = (overrides = {}) => ({
  id: 'source', type: 'lost', title: 'محفظة جلدية سوداء', category: 'wallet',
  description: 'علامة صغيرة على الجيب الخارجي', city: 'الرياض', place: 'حديقة الملك عبدالله البوابة الشرقية',
  date: '2026-11-10', status: 'open', createdAt: 1, updatedAt: 1, ...overrides,
});
let checks = 0;
function test(name, body) { body(); checks++; process.stdout.write(`✓ ${name}\n`); }

test('Arabic normalization handles diacritics, hamza, feminine ending, maqsura, tatweel and Arabic digits', () => {
  assert.equal(normalizeArabic('إِلَى مَحْفَظَة ـ ١٢'), 'الي محفظه 12');
  assert.equal(normalizeArabic('عبد الله'), normalizeArabic('عبدالله'));
});
test('Cross-language multi-term search matches object, colour and city together', () => {
  const list = [report(), report({ id: 'other', title: 'هاتف اسود', category: 'phone' })];
  assert.deepEqual(searchReports(list, 'black wallet riyadh').map((x) => x.report.id), ['source']);
  assert.deepEqual(searchReports(list, 'محفظه سوداء').map((x) => x.report.id), ['source']);
  assert.equal(searchReports(list, 'محفظة زرقاء').length, 0);
});
test('Search does not return hidden reports and empty search sorts newest first', () => {
  const hidden = report({ id: 'secret', hidden: true });
  const recent = report({ id: 'recent', date: '2026-11-11' });
  assert.deepEqual(searchReports([report(), hidden, recent], '').map((x) => x.report.id), ['recent', 'source']);
});
test('Matching excludes incompatible type, category, city, visibility, ownership source, returned and self', () => {
  const source = report();
  const base = report({ id: 'candidate', type: 'found' });
  const invalid = [source, { ...base, type: 'lost' }, { ...base, category: 'keys' }, { ...base, city: 'جدة' },
    { ...base, hidden: true }, { ...base, status: 'returned' }, { ...base, demo: true }, { ...base, local: true }];
  assert.equal(rankMatches(source, invalid).length, 0);
  assert.equal(rankMatches({ ...source, status: 'returned' }, [base]).length, 0);
  assert.equal(rankMatches({ ...source, hidden: true }, [base]).length, 0);
});
test('Specific supporting details rank above category/city-only suggestions', () => {
  const source = report();
  const specific = report({ id: 'specific', type: 'found', date: '2026-11-11' });
  const vague = report({ id: 'vague', type: 'found', title: 'محفظة', description: '', place: '', date: '' });
  const results = rankMatches(source, [vague, specific]);
  assert.equal(results[0].report.id, 'specific');
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[0].reasons.length >= 4);
  assert.equal(results[0].conflicts.length, 0);
});
test('Different stated colours cannot produce a strong suggestion even with matching place and dates', () => {
  const [match] = rankMatches(report(), [report({ id: 'brown', type: 'found', title: 'محفظة جلدية بنية' })]);
  assert.ok(match.score <= 35);
  assert.ok(match.conflicts.some((text) => text.includes('الألوان')));
});
test('Different brands are flagged and capped instead of presenting a misleading strong match', () => {
  const [match] = rankMatches(report({ title: 'ايفون اسود', category: 'phone' }), [report({ id: 'galaxy', type: 'found', title: 'سامسونج اسود', category: 'phone' })]);
  assert.ok(match.score <= 35);
  assert.ok(match.conflicts.some((text) => text.includes('التجاريتان')));
});
test('Found-before-loss dates are flagged in either argument order', () => {
  const lost = report({ date: '2026-11-12' });
  const found = report({ id: 'earlier', type: 'found', date: '2026-11-08' });
  for (const [a, b] of [[lost, found], [found, lost]]) {
    const [match] = rankMatches(a, [b]);
    assert.ok(match.score <= 35);
    assert.ok(match.conflicts.some((text) => text.includes('يسبق')));
  }
});
test('Invalid dates never create NaN scores or fabricated date agreement', () => {
  const [match] = rankMatches(report({ date: '2026-02-31' }), [report({ id: 'invalid', type: 'found', date: 'bad' })]);
  assert.ok(Number.isFinite(match.score));
  assert.ok(!match.reasons.some((text) => text.includes('التاريخان')));
});
test('Ranking is deterministic and leaves source data untouched', () => {
  const source = Object.freeze(report());
  const candidate = Object.freeze(report({ id: 'found', type: 'found' }));
  const list = Object.freeze([candidate]);
  assert.deepEqual(rankMatches(source, list), rankMatches(source, list));
});
test('Arabic conjunctions and multi-colour coats rank full agreement above partial agreement', () => {
  const source = report({ title: 'معطف أسود وأبيض', category: 'other', description: '' });
  const full = report({ id: 'full-colours', type: 'found', title: 'معطف أبيض والأسود', category: 'other', description: '' });
  const partial = report({ id: 'partial-colours', type: 'found', title: 'معطف أسود وأحمر', category: 'other', description: '' });
  const none = report({ id: 'other-colours', type: 'found', title: 'معطف أخضر وأحمر', category: 'other', description: '' });
  const ranked = rankMatches(source, [partial, none, full]);
  assert.deepEqual(ranked.map((r) => r.report.id), ['full-colours', 'partial-colours', 'other-colours']);
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(ranked[0].conflicts.length, 0);
  assert.ok(ranked[2].conflicts.length > 0 && ranked[2].score <= 35);
  assert.equal(searchReports([source], 'black white coat').length, 1);
});
test('Shared broad categories cannot hide different known object kinds', () => {
  const source = report({ title: 'معطف اسود', category: 'other' });
  const candidate = report({ id: 'glasses', type: 'found', title: 'نظارات سوداء', category: 'other' });
  const [match] = rankMatches(source, [candidate]);
  assert.ok(match.score <= 35);
  assert.ok(match.conflicts.some((text) => text.includes('نوع الغرض')));
  const [jewelry] = rankMatches(report({ category: 'jewelry', title: 'ساعة فضية' }), [report({ id: 'ring', category: 'jewelry', title: 'خاتم فضي', type: 'found' })]);
  assert.ok(jewelry.conflicts.some((text) => text.includes('نوع الغرض')));
});
test('Canonical concepts and very short prefixes do not match unrelated words', () => {
  const unrelated = report({ category: 'other', title: 'redwood cathedral coastline', description: '', city: '', place: '' });
  for (const query of ['red', 'cat', 'coat', 're', 'ca']) assert.equal(searchReports([unrelated], query).length, 0, query);
  assert.equal(searchReports([report()], 'wall').length, 1);
  assert.equal(searchReports([report()], 'wal').length, 0);
});
test('Far future or malformed dates do not add fabricated temporal agreement', () => {
  for (const invalid of ['9999-01-01', '2026-13-12', '2026-01-32', '2026-1-1', '2026-11-10T00:00:00Z']) {
    const [match] = rankMatches(report({ date: invalid }), [report({ id: 'bad-date', type: 'found', date: invalid })]);
    assert.ok(Number.isFinite(match.score));
    assert.ok(!match.reasons.some((text) => text.includes('التاريخان') || text.includes('أسبوعين')), invalid);
  }
});
test('Demo data stays separate and conflicting examples remain explicitly weak', () => {
  const source = report({ demo: true, title: 'محفظة سوداء' });
  const brownDemo = report({ id: 'demo-brown', demo: true, type: 'found', title: 'محفظة بنية' });
  const real = report({ id: 'real-black', type: 'found' });
  const ranked = rankMatches(source, [brownDemo, real]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].report.id, 'demo-brown');
  assert.ok(ranked[0].score <= 35);
});
test('Empty metadata never produces invented category/city evidence or a strong match', () => {
  const empty = report({ category: '', city: '', title: '', description: '', place: '', date: '' });
  assert.deepEqual(rankMatches(empty, [{ ...empty, id: 'empty', type: 'found' }]), []);
  const vague = report({ title: '', description: '', place: '', date: '' });
  const [match] = rankMatches(vague, [{ ...vague, id: 'vague', type: 'found' }]);
  assert.deepEqual(match.reasons, ['نفس الفئة والمدينة']);
  assert.equal(matchLabel(match.score, match.conflicts), 'قرائن محدودة');
});
process.stdout.write(`${checks} matching/search checks passed.\n`);
