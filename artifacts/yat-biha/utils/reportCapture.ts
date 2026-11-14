import type { ReportInput } from '../context/ReportsContext';

export type CaptureErrors = Partial<Record<'title' | 'category' | 'description' | 'city' | 'place' | 'date', string>>;

export function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function latinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function publicContentWarning(value: string): string | null {
  const normalized = latinDigits(value);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized)) return 'احذف البريد الإلكتروني من النص العام؛ تُشارك وسائل التواصل بشكل خاص.';
  if ((normalized.match(/\d[\d\s()+.\-]{7,}\d/g) ?? []).some((match) => match.replace(/\D/g, '').length >= 9)) return 'احذف أرقام الهواتف أو الهويات أو الأرقام التسلسلية من النص العام.';
  return null;
}

export function validateCapture(value: ReportInput, today = localDate()): CaptureErrors {
  const errors: CaptureErrors = {};
  if (value.title.trim().length < 3) errors.title = 'اكتب اسماً واضحاً من ٣ أحرف على الأقل.';
  if (!['wallet', 'phone', 'keys', 'bag', 'docs', 'jewelry', 'electronics', 'pet', 'other'].includes(value.category)) errors.category = 'اختر فئة الغرض.';
  if (value.description.trim().length < 10) errors.description = 'أضف وصفاً قصيراً من ١٠ أحرف على الأقل.';
  if (value.city.trim().length < 2) errors.city = 'اختر المدينة أو اكتب اسمها.';
  if (value.place.trim().length < 3) errors.place = 'اذكر مكاناً عاماً تقريبياً من ٣ أحرف على الأقل.';
  if (!isCalendarDate(value.date)) errors.date = 'اكتب تاريخاً صحيحاً بصيغة سنة-شهر-يوم، مثل 2026-11-14.';
  else if (value.date > today) errors.date = 'اختر اليوم أو تاريخاً سابقاً.';
  for (const field of ['title', 'description', 'city', 'place'] as const) {
    const warning = publicContentWarning(value[field]);
    if (warning) errors[field] = warning;
  }
  return errors;
}

const RULES: Array<[string, RegExp]> = [
  ['wallet', /محفظ|\b(wallet|purse)\b/i],
  ['electronics', /سماع|لابتوب|حاسوب|كاميرا|شاحن|\b(airpods|headphones?|earbuds?|laptop|camera|charger)\b/i],
  ['jewelry', /ساعه|ساعة|خاتم|اسواره|اسورة|قلاده|قلادة|\b(watch|ring|jewelry|jewellery)\b/i],
  ['phone', /هاتف|جوال|موبايل|[اآأ]يفون|ايفون|\b(iphone|galaxy|smartphone|phone)\b/i],
  ['keys', /مفتاح|مفاتيح|\b(keys?|keyring|keychain)\b/i],
  ['bag', /حقيبه|حقيبة|شنطه|شنطة|\b(backpack|bag|suitcase)\b/i],
  ['docs', /وثيق|جواز|رخصه|رخصة|بطاقه|بطاقة|هويه|هوية|\b(passport|document)\b/i],
  ['pet', /قطه|قطة|قطتي|كلب|عصفور|ببغاء|\b(cat|dog|pet|bird)\b/i],
];

/** Local keyword assistance, not image recognition or a machine-learning prediction. */
export function categorySuggestion(text: string): string | undefined {
  const normalized = text.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  return RULES.find(([, pattern]) => pattern.test(normalized))?.[0];
}

export const CAPTURE_COLORS = [
  { label: 'أسود', value: '#1C2533' }, { label: 'أبيض', value: '#FFFFFF' },
  { label: 'بني', value: '#906545' }, { label: 'أزرق', value: '#3476B8' },
  { label: 'رمادي', value: '#98A1AD' }, { label: 'أخضر', value: '#559777' },
  { label: 'أحمر', value: '#CF5163' }, { label: 'ذهبي', value: '#C79D50' },
];

export function withColor(description: string, color: string): string {
  const suffix = `اللون: ${color}.`;
  // Replace only our exact standalone descriptor. A user's prose on the same
  // line, custom color wording, whitespace and every other character survive.
  const generatedLine = new RegExp(`^اللون: (?:${CAPTURE_COLORS.map((item) => item.label).join('|')})\\.(?=\\r?$)`, 'm');
  const next = generatedLine.test(description)
    ? description.replace(generatedLine, suffix)
    : `${description}${description && !description.endsWith('\n') ? '\n' : ''}${suffix}`;
  if (next.length > 400) throw new Error('لا توجد مساحة لإضافة اللون ضمن ٤٠٠ حرف. اختصر الوصف أولاً؛ لم نغيّر نصك.');
  return next;
}

/** Photo assistance may fill gaps, but must never replace user-authored text. */
export function fillCaptureSuggestion(current: ReportInput, suggestion: Pick<ReportInput, 'title' | 'category' | 'description'>): ReportInput {
  return {
    ...current,
    title: current.title.trim() ? current.title : suggestion.title,
    category: current.category.trim() ? current.category : suggestion.category,
    description: current.description.trim() ? current.description : suggestion.description,
  };
}

export interface CaptureDraft {
  version: 1;
  value: ReportInput;
  step: number;
  savedAt: number;
}

export function readCaptureDraft(raw: string | null): CaptureDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CaptureDraft;
    const value = parsed?.value;
    if (parsed.version !== 1 || !value || !['lost', 'found'].includes(value.type) ||
      !['title', 'category', 'description', 'city', 'place', 'date'].every((key) => typeof value[key as keyof ReportInput] === 'string') ||
      (value.photoUri !== undefined && typeof value.photoUri !== 'string') ||
      !Number.isFinite(parsed.savedAt)) return null;
    return { ...parsed, step: Math.min(2, Math.max(0, Math.trunc(Number(parsed.step) || 0))) };
  } catch {
    return null;
  }
}
