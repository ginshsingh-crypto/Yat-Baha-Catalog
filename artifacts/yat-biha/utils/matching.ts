import type { Report } from '../context/ReportsContext';

/** Deterministic, explainable relevance. This score is not a probability or proof of ownership. */
export interface RankedMatch {
  report: Report;
  score: number;
  reasons: string[];
  conflicts: string[];
}

export function normalizeArabic(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (n) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
    .replace(/عبد\s+الله/g, 'عبدالله')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const groups: Record<string, string[]> = {
  wallet: ['wallet', 'wallets', 'purse', 'محفظه', 'محافظ'],
  phone: ['phone', 'mobile', 'smartphone', 'هاتف', 'جوال', 'موبايل', 'تليفون', 'تلفون'],
  keys: ['key', 'keys', 'مفتاح', 'مفاتيح'],
  bag: ['bag', 'backpack', 'luggage', 'حقيبه', 'شنطه', 'حقائب'],
  docs: ['document', 'documents', 'passport', 'مستند', 'مستندات', 'وثيقه', 'وثائق', 'جواز'],
  jewelry: ['jewelry', 'jewellery', 'مجوهرات'],
  watch: ['watch', 'watches', 'ساعه', 'ساعات'],
  bracelet: ['bracelet', 'bangle', 'اسوره', 'سوار'],
  ring: ['ring', 'rings', 'خاتم', 'خواتم'],
  necklace: ['necklace', 'قلاده', 'عقد'],
  headphones: ['headphone', 'headphones', 'earphone', 'earphones', 'earbud', 'earbuds', 'سماعات', 'سماعه'],
  cat: ['cat', 'kitten', 'قطه', 'قط', 'قطط'],
  dog: ['dog', 'puppy', 'كلب', 'كلاب'],
  coat: ['coat', 'jacket', 'معطف', 'جاكيت', 'ستره'],
  glasses: ['glasses', 'sunglasses', 'نظاره', 'نظارات'],
  laptop: ['laptop', 'notebook', 'لابتوب', 'لابتاب'],
  tablet: ['tablet', 'ipad', 'تابلت', 'ايباد'],
  camera: ['camera', 'كاميرا'],
  black: ['black', 'اسود', 'سوداء', 'سود'],
  white: ['white', 'ابيض', 'بيضاء', 'بيض'],
  brown: ['brown', 'بني', 'بنيه'],
  gray: ['gray', 'grey', 'رمادي', 'رماديه'],
  blue: ['blue', 'ازرق', 'زرقاء', 'ازرقه'],
  green: ['green', 'اخضر', 'خضراء'],
  red: ['red', 'احمر', 'حمراء'],
  yellow: ['yellow', 'اصفر', 'صفراء'],
  orange: ['orange', 'برتقالي', 'برتقاليه'],
  pink: ['pink', 'وردي', 'ورديه'],
  purple: ['purple', 'بنفسجي', 'بنفسجيه'],
  silver: ['silver', 'فضي', 'فضيه'],
  gold: ['gold', 'golden', 'ذهبي', 'ذهبيه'],
  apple: ['apple', 'iphone', 'ايفون', 'ايفن', 'ابل'],
  samsung: ['samsung', 'galaxy', 'سامسونج', 'سامسونغ', 'جالكسي', 'غالاكسي'],
  huawei: ['huawei', 'هواوي'],
  honor: ['honor', 'هونر'],
  xiaomi: ['xiaomi', 'redmi', 'شاومي', 'شياومي', 'ريدمي'],
  sony: ['sony', 'سوني'],
  riyadh: ['riyadh', 'رياض', 'الرياض'],
  jeddah: ['jeddah', 'jedda', 'جده'],
  makkah: ['makkah', 'mecca', 'مكه'],
  madinah: ['madinah', 'medina', 'مدينه'],
  dammam: ['dammam', 'دمام'],
  khobar: ['khobar', 'خبر'],
  taif: ['taif', 'طائف'],
  abha: ['abha', 'ابها'],
  tabuk: ['tabuk', 'تبوك'],
  buraydah: ['buraydah', 'بريده'],
};
const aliases = new Map<string, string>();
Object.entries(groups).forEach(([canonical, variants]) => variants.forEach((word) => aliases.set(normalizeArabic(word), canonical)));
const stopwords = new Set(['في', 'من', 'علي', 'الي', 'عن', 'مع', 'و', 'او', 'ثم', 'قد', 'تم', 'هو', 'هي', 'هذا', 'هذه', 'شيء', 'غرض', 'مفقود', 'معثور', 'عليه', 'فقدت', 'وجدت', 'the', 'a', 'an', 'in', 'at', 'on', 'of', 'with', 'lost', 'found']);
const colorKeys = new Set(['black', 'white', 'brown', 'gray', 'blue', 'green', 'red', 'yellow', 'orange', 'pink', 'purple', 'silver', 'gold']);
const brandKeys = new Set(['apple', 'samsung', 'huawei', 'honor', 'xiaomi', 'sony']);
const specificObjectKeys = new Set(['watch', 'bracelet', 'ring', 'necklace', 'headphones', 'cat', 'dog', 'coat', 'glasses', 'laptop', 'tablet', 'camera']);
const canonicalConcepts = new Set(Object.keys(groups));

function canonicalToken(token: string): string {
  if (aliases.has(token)) return aliases.get(token)!;
  // Arabic joins conjunctions and articles: أبيض، والأبيض، وأبيض refer to the same colour.
  const withoutConjunction = token.startsWith('و') && token.length > 3 &&
    (aliases.has(token.slice(1)) || token.startsWith('وال')) ? token.slice(1) : token;
  const withoutArticle = withoutConjunction.startsWith('ال') && withoutConjunction.length > 3 ? withoutConjunction.slice(2) : withoutConjunction;
  return aliases.get(withoutArticle) ?? withoutArticle;
}

export function searchTokens(value: string): string[] {
  return [...new Set(normalizeArabic(value).split(' ').filter(Boolean).map(canonicalToken).filter((word) => !stopwords.has(word)))];
}

const intersects = (a: string[], b: string[]) => a.some((word) => b.includes(word));
const descriptors = (r: Report, keys: Set<string>) => {
  // Prefer the item's title over unrelated accessory colours mentioned in a description.
  const title = searchTokens(r.title).filter((token) => keys.has(token));
  return title.length ? title : searchTokens(r.description).filter((token) => keys.has(token));
};

function dateNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  const tomorrow = Date.parse(new Date().toISOString().slice(0, 10)) + 86400000;
  return Number.isFinite(timestamp) && timestamp <= tomorrow && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function matchLabel(score: number, conflicts: string[] = []): string {
  if (conflicts.length) return 'تحتاج مراجعة';
  if (score >= 72) return 'قرائن أقوى';
  if (score >= 50) return 'يستحق المقارنة';
  return 'قرائن محدودة';
}

export function rankMatches(source: Report, candidates: Report[]): RankedMatch[] {
  if (source.status !== 'open' || source.hidden || !source.category.trim() || !normalizeArabic(source.city)) return [];
  const sourceColors = descriptors(source, colorKeys);
  const sourceBrands = descriptors(source, brandKeys);
  const sourceObjects = descriptors(source, specificObjectKeys);
  const sourceWords = searchTokens(`${source.title} ${source.description}`);
  const sourcePlace = searchTokens(source.place).filter((word) => !searchTokens(source.city).includes(word));
  const sourceDate = dateNumber(source.date);
  return candidates.filter((r) => (
    r.id !== source.id && !r.hidden && r.status === 'open' && r.type !== source.type &&
    r.category === source.category && normalizeArabic(r.city) === normalizeArabic(source.city) &&
    !!r.demo === !!source.demo && !!r.local === !!source.local
  )).map((report) => {
    let score = 30;
    const reasons = ['نفس الفئة والمدينة'];
    const conflicts: string[] = [];
    const colors = descriptors(report, colorKeys);
    const brands = descriptors(report, brandKeys);
    const objects = descriptors(report, specificObjectKeys);
    if (sourceObjects.length && objects.length && !intersects(sourceObjects, objects)) {
      score -= 24;
      conflicts.push('نوع الغرض المذكور مختلف داخل الفئة');
    }
    if (sourceColors.length && colors.length) {
      if (intersects(sourceColors, colors)) {
        const overlap = sourceColors.filter((color) => colors.includes(color)).length;
        const agreement = overlap / Math.max(sourceColors.length, colors.length);
        score += Math.round(16 * agreement);
        reasons.push(agreement === 1 ? 'الألوان المذكورة متشابهة' : 'لون مشترك؛ بقية الألوان تحتاج مقارنة');
      }
      else { score -= 24; conflicts.push('الألوان المذكورة مختلفة'); }
    }
    if (sourceBrands.length && brands.length) {
      if (intersects(sourceBrands, brands)) { score += 18; reasons.push('العلامة التجارية متشابهة'); }
      else { score -= 30; conflicts.push('العلامتان التجاريتان مختلفتان'); }
    }
    const place = searchTokens(report.place).filter((word) => !searchTokens(report.city).includes(word));
    const sharedPlace = sourcePlace.filter((word) => place.includes(word));
    if (sharedPlace.length) {
      const fraction = sharedPlace.length / Math.max(sourcePlace.length, place.length);
      score += Math.round(fraction * 15);
      reasons.push(fraction >= 0.5 ? 'المكان المذكور متقارب' : 'كلمات مشتركة في المكان');
    }
    const candidateDate = dateNumber(report.date);
    if (sourceDate !== null && candidateDate !== null) {
      const days = Math.abs(sourceDate - candidateDate) / 86400000;
      const lostAt = source.type === 'lost' ? sourceDate : candidateDate;
      const foundAt = source.type === 'found' ? sourceDate : candidateDate;
      if (foundAt < lostAt - 86400000) { score -= 18; conflicts.push('تاريخ العثور يسبق الفقدان بأكثر من يوم'); }
      else if (days <= 3) { score += 12; reasons.push('التاريخان متقاربان'); }
      else if (days <= 14) { score += 6; reasons.push('الفارق الزمني خلال أسبوعين'); }
      else if (days > 90) { score -= 10; conflicts.push('الفارق الزمني أكثر من ثلاثة أشهر'); }
    }
    const words = searchTokens(`${report.title} ${report.description}`);
    const sharedWords = sourceWords.filter((word) => words.includes(word) && !colorKeys.has(word) && !brandKeys.has(word) && word !== source.category);
    if (sharedWords.length) {
      score += Math.min(9, sharedWords.length * 3);
      reasons.push('تفاصيل مشتركة في الوصف');
    }
    score = Math.max(0, Math.min(conflicts.length ? 35 : 100, score));
    return { report, score, reasons, conflicts };
  }).sort((a, b) => b.score - a.score || b.report.createdAt - a.report.createdAt || a.report.id.localeCompare(b.report.id));
}

export interface SearchResult { report: Report; score: number; matchedTerms: string[] }

/** Every meaningful query term must match; Arabic spelling variants and object synonyms are folded. */
export function searchReports(reports: Report[], query: string): SearchResult[] {
  const terms = searchTokens(query);
  return reports.filter((report) => !report.hidden).map((report) => {
    const titleTokens = searchTokens(report.title);
    const tokens = searchTokens(`${report.title} ${report.description} ${report.place} ${report.city} ${report.category}`);
    const matchedTerms = terms.filter((term) => tokens.some((token) => token === term ||
      (!canonicalConcepts.has(term) && term.length >= (/\p{Script=Arabic}/u.test(term) ? 3 : 4) && token.startsWith(term))));
    const score = matchedTerms.reduce((sum, term) => sum + (titleTokens.includes(term) ? 3 : 1), 0);
    return { report, score, matchedTerms };
  }).filter((result) => result.matchedTerms.length === terms.length)
    .sort((a, b) => b.score - a.score || b.report.date.localeCompare(a.report.date) || b.report.createdAt - a.report.createdAt);
}
