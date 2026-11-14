import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CATEGORIES, CITIES, categoryOf, useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Button, Chip, Empty, ErrorBox, ReportCard, ROW, SkeletonList, T, F } from '@/components/ui';
import { IS_PREVIEW } from '@/config/runtime';
import { normalizeArabic, searchReports } from '@/utils/matching';

type TypeFilter = 'all' | 'lost' | 'found';
type SavedSearch = { id: string; q: string; type: TypeFilter; category: string | null; city: string | null; returned: boolean };
const SEARCH_KEY = `${IS_PREVIEW ? 'yatbiha.preview.' : 'yatbiha.'}saved-searches.v1`;
const validType = (value?: string): TypeFilter => value === 'lost' || value === 'found' ? value : 'all';
const validCategory = (value?: string) => CATEGORIES.some((x) => x.key === value) ? value! : null;
const validCity = (value?: string) => CITIES.includes(value ?? '') ? value! : null;
const searchName = (s: SavedSearch) => [s.q || (s.category ? categoryOf(s.category).label : s.type === 'found' ? 'المعثورات' : s.type === 'lost' ? 'المفقودات' : 'كل البلاغات'), s.city].filter(Boolean).join(' · ');
const identity = (s: Omit<SavedSearch, 'id'>) => JSON.stringify([normalizeArabic(s.q), s.type, s.category, s.city, s.returned]);

