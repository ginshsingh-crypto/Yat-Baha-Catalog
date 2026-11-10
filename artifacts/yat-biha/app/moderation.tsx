import React, { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useGetCommunityAccount, useListModeration, moderateItem } from '@workspace/api-client-react';
import { TabScreen } from '@/components/Screen';
import { Button, ErrorBox, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

export default function Moderation() {
  const { isSignedIn, userId } = useAuth();
  const c = useColors();
  const account = useGetCommunityAccount({ query: { enabled: !!isSignedIn, queryKey: ['/api/me', userId] } });
  const queue = useListModeration({ query: { enabled: !!account.data?.isModerator, queryKey: ['/api/moderation', userId], refetchInterval: 15000 } });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <TabScreen title="مراجعة المحتوى" subtitle="ارفض معلومات الاتصال والوثائق والتهديدات والدفع. الموافقة على رسالة ليست تحققاً من الهوية.">
    {!account.data?.isModerator ? <T>هذه الصفحة للمشرفين المعتمدين فقط.</T> : null}
    {error || queue.error ? <ErrorBox message={error || 'تعذّر تحميل قائمة المراجعة'} /> : null}
    {queue.data?.length === 0 ? <T>لا محتوى بانتظار المراجعة.</T> : null}
    {queue.data?.map((item) => <View key={item.id} style={{ backgroundColor: c.card, padding: 16, gap: 10, borderRadius: 18, marginVertical: 10 }}>
      <T w="bold">{item.kind === 'abuse' ? 'شكوى إساءة' : 'رسالة خاصة'} · {item.reportTitle}</T>
      <T>{item.text}</T>
      {[true, false].map((approve) => <Button key={String(approve)} loading={busy} variant={approve ? 'primary' : 'ghost'} label={item.kind === 'abuse' ? (approve ? 'قبول الشكوى وإخفاء البلاغ' : 'رفض الشكوى') : (approve ? 'السماح بوصول الرسالة' : 'رفض الرسالة')} onPress={async () => {
        setBusy(true); setError('');
        try { await moderateItem({ id: item.id, kind: item.kind, approve }); await queue.refetch(); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }} />)}
    </View>)}
  </TabScreen>;
}
