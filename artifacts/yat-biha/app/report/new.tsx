import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ReportForm } from '@/components/ReportForm';
import { useReports, ReportType } from '@/context/ReportsContext';
import { useAuth } from '@clerk/expo';
import { Empty, Button } from '@/components/ui';

export default function NewReport() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { createReport } = useReports();
  const { isSignedIn } = useAuth();
  const initialType: ReportType = type === 'found' ? 'found' : 'lost';
  if (!isSignedIn) return <Empty icon="lock" title="سجّل الدخول لنشر بلاغ" body="سيظهر البلاغ وصورته للمجتمع. لا تشارك بيانات حساسة." action={<Button label="تسجيل الدخول" onPress={() => router.push('/sign-in')} />} />;
  return (
    <ReportForm
      initial={{ type: initialType }}
      submitLabel="نشر البلاغ للمجتمع"
      onSubmit={async (v) => {
        const r = await createReport(v);
        router.replace(`/report/${r.id}`);
      }}
    />
  );
}
