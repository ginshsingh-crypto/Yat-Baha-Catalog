import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorySuggestion, fillCaptureSuggestion, isCalendarDate, latinDigits, publicContentWarning,
  readCaptureDraft, validateCapture, withColor,
} from '../utils/reportCapture.ts';

const report = {
  type: 'lost', title: 'محفظة جلدية سوداء', category: 'wallet',
  description: 'محفظة صغيرة بغطاء جلدي أسود.', city: 'الرياض',
  place: 'حديقة الملك عبدالله', date: '2026-11-14',
};

test('calendar validation rejects normalized impossible dates and future dates', () => {
  assert.equal(isCalendarDate('2026-02-30'), false);
  assert.equal(isCalendarDate('2025-02-29'), false);
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-13-01'), false);
  assert.ok(validateCapture({ ...report, date: '2026-11-15' }, '2026-11-14').date);
  assert.deepEqual(validateCapture(report, '2026-11-14'), {});
});

test('Arabic and Persian digits remain usable for date entry', () => {
  assert.equal(latinDigits('٢٠٢٦-١١-١٤'), '2026-11-14');
  assert.equal(latinDigits('۲۰۲۶-۱۱-۱۴'), '2026-11-14');
});

test('public privacy validation catches contact details in every public text field', () => {
  for (const field of ['title', 'description', 'city', 'place']) {
    assert.ok(validateCapture({ ...report, [field]: 'اتصل ٠٥٥ ١٢٣ ٤٥٦٧' }, '2026-11-14')[field]);
    assert.ok(validateCapture({ ...report, [field]: 'owner@example.com' }, '2026-11-14')[field]);
  }
  assert.equal(publicContentWarning('فُقدت بتاريخ 2026-11-14 عند البوابة 3'), null);
  assert.equal(publicContentWarning('الحجم 12 سم واللون أسود'), null);
});

test('local category suggestions handle Arabic diacritics and avoid English substring errors', () => {
  assert.equal(categorySuggestion('مِفْتَاح سيارة'), 'keys');
  assert.equal(categorySuggestion('محفظة جلدية'), 'wallet');
  assert.equal(categorySuggestion('wireless headphones'), 'electronics');
  assert.equal(categorySuggestion('Samsung Galaxy Watch'), 'jewelry');
  assert.equal(categorySuggestion('iPhone 16'), 'phone');
  assert.equal(categorySuggestion('spring decoration'), undefined);
});

test('color choices replace only the standalone generated descriptor and preserve all prose', () => {
  assert.equal(withColor(withColor('محفظة صغيرة.', 'أسود'), 'بني'), 'محفظة صغيرة.\nاللون: بني.');
  const prose = 'مقدمة\nاللون: أسود. وفي الغطاء خدش صغير\nخاتمة  ';
  assert.equal(withColor(prose, 'بني'), `${prose}\nاللون: بني.`);
  assert.equal(withColor('اللون: فضي مائل للأزرق', 'أسود'), 'اللون: فضي مائل للأزرق\nاللون: أسود.');
  assert.equal(withColor('  وصف المستخدم\r\nاللون: أسود.\r\nسطر لاحق  ', 'بني'), '  وصف المستخدم\r\nاللون: بني.\r\nسطر لاحق  ');
  assert.equal(withColor('وصف محفوظ\n', 'أسود'), 'وصف محفوظ\nاللون: أسود.');
});

test('color insertion refuses overflow instead of silently trimming user-authored text', () => {
  const full = 'و'.repeat(400);
  assert.throws(() => withColor(full, 'أبيض'), /٤٠٠/);
  assert.equal(full.length, 400);
  const suffix = '\nاللون: أسود.';
  const boundary = 'و'.repeat(400 - suffix.length) + suffix;
  assert.equal(withColor(boundary, 'أسود'), boundary);
  assert.throws(() => withColor(boundary, 'رمادي'), /لم نغيّر نصك/);
});

test('photo suggestions only fill empty fields and never replace authored text', () => {
  const suggestion = { title: 'عنوان مقترح', category: 'phone', description: 'وصف مستخرج من الصورة' };
  assert.deepEqual(fillCaptureSuggestion(report, suggestion), report);
  const authored = { ...report, title: '  عنوان المستخدم  ', category: '', description: 'وصف طويل كتبه المستخدم مع تفاصيل مهمة.' };
  assert.deepEqual(fillCaptureSuggestion(authored, suggestion), { ...authored, category: 'phone' });
  const blank = { ...report, title: '', category: '  ', description: ' ' };
  assert.deepEqual(fillCaptureSuggestion(blank, suggestion), { ...blank, ...suggestion });
});

test('draft reader rejects corruption and preserves valid user fields', () => {
  assert.equal(readCaptureDraft('not-json'), null);
  assert.equal(readCaptureDraft('{"version":1}'), null);
  assert.equal(readCaptureDraft(JSON.stringify({ version: 1, value: { ...report, photoUri: 123 }, step: 0, savedAt: 1 })), null);
  const draft = readCaptureDraft(JSON.stringify({ version: 1, value: report, step: 8, savedAt: 123 }));
  assert.equal(draft.step, 2);
  assert.deepEqual(draft.value, report);
});
