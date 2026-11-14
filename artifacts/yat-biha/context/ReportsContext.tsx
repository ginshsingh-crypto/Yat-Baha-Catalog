import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useListReports, createReport as createShared, updateReport as updateShared, deleteReport as deleteShared, requestPhotoUpload } from '@workspace/api-client-react';

export type ReportType = 'lost' | 'found';
export type ReportStatus = 'open' | 'returned';

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  category: string;
  description: string;
  city: string;
  place: string;
  date: string; // YYYY-MM-DD
  photoUri?: string;
  status: ReportStatus;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
  local?: boolean;
  isOwner?: boolean;
  hidden?: boolean;
  photoId?: string | null;
}

export type ReportInput = Omit<Report, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'demo'>;

export const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'wallet', label: 'محفظة', icon: 'credit-card' },
  { key: 'phone', label: 'هاتف', icon: 'smartphone' },
  { key: 'keys', label: 'مفاتيح', icon: 'key' },
  { key: 'bag', label: 'حقيبة', icon: 'briefcase' },
  { key: 'docs', label: 'مستندات', icon: 'file-text' },
  { key: 'jewelry', label: 'مجوهرات وساعات', icon: 'watch' },
  { key: 'electronics', label: 'إلكترونيات', icon: 'headphones' },
  { key: 'pet', label: 'حيوان أليف', icon: 'heart' },
  { key: 'other', label: 'أخرى', icon: 'package' },
];

export const CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الطائف', 'أبها', 'تبوك', 'بريدة'];

export const categoryOf = (key: string) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];

const d = (daysAgo: number) => {
  const t = new Date(Date.now() - daysAgo * 86400000);
  return t.toISOString().slice(0, 10);
};

export const DEMO_REPORTS: Report[] = [
  { id: 'demo-1', type: 'found', title: 'محفظة جلدية بنية', category: 'wallet', description: 'وُجدت على مقعد قرب النافورة. بداخلها بطاقات؛ التفاصيل الدقيقة تُترك ليصفها صاحبها.', city: 'الرياض', place: 'حديقة الملك عبدالله - البوابة الشرقية', date: d(1), status: 'open', createdAt: 1, updatedAt: 1, demo: true },
  { id: 'demo-2', type: 'lost', title: 'سماعات لاسلكية بيضاء في علبتها', category: 'electronics', description: 'فُقدت أثناء انتظار القطار. العلبة عليها خدش صغير في الجانب.', city: 'الرياض', place: 'محطة قطار الرياض - الخط الأزرق', date: d(2), status: 'open', createdAt: 2, updatedAt: 2, demo: true },
  { id: 'demo-3', type: 'found', title: 'مفاتيح سيارة مع ميدالية زرقاء', category: 'keys', description: 'مجموعة مفاتيح في موقف السيارات، سُلّمت لمكتب الأمن في المجمع.', city: 'جدة', place: 'موقف مجمع تجاري على طريق الكورنيش', date: d(0), status: 'open', createdAt: 3, updatedAt: 3, demo: true },
  { id: 'demo-4', type: 'lost', title: 'حقيبة ظهر رمادية لطالب', category: 'bag', description: 'بداخلها كتب ودفاتر مدرسية. ربما نُسيت في المصلى بعد صلاة العصر.', city: 'الدمام', place: 'كورنيش الدمام - قرب المصلى', date: d(3), status: 'open', createdAt: 4, updatedAt: 4, demo: true },
  { id: 'demo-5', type: 'found', title: 'ساعة يد فضية', category: 'jewelry', description: 'وُجدت عند مغاسل الوضوء. سُلّمت لإدارة المسجد.', city: 'المدينة المنورة', place: 'ساحات المسجد - الجهة الجنوبية', date: d(1), status: 'open', createdAt: 5, updatedAt: 5, demo: true },
  { id: 'demo-6', type: 'lost', title: 'قطة شيرازية رمادية', category: 'pet', description: 'هادئة وتستجيب للنداء، ترتدي طوقاً أحمر بلا بيانات.', city: 'جدة', place: 'حي الروضة - قرب الحديقة العامة', date: d(4), status: 'open', createdAt: 6, updatedAt: 6, demo: true },
  { id: 'demo-7', type: 'found', title: 'هاتف بغطاء أخضر', category: 'phone', description: 'الهاتف مقفل، وُجد على طاولة في ساحة الطعام وسُلّم لخدمة العملاء.', city: 'الرياض', place: 'ساحة الطعام - مجمع تجاري شمال الرياض', date: d(2), status: 'open', createdAt: 7, updatedAt: 7, demo: true },
  { id: 'demo-8', type: 'lost', title: 'محفظة صغيرة سوداء', category: 'wallet', description: 'فُقدت في الطريق بين المواقف والمدخل الرئيسي.', city: 'الرياض', place: 'حديقة الملك عبدالله', date: d(1), status: IS_PREVIEW ? 'open' : 'returned', createdAt: 8, updatedAt: 8, demo: true },
];