export default function Search() {
  const c = useColors();
  const params = useLocalSearchParams<{ q?: string; category?: string; city?: string; type?: string }>();
  const { all, loading, loadError, retryLoad } = useReports();
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [showReturned, setShowReturned] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<'relevance' | 'recent'>('relevance');
  const [limit, setLimit] = useState(30);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const hydratingRef = useRef(true);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const storageRevision = useRef(0);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    setQ(typeof params.q === 'string' ? params.q.slice(0, 200) : '');
    setCat(validCategory(params.category));
    setCity(validCity(params.city));
    setType(validType(params.type));
    setShowReturned(false);
  }, [params.q, params.category, params.city, params.type]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    hydratingRef.current = true;
    setStorageReady(false);
    setStorageError('');
    void (async () => {
      // A user may leave this tab while a save is pending. Read only after it settles.
      await pendingWrite.current;
      if (!alive) return;
      const revision = storageRevision.current;
      try {
        const raw = await AsyncStorage.getItem(SEARCH_KEY);
        if (!alive || revision !== storageRevision.current) return;
        if (raw === null) { setSavedSearches([]); return; }
        const data: unknown = JSON.parse(raw);
        if (!Array.isArray(data)) throw new Error('invalid searches');
        const safe = data.filter((s): s is SavedSearch => !!s && typeof s === 'object' &&
          typeof s.id === 'string' && typeof s.q === 'string' && s.q.length <= 200 &&
          ['all', 'lost', 'found'].includes(s.type) && (s.category === null || validCategory(s.category) !== null) &&
          (s.city === null || validCity(s.city) !== null) && typeof s.returned === 'boolean');
        setSavedSearches(safe.slice(0, 6));
      } catch {
        if (alive && revision === storageRevision.current) setStorageError('تعذّر تحميل عمليات البحث المحفوظة. يمكنك مواصلة البحث.');
      } finally {
        if (alive && revision === storageRevision.current) { hydratingRef.current = false; setStorageReady(true); }
      }
    })();
    return () => { alive = false; };
  }, []));

  useEffect(() => { setLimit(30); setNotice(''); }, [q, type, cat, city, showReturned, sort]);

  const results = useMemo(() => {
    const filtered = all.filter((r) => (type === 'all' || r.type === type) && (!cat || r.category === cat) &&
      (!city || r.city === city) && (showReturned || r.status === 'open'));
    const ranked = searchReports(filtered, q);
    if (sort === 'recent') ranked.sort((a, b) => b.report.date.localeCompare(a.report.date) || b.report.createdAt - a.report.createdAt);
    return ranked;
  }, [all, q, type, cat, city, showReturned, sort]);

  const filterCount = Number(!!cat) + Number(!!city) + Number(showReturned);
  const anyFilter = !!q.trim() || type !== 'all' || filterCount > 0;
  const current = { q: q.trim(), type, category: cat, city, returned: showReturned };
  const alreadySaved = savedSearches.some((s) => identity(s) === identity(current));
  const reset = () => { setQ(''); setType('all'); setCat(null); setCity(null); setShowReturned(false); setSort('relevance'); };
  const persist = async (next: SavedSearch[], success: string) => {
    if (savingRef.current || hydratingRef.current || !storageReady) return;
    savingRef.current = true;
    storageRevision.current++;
    setSaving(true); setStorageError('');
    const operation = AsyncStorage.setItem(SEARCH_KEY, JSON.stringify(next));
    pendingWrite.current = operation.catch(() => undefined);
    try { await operation; setSavedSearches(next); setNotice(success); }
    catch { setStorageError('لم يتم حفظ التغيير. قد تكون ذاكرة الجهاز ممتلئة؛ حاول مرة أخرى.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <TabScreen title="ابحث عن أثر" subtitle="صف ما تتذكره، حتى لو لم تعرف الاسم الدقيق.">
      <View style={{ flexDirection: ROW, alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 20, borderWidth: 1.5, borderColor: q ? c.turquoise : c.border, paddingHorizontal: 16 }}>
        <Feather name="search" size={21} color={c.turquoise} />
        <TextInput
          accessibilityLabel="وصف الغرض للبحث"
          testID="search-input"
          value={q}
          onChangeText={setQ}
          placeholder="محفظة بنية في الرياض…"
          placeholderTextColor={c.mutedForeground}
          maxLength={200}
          style={{ flex: 1, minWidth: 0, paddingVertical: 18, fontFamily: F.medium, fontSize: 16, color: c.foreground, textAlign: 'right', writingDirection: 'rtl' }}
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
        />
        {q ? <Pressable accessibilityRole="button" accessibilityLabel="مسح نص البحث" onPress={() => setQ('')} style={{ padding: 10 }}><Feather name="x" size={18} color={c.mutedForeground} /></Pressable> : null}
      </View>
      <T size={12} color={c.mutedForeground} style={{ marginTop: 8 }}>يدعم اختلاف الكتابة العربية وكلمات شائعة بالعربية والإنجليزية.</T>

      <View style={{ flexDirection: ROW, gap: 8, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
        <Chip label="الكل" active={type === 'all'} onPress={() => setType('all')} />
        <Chip label="المعثورات" active={type === 'found'} tone={c.turquoise} onPress={() => setType('found')} />
        <Chip label="المفقودات" active={type === 'lost'} tone={c.magenta} onPress={() => setType('lost')} />
        <Pressable accessibilityRole="button" accessibilityLabel="خيارات تصفية البحث" accessibilityState={{ expanded: filtersOpen }} testID="search-filters" onPress={() => setFiltersOpen(!filtersOpen)} style={{ flexDirection: ROW, alignItems: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: filtersOpen ? c.turquoise : c.border, backgroundColor: filtersOpen ? c.turquoiseSoft : c.card }}>
          <Feather name="sliders" size={16} color={c.primary} /><T size={13} w="medium">تصفية{filterCount ? ` · ${filterCount.toLocaleString('ar-SA')}` : ''}</T>
        </Pressable>
      </View>

      {filtersOpen ? <View style={{ marginTop: 16, padding: 18, borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, gap: 18 }}>
        <FilterGroup label="الفئة">
          {CATEGORIES.map((x) => <Chip key={x.key} label={x.label} icon={x.icon as keyof typeof Feather.glyphMap} active={cat === x.key} onPress={() => setCat(cat === x.key ? null : x.key)} />)}
        </FilterGroup>
        <FilterGroup label="المدينة">
          {CITIES.map((x) => <Chip key={x} label={x} active={city === x} onPress={() => setCity(city === x ? null : x)} />)}
        </FilterGroup>
        <View style={{ flexDirection: ROW, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="يشمل الأغراض المعادة" icon="check-circle" active={showReturned} onPress={() => setShowReturned(!showReturned)} />
          <Chip label="إغلاق التصفية" icon="chevron-up" onPress={() => setFiltersOpen(false)} />
        </View>
      </View> : filterCount ? <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {cat ? <Chip label={categoryOf(cat).label} icon="x" onPress={() => setCat(null)} /> : null}
        {city ? <Chip label={city} icon="x" onPress={() => setCity(null)} /> : null}
        {showReturned ? <Chip label="يشمل المُعاد" icon="x" onPress={() => setShowReturned(false)} /> : null}
      </View> : null}

      {!anyFilter && savedSearches.length > 0 ? <View style={{ marginTop: 22, padding: 16, borderRadius: 20, backgroundColor: c.secondary, gap: 10 }}>
        <T w="semibold" size={14}>عمليات بحثك المحفوظة</T>
        <T size={12} color={c.mutedForeground}>آخر ٦ عمليات على هذا الجهاز فقط · لا تُرسل تنبيهات تلقائية.</T>
        {savedSearches.map((s) => <View key={s.id} style={{ flexDirection: ROW, alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`فتح البحث: ${searchName(s)}`} onPress={() => { setQ(s.q); setType(s.type); setCat(s.category); setCity(s.city); setShowReturned(s.returned); }} style={{ flex: 1, flexDirection: ROW, alignItems: 'center', gap: 9, backgroundColor: c.card, borderRadius: 13, padding: 12 }}>
            <Feather name="clock" size={16} color={c.turquoise} /><T size={13} w="medium" numberOfLines={2} style={{ flex: 1 }}>{searchName(s)}</T><Feather name="arrow-up-left" size={16} color={c.mutedForeground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`حذف البحث المحفوظ: ${searchName(s)}`} disabled={saving} onPress={() => void persist(savedSearches.filter((x) => x.id !== s.id), 'حُذفت عملية البحث من الجهاز.')} style={{ padding: 12 }}><Feather name="x" size={17} color={c.mutedForeground} /></Pressable>
        </View>)}
      </View> : null}

      <View style={{ flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 26, marginBottom: 14 }}>
        <View>
          <T w="bold" size={20}>{loading ? 'نبحث في البلاغات…' : `${results.length.toLocaleString('ar-SA')} ${results.length === 1 ? 'نتيجة' : 'نتائج'}`}</T>
          <T size={12} color={c.mutedForeground}>{q.trim() ? 'مرتبة حسب الكلمات والتفاصيل المذكورة' : 'ابدأ بالأحدث، أو أضف وصفاً أدق'}</T>
        </View>
        {anyFilter ? <Pressable accessibilityRole="button" accessibilityLabel="إعادة ضبط البحث والفلاتر" onPress={reset} style={{ paddingVertical: 10, paddingHorizontal: 4 }}><T w="semibold" size={13} color={c.turquoise}>مسح الفلاتر</T></Pressable> : null}
      </View>

      <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <Chip label="الأقرب للوصف" active={sort === 'relevance'} onPress={() => setSort('relevance')} />
        <Chip label="الأحدث" active={sort === 'recent'} onPress={() => setSort('recent')} />
        {anyFilter ? <Pressable accessibilityRole="button" accessibilityLabel="حفظ البحث على هذا الجهاز" disabled={saving || alreadySaved || !storageReady} onPress={() => void persist([{ ...current, id: `${Date.now()}` }, ...savedSearches].slice(0, 6), 'حُفظ البحث على هذا الجهاز. يمكنك فتحه لاحقاً؛ لا توجد تنبيهات تلقائية.')} style={{ flexDirection: ROW, gap: 6, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, opacity: saving || alreadySaved || !storageReady ? 0.55 : 1 }}>
          <Feather name={alreadySaved ? 'check' : 'bookmark'} size={16} color={c.turquoise} /><T size={13} w="semibold" color={c.turquoise}>{alreadySaved ? 'البحث محفوظ' : saving ? 'جارٍ الحفظ…' : 'حفظ البحث'}</T>
        </Pressable> : null}
      </View>
      {notice ? <T accessibilityLiveRegion="polite" size={13} color={c.success} style={{ marginBottom: 14 }}>{notice}</T> : null}
      {storageError ? <ErrorBox message={storageError} /> : null}
      {loadError ? <ErrorBox message={loadError} onRetry={retryLoad} /> : null}
      {loading ? <SkeletonList /> : results.length === 0 ? <Empty icon="compass" title="لم نجد هذه التفاصيل بعد" body="جرّب اسم الغرض ولونه فقط، أو أزل المدينة لتوسيع البحث. احفظ البحث للعودة إليه لاحقاً." action={<Button label="توسيع البحث" variant="soft" icon="sliders" onPress={reset} />} /> : results.slice(0, limit).map(({ report }, i) => <ReportCard key={report.id} report={report} index={i} />)}
      {results.length > limit ? <Button label={`عرض المزيد · ${Math.min(results.length - limit, 30).toLocaleString('ar-SA')}`} variant="soft" onPress={() => setLimit((value) => value + 30)} /> : null}
    </TabScreen>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return <View style={{ gap: 8 }}><T w="semibold" size={13} color={c.mutedForeground}>{label}</T><View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 7 }}>{children}</View></View>;
}
