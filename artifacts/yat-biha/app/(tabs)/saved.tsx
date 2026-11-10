import React from 'react';
import { router } from 'expo-router';
import { useReports, Report } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Button, Empty, ReportCard, SkeletonList } from '@/components/ui';

export default function Saved() {
  const { saved, getReport, loading, showDemo } = useReports();
  const list = saved.map((id) => getReport(id)).filter((r): r is Report => !!r && (showDemo || !r.demo));
  return (
    <TabScreen title="المحفوظات" subtitle="بلاغات تريد العودة إليها لاحقاً">
      {loading ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        <Empty icon="bookmark" title="لا شيء محفوظ بعد" body="اضغط على علامة الحفظ في أي بلاغ يشبه غرضك، لتجده هنا بسرعة." action={<Button label="تصفّح البلاغات" icon="search" variant="soft" onPress={() => router.push('/search')} />} />
      ) : (
        list.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)
      )}
    </TabScreen>
  );
}