/** Possible match: opposite type, same category, same city, still open. Never a verification. */
export function findMatches(target: Report, all: Report[]): Report[] {
  return all
    .filter((r) => !!r.demo === !!target.demo && !!r.local === !!target.local && !r.hidden && r.id !== target.id && r.type !== target.type && r.category === target.category && r.city === target.city && r.status === 'open')
    .sort((a, b) => Math.abs(+new Date(a.date) - +new Date(target.date)) - Math.abs(+new Date(b.date) - +new Date(target.date)));
}

const STORAGE_PREFIX = IS_PREVIEW ? 'yatbiha.preview.' : 'yatbiha.';
const K_LEGACY = STORAGE_PREFIX + 'reports.v1'; // v1: all reports in one entry (migrated on load)
const K_INDEX = STORAGE_PREFIX + 'index.v2'; // v2: ordered array of report ids
const K_REC = STORAGE_PREFIX + 'report.v2.'; // v2: one entry per report
const K_SAVED = STORAGE_PREFIX + 'saved.v1';
const K_DEMO = STORAGE_PREFIX + 'showDemo.v1';
const recKey = (id: string) => K_REC + id;

const WRITE_ERR = 'لم يتم الحفظ: تعذّرت الكتابة إلى ذاكرة الجهاز. قد تكون المساحة ممتلئة؛ جرّب إزالة الصورة أو حذف بلاغات قديمة.';

async function writeIndex(ids: string[]) {
  try {
    await AsyncStorage.setItem(K_INDEX, JSON.stringify(ids));
  } catch {
    throw new Error('لم يتم الحفظ: تعذّر تحديث فهرس البلاغات على الجهاز.');
  }
}

function isStoredReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return ['id', 'title', 'category', 'description', 'city', 'place', 'date'].every(k => typeof r[k] === 'string')
    && !!r.id && (r.type === 'lost' || r.type === 'found') && (r.status === 'open' || r.status === 'returned')
    && typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
    && typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)
    && (r.photoUri === undefined || typeof r.photoUri === 'string');
}
function readIds(raw: string): string[] {
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || !values.every(v => typeof v === 'string' && v.length > 0)) throw new Error('Invalid local index');
  return [...new Set(values)];
}
async function loadReports(): Promise<{ reports: Report[]; warning: string | null; safeToWrite: boolean }> {
  const indexRaw = await AsyncStorage.getItem(K_INDEX);
  if (indexRaw === null) {
    const legacy = await AsyncStorage.getItem(K_LEGACY);
    if (!legacy) return { reports: [], warning: null, safeToWrite: true };
    const values: unknown = JSON.parse(legacy);
    if (!Array.isArray(values) || !values.every(isStoredReport)) throw new Error('Invalid legacy reports');
    const reports = values;
    // Migrate: records first, then commit the index, then drop the legacy entry.
    await AsyncStorage.multiSet(reports.map((r) => [recKey(r.id), JSON.stringify(r)] as [string, string]));
    await AsyncStorage.setItem(K_INDEX, JSON.stringify(reports.map((r) => r.id)));
    let warning: string | null = null;
    try {
      await AsyncStorage.removeItem(K_LEGACY);
    } catch {
      warning = 'نُقلت بلاغاتك إلى التخزين الجديد، لكن تعذّر حذف النسخة القديمة من الجهاز.';
    }
    return { reports, warning, safeToWrite: true };
  }
  const ids = readIds(indexRaw);
  const pairs = ids.length ? await AsyncStorage.multiGet(ids.map(recKey)) : [];
  const reports: Report[] = [];
  let broken = 0;
  for (const [key, v] of pairs) {
    if (!v) {
      broken++;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(v);
      if (!isStoredReport(parsed) || recKey(parsed.id) !== key) throw new Error('Invalid record');
      reports.push(parsed);
    } catch {
      broken++;
    }
  }
  return { reports, safeToWrite: broken === 0, warning: broken ? `تعذّرت قراءة ${broken} من بلاغاتك المحفوظة على هذا الجهاز.` : null };
}

