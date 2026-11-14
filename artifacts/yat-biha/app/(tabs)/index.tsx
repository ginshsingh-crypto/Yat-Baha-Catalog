import React from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CATEGORIES, findMatches, useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { ReturnIllustration } from '@/components/home/ReturnIllustration';
import { Empty, ErrorBox, Press, ReportCard, ROW, SectionTitle, SkeletonList, T, Button } from '@/components/ui';

const CATEGORY_COLORS = ['#EEF3EB', '#EBF0F8', '#FFF0D9', '#F3EAF0', '#E8F4F1', '#F9EDE5', '#EBF0F8', '#F3EAF0', '#EEF1F4'];
const CATEGORY_SHORT: Record<string, string> = { jewelry: 'ساعات وحُلي', electronics: 'إلكترونيات' };

export default function Home() {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  const availableWidth = Math.min(width, 720);
  const compact = availableWidth < 480;
  const tiny = availableWidth < 360;
  const largeText = fontScale > 1.2;
  const { all, mine, loading, loadError, retryLoad } = useReports();
  const open = all.filter((r) => r.status === 'open' && !r.hidden);
  const recent = [...open].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.createdAt - a.createdAt)).slice(0, 4);
  const activeMine = mine.filter((r) => r.status === 'open' && !r.hidden);
  const nextReport = activeMine.find((r) => findMatches(r, all).length > 0) ?? activeMine[0];
  const nextMatches = nextReport ? findMatches(nextReport, all).length : 0;
  const goNew = (type: 'lost' | 'found') => router.push({ pathname: '/report/new', params: { type } });

  return (
    <TabScreen>
      <View style={styles.brandRow}>
        <View style={{ flexDirection: ROW, alignItems: 'center', gap: 10 }}>
          <Image source={require('@/assets/images/logo.png')} style={{ width: 43, height: 43, borderRadius: 12 }} accessibilityLabel="شعار يأت بها" />
          <View>
            <T w="bold" size={23} style={{ lineHeight: 32 }}>يأتِ بها</T>
            <T size={11} color={c.mutedForeground} style={{ lineHeight: 19 }}>من الحاجة إلى الوصول</T>
          </View>
        </View>
        <Press onPress={() => router.push('/mine')} accessibilityLabel="فتح بلاغاتي" style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="grid" size={20} color={c.primary} />
        </Press>
      </View>

      <View style={[styles.hero, { padding: compact ? 21 : 28 }]}>
        <View style={styles.heroGlow} />
        {!largeText ? <View pointerEvents="none" style={{ position: 'absolute', left: compact ? 2 : 20, top: compact ? 25 : 17, opacity: 0.98 }}>
          <ReturnIllustration width={compact ? (tiny ? 107 : 124) : 173} />
        </View> : null}
        <View style={{ alignSelf: 'flex-end', flexDirection: ROW, alignItems: 'center', gap: 6, paddingBottom: 10 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#F7B24F' }} />
          <T size={11} w="medium" color="#B1DCD5">مساحة تجمع الفقد بالأمانة</T>
        </View>
        <T w="bold" size={compact ? (tiny ? 26 : 30) : 37} color="#FFFFFF" style={{ lineHeight: compact ? 43 : 53, width: largeText ? '100%' : compact ? '74%' : '70%', alignSelf: 'flex-end', marginBottom: compact ? 16 : 22 }}>
          {'ما ضاع منك،\nقد وجده أحد.'}
        </T>
        <T size={compact ? 13 : 14} color="#D5E9E6" style={{ maxWidth: compact ? '100%' : '75%', alignSelf: 'flex-end' }}>
          صِف ما فقدت أو أبلغ عمّا وجدت. نقرّب التفاصيل، وتبقى أنت صاحب القرار.
        </T>
        <View style={{ flexDirection: ROW, gap: 10, marginTop: 23 }}>
          <Press testID="cta-lost" onPress={() => goNew('lost')} style={[styles.cta, { backgroundColor: '#F6A232' }]}>
            <Feather name="search" size={18} color="#35220A" />
            <T w="bold" size={14} color="#35220A">فقدت شيئاً</T>
          </Press>
          <Press testID="cta-found" onPress={() => goNew('found')} style={[styles.cta, { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', borderWidth: 1 }]}>
            <Feather name="plus" size={19} color="#153D3B" />
            <T w="bold" size={14} color="#153D3B">وجدت شيئاً</T>
          </Press>
        </View>
      </View>

      <Press testID="home-search" onPress={() => router.push('/search')} accessibilityLabel="ابحث في البلاغات" style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.turquoiseSoft }}>
          <Feather name="search" size={19} color={c.turquoise} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="semibold" size={14}>هل وجده أحد قبلك؟</T>
          <T size={12} color={c.mutedForeground}>ابحث عن الغرض، اللون أو المكان</T>
        </View>
        <Feather name="arrow-left" size={19} color={c.mutedForeground} />
      </Press>

      {nextReport ? (
        <Press testID="home-follow-up" onPress={() => router.push(`/report/${nextReport.id}`)} style={[styles.followUp, { borderColor: c.border, backgroundColor: '#EDF5F3' }]}>
          <View style={{ flexDirection: ROW, gap: 10, alignItems: 'center' }}>
            <Feather name={nextMatches ? 'git-merge' : 'clock'} size={18} color={c.turquoise} />
            <T size={12} w="semibold" color={c.turquoise} style={{ flex: 1 }}>{nextMatches ? 'حان وقت مقارنة التفاصيل' : 'أكمل من حيث توقفت'}</T>
            <Feather name="arrow-left" size={17} color={c.turquoise} />
          </View>
          <T w="bold" size={16} numberOfLines={1}>{nextReport.title}</T>
          <T size={12} color={c.mutedForeground}>{nextMatches ? `${nextMatches.toLocaleString('ar-SA')} من البلاغات تستحق المراجعة. التشابه وحده لا يثبت الملكية.` : 'راجع تفاصيل بلاغك، وابحث عن تطابق أو حدّث حالة الغرض.'}</T>
        </Press>
      ) : null}

      <SectionTitle title="عن ماذا تبحث؟" />
      <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: compact ? 8 : 10 }}>
        {CATEGORIES.map((cat, index) => (
          <Press
            key={cat.key}
            accessibilityLabel={`البحث في فئة ${cat.label}`}
            onPress={() => router.push({ pathname: '/search', params: { category: cat.key } })}
            style={{ width: compact ? '31.5%' : '18.7%', flexGrow: 1, minHeight: compact ? 91 : 95, borderRadius: 19, paddingHorizontal: 4, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: CATEGORY_COLORS[index] }}
          >
            <Feather name={cat.icon as keyof typeof Feather.glyphMap} size={24} color="#354A50" />
            <T w="medium" size={12} center>{CATEGORY_SHORT[cat.key] ?? cat.label}</T>
          </Press>
        ))}
        {!compact ? <View style={{ width: '18.7%', flexGrow: 1 }} /> : null}
      </View>

      <View style={{ marginTop: 6 }}>
        <SectionTitle title="قد يكون هنا" action="كل البلاغات" onAction={() => router.push('/search')} />
        <T size={12} color={c.mutedForeground} style={{ marginBottom: 15, marginTop: -6 }}>أحدث المفقودات والمعثورات، والتفاصيل التي تصنع الفرق.</T>
        {loadError ? <ErrorBox message={loadError} onRetry={retryLoad} /> : null}
        {loading ? <SkeletonList /> : recent.length === 0 ? (
          <Empty icon="compass" title="البداية من بلاغك" body="لا توجد بلاغات مفتوحة الآن. أضف ما فقدت أو وجدت لتبدأ رحلة البحث." action={<Button label="إنشاء بلاغ" icon="plus" onPress={() => router.push('/report/new')} />} />
        ) : recent.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)}
      </View>

      <View style={[styles.journey, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: ROW, gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.orangeSoft, justifyContent: 'center', alignItems: 'center' }}>
            <Feather name="shield" size={19} color="#8F5416" />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={17}>إلى صاحبه، بخطوات واضحة</T>
            <T size={11} color={c.mutedForeground}>المطابقة بداية للتحقّق، وليست إثباتاً للملكية.</T>
          </View>
        </View>
        {[
          ['١', 'صِف الغرض', 'لون، صورة واضحة ومكان تقريبي. احتفظ بعلامة مميزة للتحقّق لاحقاً.'],
          ['٢', 'قارن التفاصيل', 'راجع أسباب التشابه، واسأل عن وصف لا يظهر في البلاغ.'],
          ['٣', 'أعِد الأمانة', 'اتفق على مكان عام أو جهة مخوّلة، ثم حدّث حالة البلاغ.'],
        ].map(([number, title, body], index) => (
          <View key={number} style={{ flexDirection: ROW, alignItems: 'flex-start', gap: 12, paddingBottom: index < 2 ? 17 : 0 }}>
            <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: '#EDF5F3', alignItems: 'center', justifyContent: 'center', marginTop: 3 }}>
              <T size={12} w="bold" color={c.turquoise} center>{number}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={14} w="semibold">{title}</T>
              <T size={12} color={c.mutedForeground}>{body}</T>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 }}>
        <Feather name={IS_PREVIEW ? 'smartphone' : 'heart'} size={13} color={c.mutedForeground} />
        <T size={11} color={c.mutedForeground} center style={{ flexShrink: 1 }}>{IS_PREVIEW ? 'مساحة للتجربة. بلاغاتك هنا تبقى على جهازك.' : 'كل أمانة تعود، تبدأ بشخص يهتم.'}</T>
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  iconBtn: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  hero: { borderRadius: 29, overflow: 'hidden', backgroundColor: '#123D3B' },
  heroGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 150, top: -90, left: -90, backgroundColor: '#1D514B', opacity: 0.65 },
  cta: { flex: 1, minHeight: 51, flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 5, borderRadius: 14 },
  search: { flexDirection: ROW, alignItems: 'center', gap: 11, padding: 14, borderRadius: 20, borderWidth: 1, marginTop: 14 },
  followUp: { borderRadius: 19, borderWidth: 1, padding: 16, marginTop: 14, gap: 5 },
  journey: { borderRadius: 22, borderWidth: 1, padding: 20, marginTop: 22 },
});
