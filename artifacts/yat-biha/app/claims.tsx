import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { useListClaims, useListMessages, decideClaim, withdrawClaim, sendMessage, type Claim } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { TabScreen } from '@/components/Screen';
import { Button, T, ErrorBox, F } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function ClaimsScreen() {
  const { isSignedIn, userId } = useAuth();
  const query = useListClaims({ query: { enabled: !!isSignedIn, queryKey: ['/api/claims', userId], refetchInterval: 15000 } });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return <TabScreen title="طلبات الملكية" subtitle="القبول قرار صاحب البلاغ وليس تحققاً رسمياً. الرسائل لا تصل إلا بعد مراجعة مشرف.">
    {query.isLoading ? <T>جارٍ التحميل…</T> : null}
    {query.error ? <ErrorBox message="تعذّر تحميل الطلبات" onRetry={() => query.refetch()} /> : null}
    {query.data?.length === 0 ? <T>لا توجد طلبات بعد. افتح بلاغاً لإرسال طلب خاص.</T> : null}
    {query.data?.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}
  </TabScreen>;
}
function ClaimCard({ claim }: { claim: Claim }) {
  const c = useColors();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const messages = useListMessages(claim.id, { query: { enabled: open, queryKey: ['/api/claims', userId, claim.id, 'messages'], refetchInterval: 15000 } });
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await qc.invalidateQueries({ queryKey: ['/api/claims'] }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <View style={{ marginVertical: 12, padding: 16, borderRadius: 20, backgroundColor: c.card, gap: 10 }}>
    <T w="bold">{claim.reportTitle}</T>
    <T size={13}>{claim.incoming ? 'طلب وارد' : 'طلب أرسلته'} · {({ pending: 'بانتظار صاحب البلاغ', accepted: 'مقبول للتواصل — غير موثق', rejected: 'مرفوض / التواصل مغلق' })[claim.status]}</T>
    <T>{claim.evidence}</T>
    {claim.incoming ? <>
      {claim.status === 'pending' ? <Button label="قبول للتواصل" loading={busy} onPress={() => run(() => decideClaim(claim.id, { status: 'accepted' }))} /> : null}
      {claim.status !== 'rejected' ? <Button label={claim.status === 'accepted' ? 'إيقاف التواصل ورفض الطلب' : 'رفض الطلب'} variant="ghost" loading={busy} onPress={() => run(() => decideClaim(claim.id, { status: 'rejected' }))} /> : null}
    </> : <Button label="سحب الطلب وحذف أدلته ورسائله" variant="ghost" loading={busy} onPress={() => run(() => withdrawClaim(claim.id))} />}
    <Button label={open ? 'إغلاق الرسائل' : 'عرض الرسائل'} variant="soft" onPress={() => setOpen(!open)} />
    {open ? <>
      {messages.isLoading ? <T>جارٍ تحميل الرسائل…</T> : null}
      {messages.error ? <ErrorBox message="تعذّر تحميل الرسائل" onRetry={() => messages.refetch()} /> : null}
      {messages.data?.map((m) => <View key={m.id} style={{ padding: 10, borderRadius: 10, backgroundColor: m.mine ? c.turquoiseSoft : c.secondary }}>
        <T size={12}>{m.mine ? 'أنت' : 'الطرف الآخر'} · {({ pending: 'بانتظار المشرف — لم تصل بعد', approved: 'سمح المشرف بعرضها', rejected: 'رفضها المشرف — لم تصل' })[m.status]}</T>
        <T size={14}>{m.body}</T>
      </View>)}
      {claim.status === 'accepted' ? <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" bottomOffset={30}>
        <T size={12}>اتفق على مكان عام فقط. ممنوع أرقام التواصل أو الروابط أو الدفع. لا يوجد وقت مضمون للمراجعة.</T>
        <TextInput accessibilityLabel="رسالة للمراجعة" testID="message-input" value={text} onChangeText={setText} multiline maxLength={500} placeholder="رسالة للمراجعة" placeholderTextColor={c.mutedForeground} style={{ fontFamily: F.regular, color: c.foreground, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12, minHeight: 80, textAlign: 'right' }} />
        <Button label="إرسال للمراجعة" loading={busy} onPress={() => run(async () => { await sendMessage(claim.id, { body: text.trim() }); setText(''); })} />
      </KeyboardAwareScrollViewCompat> : null}
    </> : null}
    {error ? <ErrorBox message={error} /> : null}
  </View>;
}
