import React, { useState } from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { categoryOf, findMatches, useReports } from '@/context/ReportsContext';
import { Button, DemoTag, Empty, ErrorBox, haptic, ReportCard, ROW, T, Thumb, TypeBadge, relDate } from '@/components/ui';
import { CommunityActions } from '@/components/CommunityActions';

export default function ReportDetails() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getReport, all, saved, toggleSaved, updateReport, deleteReport, loading, publishLocal } = useReports();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const r = getReport(id);

  if (!r) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: '' }} />
        {loading ? null : <Empty icon="file-minus" title="البلاغ غير موجود" body="ربما حُذف من هذا الجهاز." action={<Button label="العودة" variant="soft" onPress={() => router.back()} />} />}
      </View>
    );
  }

  const cat = categoryOf(r.category);
  const matches = findMatches(r, all);
  const isSaved = saved.includes(r.id);
  const own = !!r.isOwner;
  const lost = r.type === 'lost';

  const run = async (fn: () => Promise<void>, ok?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      haptic.success();
      ok?.();
    } catch (e) {
      haptic.error();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = () => {
    const next = r.status === 'open' ? 'returned' : 'open';
    run(() => updateReport(r.id, { status: next }));
  };

  const confirmDelete = () => {
    haptic.warn();
    const go = () =>
      deleteReport(r.id)
        .then(() => {
          haptic.success();
          router.replace('/mine');
        })
        .catch((e: Error) => {
          // Report may already be gone from state (partial cleanup), so surface outside the screen body.
          haptic.error();
          if (Platform.OS === 'web') window.alert(e.message);
          else Alert.alert('تنبيه', e.message);
          if (!getReport(r.id)) router.replace('/mine');
          else setErr(e.message);
        });
    if (Platform.OS === 'web') {
      if (window.confirm(r.local ? 'حذف هذا البلاغ المحلي نهائياً؟' : 'حذف البلاغ المشترك وصورته وطلباته ورسائله نهائياً للجميع؟')) go();
      return;
    }
    Alert.alert('حذف البلاغ؟', r.local ? 'سيُحذف البلاغ المحلي نهائياً.' : 'سيُحذف البلاغ المشترك وصورته وطلباته ورسائله نهائياً للجميع.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
      <Stack.Screen
        options={{
          title: lost ? 'بلاغ فقدان' : 'بلاغ عثور',
          headerRight: () => (
            <Feather
              name="bookmark"
              size={22}
              color={isSaved ? c.orange : c.primary}
              onPress={() => {
                haptic.impact();
                toggleSaved(r.id).catch((e: Error) => setErr(e.message));
              }}
              testID="detail-save"
            />
          ),
        }}
      />
      <Animated.View entering={FadeInDown.springify().damping(18)}>
        {r.photoUri ? <Image source={{ uri: r.photoUri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 26 }} contentFit="cover" transition={250} /> : <View style={{ alignItems: 'center', paddingVertical: 8 }}><Thumb report={r} size={140} /></View>}
      </Animated.View>

      <View style={{ flexDirection: ROW, gap: 8, marginTop: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <TypeBadge type={r.type} />
        {r.demo ? <DemoTag /> : null}
        {r.status === 'returned' ? (
          <Animated.View entering={ZoomIn} style={{ flexDirection: ROW, gap: 4, alignItems: 'center', backgroundColor: c.successSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Feather name="check" size={12} color={c.success} />
            <T w="semibold" size={12} color={c.success}>
              عاد لصاحبه
            </T>
          </Animated.View>
        ) : null}
      </View>
      <T w="bold" size={26} style={{ marginTop: 8, lineHeight: 40 }}>
        {r.title}
      </T>

      <View style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 16, marginTop: 14, gap: 12 }}>
        <Row icon={cat.icon as keyof typeof Feather.glyphMap} label="الفئة" value={cat.label} />
        <Row icon="map" label="المدينة" value={r.city} />
        <Row icon="map-pin" label="المكان" value={r.place} />
        <Row icon="calendar" label={lost ? 'تاريخ الفقدان' : 'تاريخ العثور'} value={`${r.date} · ${relDate(r.date)}`} />
      </View>

      <T w="semibold" size={14} color={c.mutedForeground} style={{ marginTop: 18 }}>
        الوصف
      </T>
      <T size={15} style={{ marginTop: 4 }}>
        {r.description}
      </T>

      {r.demo ? (
        <View style={{ backgroundColor: c.orangeSoft, borderRadius: 18, padding: 14, marginTop: 16 }}>
          <T size={13} color="#5C3200">
            هذا بلاغ توضيحي لعرض طريقة عمل التطبيق، ولا يمثّل غرضاً حقيقياً. لا توجد وسيلة تواصل داخل التطبيق.
          </T>
        </View>
      ) : null}
      {r.local && publishLocal ? <View style={{ marginTop: 16, gap: 10 }}>
        <T size={13}>بلاغ قديم على هذا الجهاز فقط. نشر نسخة يجعله وصورته مرئيين للجميع، ولا يحذف الأصل المحلي.</T>
        <Button label="نشر نسخة للمجتمع" loading={busy} onPress={() => run(async () => { const published = await publishLocal!(r.id); router.replace(`/report/${published.id}`); })} />
      </View> : null}
      {IS_PREVIEW && r.local ? <T size={13} color={c.mutedForeground} style={{ marginTop: 16 }}>بلاغ تجريبي محفوظ على هذا الجهاز فقط.</T> : null}
      <CommunityActions report={r} />

      {err ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={err} />
        </View>
      ) : null}

      {own ? (
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button testID="toggle-status" label={r.status === 'open' ? 'علّم كمُعاد لصاحبه' : 'إعادة فتح البلاغ'} icon={r.status === 'open' ? 'check-circle' : 'rotate-ccw'} variant={r.status === 'open' ? 'primary' : 'soft'} onPress={toggleStatus} loading={busy} />
          <View style={{ flexDirection: ROW, gap: 10 }}>
            <Button label="تعديل" icon="edit-2" variant="ghost" onPress={() => router.push(`/report/edit/${r.id}`)} style={{ flex: 1 }} testID="edit" />
            <Button label="حذف" icon="trash-2" variant="ghost" onPress={confirmDelete} style={{ flex: 1 }} testID="delete" />
          </View>
          <T size={12} color={c.mutedForeground} center>
            حالة «مُعاد» تتبّع يدوي منك، ولا تعني تحققاً من الملكية.
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: 28, marginBottom: 10 }}>
        <View style={{ flexDirection: ROW, alignItems: 'center', gap: 8 }}>
          <Feather name="git-merge" size={18} color={c.orange} />
          <T w="bold" size={19}>
            مطابقات محتملة
          </T>
        </View>
        <T size={13} color={c.mutedForeground}>
          بلاغات {lost ? 'عثور' : 'فقدان'} مفتوحة من نفس الفئة والمدينة. هي اقتراحات للمقارنة فقط وليست مؤكدة.
        </T>
      </View>
      {matches.length === 0 ? (
        <Empty icon="radio" title="لا مطابقات حالياً" body={IS_PREVIEW ? "أنشئ بلاغ فقدان وبلاغ عثور من الفئة والمدينة نفسيهما لتجربة المطابقة. تُقارن الأمثلة التوضيحية مع بعضها." : "نقارن البلاغات المشتركة دورياً. الأمثلة والبلاغات المحلية تُقارن في مجموعاتها المنفصلة فقط."} />
      ) : (
        matches.map((m, i) => <ReportCard key={m.id} report={m} index={i} />)
      )}

      <View style={{ backgroundColor: c.turquoiseSoft, borderRadius: 20, padding: 16, gap: 6, marginTop: 12 }}>
        <View style={{ flexDirection: ROW, gap: 8, alignItems: 'center' }}>
          <Feather name="shield" size={17} color={c.primary} />
          <T w="bold" size={15}>
            تحقّق بخصوصية، وسلّم بأمان
          </T>
        </View>
        <T size={13} color={c.mutedForeground}>
          اطلب وصف علامة مميزة لا تظهر هنا قبل أي تسليم. التقِ في مكان عام أو سلّم لجهة مخوّلة، ولا تدفع أي مبلغ.
        </T>
      </View>
    </ScrollView>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: ROW, alignItems: 'center', gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <T size={12} color={c.mutedForeground} style={{ lineHeight: 18 }}>
          {label}
        </T>
        <T w="semibold" size={15}>
          {value}
        </T>
      </View>
    </View>
  );
}
