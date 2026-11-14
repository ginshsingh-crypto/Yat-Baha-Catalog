import React from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { router, useLocalSearchParams } from 'expo-router';
import { ReportForm } from '@/components/ReportForm';
import { useReports, ReportType } from '@/context/ReportsContext';
import { useAuth } from '@clerk/expo';
import { Empty, Button } from '@/components/ui';

export default function NewReport() {
  return IS_PREVIEW ? <NewReportForm /> : <CommunityNewReport />;
}

function CommunityNewReport() {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return <Empty icon="lock" title="سجّل الدخول لنشر بلاغ" body="سيظهر البلاغ وصورته للمجتمع. لا تشارك بيانات حساسة." action={<Button label="تسجيل الدخول" onPress={() => router.push('/sign-in')} />} />;
  return <NewReportForm />;
}

function NewReportForm() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { createReport } = useReports();
  const initialType: ReportType = type === 'found' ? 'found' : 'lost';

  return (
    <ReportForm
      initial={{ type: initialType }}
      localOnly={IS_PREVIEW}
      submitLabel={IS_PREVIEW ? 'حفظ البلاغ على جهازك' : 'نشر البلاغ للمجتمع'}
      onSubmit={async (v) => {
        const r = await createReport(v);
        router.replace(`/report/${r.id}`);
      }}
    />
  );
}
