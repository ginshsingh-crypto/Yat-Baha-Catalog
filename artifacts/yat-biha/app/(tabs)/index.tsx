import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { CATEGORIES, useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Chip, Empty, ErrorBox, Press, ReportCard, ROW, SectionTitle, SkeletonList, T, Button } from '@/components/ui';

export default function Home() {
  const c = useColors();
  const { all, mine, loading, loadError, retryLoad } = useReports();
  const open = all.filter((r) => r.status === 'open');
  const recent = [...open].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.createdAt - a.createdAt)).slice(0, 5);

  return (
    <TabScreen>
      <Animated.View entering={FadeIn.duration(500)} style={{ flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View style={{ flexDirection: ROW, alignItems: 'center', gap: 10 }}>
          <Image source={require('@/assets/images/logo.png')} style={{ width: 44, height: 44, borderRadius: 12 }} />
          <View>
            <T w="bold" size={20} style={{ lineHeight: 28 }}>
              يأتِ بها
            </T>
            <T size={11} color={c.mutedForeground} style={{ lineHeight: 16 }}>
              رفيقك للمفقودات في الحي والمدينة
            </T>
          </View>
        </View>
        <Press onPress={() => router.push('/search')} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="search" size={20} color={c.primary} />
        </Press>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
        <LinearGradient colors={['#1FA3B8', '#16124A']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
          <View style={[styles.ring, { borderColor: '#F3932566', top: -50, left: -40 }]} />
          <View style={[styles.ring, { borderColor: '#FFFFFF22', width: 120, height: 120, bottom: -30, right: -20 }]} />
          <T w="medium" size={13} color="#CDEEF3">
            لا تقلق، خطوة بخطوة
          </T>
          <T w="bold" size={27} color="#F4FBFC" style={{ lineHeight: 40, marginTop: 2 }}>
            فقدت شيئاً؟ أو وجدت ما ليس لك؟
          </T>
          <T size={14} color="#DDEFF2" style={{ marginTop: 6 }}>
            سجّل التفاصيل، وسنعرض لك بلاغات قد تتطابق معها في مدينتك.
          </T>
          <View style={{ flexDirection: ROW, gap: 10, marginTop: 18 }}>
            <Press testID="cta-lost" onPress={() => router.push({ pathname: '/report/new', params: { type: 'lost' } })} style={[styles.cta, { backgroundColor: '#F4FBFC' }]}>
              <Feather name="help-circle" size={18} color={c.magenta} />
              <T w="bold" size={14} color={c.primary}>
                فقدت شيئاً
              </T>
            </Press>
            <Press testID="cta-found" onPress={() => router.push({ pathname: '/report/new', params: { type: 'found' } })} style={[styles.cta, { backgroundColor: c.orange }]}>
              <Feather name="check-circle" size={18} color={c.accentForeground} />
              <T w="bold" size={14} color={c.accentForeground}>
                وجدت شيئاً
              </T>
            </Press>
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={{ flexDirection: ROW, gap: 10, marginTop: 14 }}>
        {[
          { n: open.filter((r) => !r.demo).length, l: 'بلاغ مفتوح', col: c.turquoise },
          { n: mine.length, l: 'بلاغاتك', col: c.magenta },
          { n: all.filter((r) => !r.demo && r.status === 'returned').length, l: 'مُعاد يدوياً', col: c.success },
        ].map((s) => (
          <View key={s.l} style={[styles.stat, { backgroundColor: c.card, borderColor: c.border }]}>
            <T w="bold" size={24} color={s.col} style={{ lineHeight: 32 }}>
              {s.n.toLocaleString('ar-SA')}
            </T>
            <T size={12} color={c.mutedForeground}>
              {s.l}
            </T>
          </View>
        ))}
      </View>

      <SectionTitle title="تصفّح حسب الفئة" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: ROW }} style={{ marginHorizontal: -20 }}>
        <View style={{ width: 12 }} />
        {CATEGORIES.map((cat) => (
          <Chip key={cat.key} label={cat.label} icon={cat.icon as keyof typeof Feather.glyphMap} onPress={() => router.push({ pathname: '/search', params: { category: cat.key } })} />
        ))}
        <View style={{ width: 12 }} />
      </ScrollView>

      <SectionTitle title="أحدث البلاغات" action="عرض الكل" onAction={() => router.push('/search')} />
      {loadError ? <ErrorBox message={loadError} onRetry={retryLoad} /> : null}
      {loading ? (
        <SkeletonList />
      ) : recent.length === 0 ? (
        <Empty icon="sun" title="الهدوء يعمّ المكان" body="لا توجد بلاغات مفتوحة الآن. كن أول من يسجّل بلاغاً، أو فعّل الأمثلة التوضيحية من الإعدادات." action={<Button label="إنشاء بلاغ" icon="plus" onPress={() => router.push('/report/new')} />} />
      ) : (
        recent.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)
      )}

      <View style={[styles.safety, { backgroundColor: c.orangeSoft }]}>
        <View style={{ flexDirection: ROW, gap: 8, alignItems: 'center' }}>
          <Feather name="shield" size={18} color="#8A4B00" />
          <T w="bold" size={15} color="#5C3200">
            قبل أي تسليم
          </T>
        </View>
        <T size={13} color="#5C3200">
          اطلب من المدّعي وصف تفاصيل لا تظهر في البلاغ، وتحقّق بشكل خاص. سلّم في مكان عام أو لدى جهة مخوّلة كأمن المجمع أو مركز الشرطة، ولا تشارك بياناتك الشخصية علناً.
        </T>
      </View>

      <T size={12} color={c.mutedForeground} center style={{ marginTop: 18 }}>
        البلاغات المشتركة يراها الجميع. «مثال توضيحي» للعرض فقط، والبلاغات القديمة تبقى محلية حتى تختار نشر نسخة.
      </T>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  hero: { borderRadius: 28, padding: 22, overflow: 'hidden' },
  ring: { position: 'absolute', width: 170, height: 170, borderRadius: 999, borderWidth: 18 },
  cta: { flex: 1, flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16 },
  stat: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  safety: { borderRadius: 20, padding: 16, gap: 6, marginTop: 20 },
});