interface Ctx {
  loading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  mine: Report[];
  all: Report[];
  saved: string[];
  showDemo: boolean;
  setShowDemo: (v: boolean) => Promise<void>;
  getReport: (id: string) => Report | undefined;
  createReport: (input: ReportInput) => Promise<Report>;
  updateReport: (id: string, input: Partial<Report>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  toggleSaved: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  publishLocal?: (id: string) => Promise<Report>;
}

const ReportsContext = createContext<Ctx | null>(null);

function LocalReportsProvider({ children }: { children: React.ReactNode }) {
  const [mine, setMineState] = useState<Report[]>([]);
  const [saved, setSavedState] = useState<string[]>([]);
  const mineRef = useRef<Report[]>([]);
  const savedRef = useRef<string[]>([]);
  const pending = useRef(Promise.resolve());
  const writable = useRef(false);
  const requireLoaded = () => {
    if (!writable.current) throw new Error('تعذّر التأكد من بياناتك المحفوظة. أعد تحميلها قبل التعديل حتى لا تفقد أي بلاغ.');
  };
  const enqueue = useCallback(<Result,>(operation: () => Promise<Result>): Promise<Result> => {
    const result = pending.current.then(operation);
    pending.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);
  const setMine = useCallback((reports: Report[]) => {
    mineRef.current = reports;
    setMineState(reports);
  }, []);
  const setSaved = useCallback((ids: string[]) => {
    savedRef.current = ids;
    setSavedState(ids);
  }, []);
  const [showDemo, setShowDemoState] = useState<boolean>(IS_PREVIEW);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    void enqueue(async () => {
      setLoading(true);
      writable.current = false;
      setLoadError(null);
      try {
        const { reports, warning, safeToWrite } = await loadReports();
        const [s, dm] = await AsyncStorage.multiGet([K_SAVED, K_DEMO]).then((x) => x.map((p) => p[1]));
        if (!alive) return;
        setMine(reports.map((report) => ({ ...report, local: true, isOwner: true })));
        setSaved(s ? readIds(s) : []);
        writable.current = safeToWrite;
        setShowDemoState(dm === null ? IS_PREVIEW : dm === '1');
        if (warning) setLoadError(warning);
      } catch {
        if (alive) setLoadError('تعذّر قراءة البيانات المحفوظة على هذا الجهاز.');
      } finally {
        if (alive) setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [nonce, enqueue, setMine, setSaved]);

  const createReport = useCallback(
    (input: ReportInput) => enqueue(async () => {
      requireLoaded();
      const now = Date.now();
      const r: Report = { ...input, id: now.toString() + Math.random().toString(36).slice(2, 9), status: 'open', createdAt: now, updatedAt: now, local: true, isOwner: true };
      try {
        await AsyncStorage.setItem(recKey(r.id), JSON.stringify(r));
      } catch {
        throw new Error(WRITE_ERR);
      }
      try {
        await writeIndex([r.id, ...mineRef.current.map((m) => m.id)]);
      } catch (e) {
        await AsyncStorage.removeItem(recKey(r.id)).catch(() => undefined); // orphan cleanup only; the index error is still thrown
        throw e;
      }
      setMine([r, ...mineRef.current]);
      return r;
    }),
    [enqueue, setMine],
  );

  const updateReport = useCallback(
    (id: string, input: Partial<Report>) => enqueue(async () => {
      requireLoaded();
      const cur = mineRef.current.find((r) => r.id === id);
      if (!cur) throw new Error('البلاغ غير موجود على هذا الجهاز.');
      const next: Report = { ...cur, ...input, id, updatedAt: Date.now() };
      try {
        await AsyncStorage.setItem(recKey(id), JSON.stringify(next));
      } catch {
        throw new Error(WRITE_ERR);
      }
      setMine(mineRef.current.map((r) => (r.id === id ? next : r)));
    }),
    [enqueue, setMine],
  );

  const deleteReport = useCallback(
    (id: string) => enqueue(async () => {
      requireLoaded();
      const rest = mineRef.current.filter((r) => r.id !== id);
      await writeIndex(rest.map((r) => r.id));
      setMine(rest);
      const problems: string[] = [];
      try {
        await AsyncStorage.removeItem(recKey(id));
      } catch {
        problems.push('بيانات البلاغ');
      }
      try {
        const recoveryPrefix = IS_PREVIEW ? 'yat-biha.preview.recovery.v1.' : 'yat-biha.local.recovery.v1.';
        await AsyncStorage.removeItem(recoveryPrefix + encodeURIComponent(id));
      } catch {
        problems.push('ملاحظات الإعادة الخاصة؛ امسح بيانات الجهاز من الإعدادات لإكمال الإزالة');
      }
      if (savedRef.current.includes(id)) {
        const ns = savedRef.current.filter((x) => x !== id);
        try {
          await AsyncStorage.setItem(K_SAVED, JSON.stringify(ns));
          setSaved(ns);
        } catch {
          problems.push('قائمة المحفوظات');
        }
      }
      if (problems.length) throw new Error(`أُزيل البلاغ من القائمة، لكن تعذّر حذف ${problems.join(' و')} من ذاكرة الجهاز.`);
    }),
    [enqueue, setMine, setSaved],
  );

  const toggleSaved = useCallback(
    (id: string) => enqueue(async () => {
      requireLoaded();
      const ns = savedRef.current.includes(id) ? savedRef.current.filter((x) => x !== id) : [id, ...savedRef.current];
      try {
        await AsyncStorage.setItem(K_SAVED, JSON.stringify(ns));
      } catch {
        throw new Error('تعذّر تحديث المحفوظات على الجهاز.');
      }
      setSaved(ns);
    }),
    [enqueue, setSaved],
  );

  const setShowDemo = useCallback((v: boolean) => enqueue(async () => {
    try {
      await AsyncStorage.setItem(K_DEMO, v ? '1' : '0');
    } catch {
      throw new Error('تعذّر حفظ الإعداد.');
    }
    setShowDemoState(v);
  }), [enqueue]);

  const clearAll = useCallback(() => enqueue(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const extras = IS_PREVIEW ? 'yat-biha.preview.' : 'yat-biha.local.';
      const recs = keys.filter((k) => k.startsWith(K_REC) || k.startsWith(extras));
      await AsyncStorage.multiRemove([K_INDEX, K_LEGACY, K_SAVED, STORAGE_PREFIX + 'saved-searches.v1', ...recs]);
    } catch {
      throw new Error('تعذّر مسح البيانات من الجهاز.');
    }
    writable.current = true;
    setLoadError(null);
    setMine([]);
    setSaved([]);
  }), [enqueue, setMine, setSaved]);

  const all = useMemo(() => [...mine, ...(showDemo ? DEMO_REPORTS : [])], [mine, showDemo]);
  const getReport = useCallback((id: string) => mine.find((r) => r.id === id) ?? (showDemo ? DEMO_REPORTS.find((r) => r.id === id) : undefined), [mine, showDemo]);

  const value = useMemo<Ctx>(
    () => ({ loading, loadError, retryLoad: () => setNonce((n) => n + 1), mine, all, saved, showDemo, setShowDemo, getReport, createReport, updateReport, deleteReport, toggleSaved, clearAll }),
    [loading, loadError, mine, all, saved, showDemo, setShowDemo, getReport, createReport, updateReport, deleteReport, toggleSaved, clearAll],
  );
  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports() {
  const c = useContext(ReportsContext);
  if (!c) throw new Error('useReports must be used within ReportsProvider');
  return c;
}

export function ReportsProvider({ children }: { children: React.ReactNode }) {
  return <LocalReportsProvider>{IS_PREVIEW ? children : <CommunityReportsProvider>{children}</CommunityReportsProvider>}</LocalReportsProvider>;
}

function CommunityReportsProvider({ children }: { children: React.ReactNode }) {
  const local = useReports();
  const { userId, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const query = useListReports({ query: { queryKey: ['/api/reports', userId ?? 'guest'], enabled: isLoaded, refetchInterval: 15000 } });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['/api/reports'] }); };
  const shared: Report[] = (query.data ?? []).map((r) => ({
    ...r, photoUri: r.photoId ? `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ''}/api/photos/${r.photoId}` : undefined,
  }));
  const localMine = local.mine.map((r) => ({ ...r, local: true, isOwner: true }));
  const all = [...shared.filter((r) => !r.hidden), ...localMine, ...(local.showDemo ? DEMO_REPORTS : [])];
  const mine = [...shared.filter((r) => r.isOwner), ...localMine];
  async function photoId(input: Partial<Report>) {
    if (!input.photoUri) return null;
    if (input.photoId && !input.photoUri.startsWith('data:')) return input.photoId;
    if (!input.photoUri.startsWith('data:')) throw new Error('اختر الصورة من جديد قبل النشر.');
    const blob = await (await fetch(input.photoUri)).blob();
    const upload = await requestPhotoUpload({ size: blob.size });
    const response = await fetch(upload.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
    if (!response.ok) throw new Error('تعذّر رفع الصورة. لم يُنشر البلاغ.');
    return upload.photoId;
  }
  async function createReport(input: ReportInput): Promise<Report> {
    if (!isSignedIn) throw new Error('سجّل الدخول أولاً لنشر البلاغ.');
    const { type, title, category, description, city, place, date } = input;
    const r = await createShared({ type, title, category: category as Parameters<typeof createShared>[0]['category'], description, city, place, date, photoId: await photoId(input) });
    await refresh();
    return { ...r, photoUri: r.photoId ? `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ''}/api/photos/${r.photoId}` : undefined };
  }
  const value: Ctx = {
    ...local, all, mine,
    loading: local.loading || query.isLoading,
    loadError: query.error ? 'تعذّر تحميل البلاغات المشتركة. تحقق من الاتصال وحاول مجدداً.' : local.loadError,
    retryLoad: () => { local.retryLoad(); void query.refetch(); },
    getReport: (id) => shared.find((r) => r.id === id) ?? localMine.find((r) => r.id === id) ?? (local.showDemo ? DEMO_REPORTS.find((r) => r.id === id) : undefined),
    createReport,
    updateReport: async (id, input) => {
      if (localMine.some((r) => r.id === id)) return local.updateReport(id, input);
      const current = shared.find((r) => r.id === id);
      if (!current?.isOwner) throw new Error('لا يمكنك تعديل هذا البلاغ.');
      const { type, title, category, description, city, place, date, status } = input;
      await updateShared(id, { type, title, category: category as Parameters<typeof updateShared>[1]['category'], description, city, place, date, status,
        ...('photoUri' in input ? { photoId: await photoId({ ...input, photoId: current.photoId }) } : {}) });
      await refresh();
    },
    deleteReport: async (id) => {
      if (localMine.some((r) => r.id === id)) return local.deleteReport(id);
      await deleteShared(id);
      await refresh();
    },
    publishLocal: async (id) => {
      const r = localMine.find((r) => r.id === id);
      if (!r) throw new Error('البلاغ المحلي غير موجود.');
      // Keep the private original; publishing is explicit and never migrates silently.
      return createReport(r);
    },
  };
  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}
