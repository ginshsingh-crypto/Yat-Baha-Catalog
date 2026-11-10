import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ReportForm } from '@/components/ReportForm';
import { useReports } from '@/context/ReportsContext';
import { Empty } from '@/components/ui';

export default function EditReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getReport, updateReport } = useReports();
  const r = getReport(id);
  if (!r || r.demo) return <Empty icon="alert-circle" title="لا يمكن التعديل" body="هذا البلاغ غير موجود أو أنه مثال توضيحي." />;
  return (
    <ReportForm
      initial={r}
      submitLabel="حفظ التعديلات"
      onSubmit={async (v) => {
        await updateReport(r.id, v);
        router.back();
      }}
    />
  );
}
