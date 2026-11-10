import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ReportForm } from '@/components/ReportForm';
import { useReports, ReportType } from '@/context/ReportsContext';

export default function NewReport() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { createReport } = useReports();
  const initialType: ReportType = type === 'found' ? 'found' : 'lost';
  return (
    <ReportForm
      initial={{ type: initialType }}
      submitLabel="حفظ البلاغ"
      onSubmit={async (v) => {
        const r = await createReport(v);
        router.replace(`/report/${r.id}`);
      }}
    />
  );
}
