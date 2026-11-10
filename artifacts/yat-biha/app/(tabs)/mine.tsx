import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Button, Chip, Empty, ErrorBox, ReportCard, ROW, SkeletonList } from '@/components/ui';

export default function Mine() {
  const c = useColors();
  const { mine, loading, loadError, retryLoad } = useReports();
  const [tab, setTab] = useState<'open' | 'returned'>('open');
  const list = mine.filter((r) => r.status === tab);
  return (
    <TabScreen title="بلاغاتي" subtitle="بلاغات حسابك المشتركة، والبلاغات القديمة المعلّمة على جهازك فقط">
      <View style={{ flexDirection: ROW, gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Chip label={`مفتوحة (${mine.filter((r) => r.status === 'open').length})`} active={tab === 'open'} onPress={() => setTab('open')} />
        <Chip label={`أُعيدت (${mine.filter((r) => r.status === 'returned').length})`} active={tab === 'returned'} tone={c.success} onPress={() => setTab('returned')} />
      </View>
      {mine.length > 0 ? <Button label="بلاغ جديد" icon="plus" variant="accent" onPress={() => router.push('/report/new')} style={{ marginBottom: 16 }} testID="mine-new" /> : null}
      {loadError ? <ErrorBox message={loadError} onRetry={retryLoad} /> : null}
      {loading ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        tab === 'open' ? (
          <Empty icon="inbox" title="لا بلاغات مفتوحة" body="عندما تسجّل شيئاً فقدته أو وجدته، سيظهر هنا لتتابعه وتعدّله أو تعلّمه كمُعاد." action={<Button label="سجّل أول بلاغ" icon="plus" onPress={() => router.push('/report/new')} />} />
        ) : (
          <Empty icon="award" title="لم يُعد شيء بعد" body="حين يعود الغرض لصاحبه، علّم البلاغ كمُعاد من صفحة التفاصيل. التتبّع يدوي ولا يتحقق من الملكية تلقائياً." />
        )
      ) : (
        list.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)
      )}
    </TabScreen>
  );
}
