import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CATEGORIES, CITIES, useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Chip, Empty, ErrorBox, ReportCard, ROW, SkeletonList, T, F } from '@/components/ui';

type TypeFilter = 'all' | 'lost' | 'found';

export default function Search() {
  const c = useColors();
  const params = useLocalSearchParams<{ category?: string }>();
  const { all, loading, loadError, retryLoad } = useReports();
  const [q, setQ] = useState<string>('');
  const [type, setType] = useState<TypeFilter>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [showReturned, setShowReturned] = useState<boolean>(false);

  useEffect(() => {
    if (params.category) setCat(params.category);
  }, [params.category]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => (type === 'all' ? true : r.type === type))
      .filter((r) => (cat ? r.category === cat : true))
      .filter((r) => (city ? r.city === city : true))
      .filter((r) => (showReturned ? true : r.status === 'open'))
      .filter((r) => (needle ? `${r.title} ${r.description} ${r.place} ${r.city}`.toLowerCase().includes(needle) : true))
      .sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [all, q, type, cat, city, showReturned]);

  const anyFilter = q || type !== 'all' || cat || city || showReturned;

  return (
    <TabScreen title="البحث" subtitle="ابحث بالكلمات أو صفِّ حسب النوع والفئة والمدينة">
      <View style={{ flexDirection: ROW, alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 }}>
        <Feather name="search" size={18} color={c.mutedForeground} />
        <TextInput
          testID="search-input"
          value={q}
          onChangeText={setQ}
          placeholder="مثال: محفظة، مفاتيح، الكورنيش"
          placeholderTextColor={c.mutedForeground}
          style={{ flex: 1, paddingVertical: 14, fontFamily: F.regular, fontSize: 15, color: c.foreground, textAlign: 'right', writingDirection: 'rtl' }}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10}>
            <Feather name="x-circle" size={18} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: ROW, gap: 8, marginTop: 14 }}>
        <Chip label="الكل" active={type === 'all'} onPress={() => setType('all')} />
        <Chip label="مفقود" active={type === 'lost'} tone={c.magenta} onPress={() => setType('lost')} />
        <Chip label="معثور عليه" active={type === 'found'} tone={c.turquoise} onPress={() => setType('found')} />
      </View>

      <FilterRow label="الفئة">
        {CATEGORIES.map((x) => (
          <Chip key={x.key} label={x.label} icon={x.icon as keyof typeof Feather.glyphMap} active={cat === x.key} onPress={() => setCat(cat === x.key ? null : x.key)} />
        ))}
      </FilterRow>
      <FilterRow label="المدينة">
        {CITIES.map((x) => (
          <Chip key={x} label={x} active={city === x} onPress={() => setCity(city === x ? null : x)} />
        ))}
      </FilterRow>

      <View style={{ flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 }}>
        <T w="semibold" size={14} color={c.mutedForeground}>
          {loading ? 'جارٍ التحميل…' : `${results.length.toLocaleString('ar-SA')} نتيجة`}
        </T>
        <View style={{ flexDirection: ROW, gap: 8 }}>
          <Chip label="يشمل المُعاد" icon="check" active={showReturned} onPress={() => setShowReturned(!showReturned)} />
          {anyFilter ? (
            <Chip
              label="مسح"
              icon="x"
              onPress={() => {
                setQ('');
                setType('all');
                setCat(null);
                setCity(null);
                setShowReturned(false);
              }}
            />
          ) : null}
        </View>
      </View>

      {loadError ? <ErrorBox message={loadError} onRetry={retryLoad} /> : null}
      {loading ? <SkeletonList /> : results.length === 0 ? <Empty icon="compass" title="لا نتائج مطابقة" body="جرّب كلمات أبسط، أو وسّع الفلاتر. قد يظهر بلاغ مطابق لاحقاً، فاحفظ بلاغك وعد إليه." /> : results.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)}
    </TabScreen>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 14 }}>
      <T w="semibold" size={13} color={c.mutedForeground} style={{ marginBottom: 6 }}>
        {label}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, flexDirection: ROW }}>
        {children}
      </ScrollView>
    </View>
  );
}
