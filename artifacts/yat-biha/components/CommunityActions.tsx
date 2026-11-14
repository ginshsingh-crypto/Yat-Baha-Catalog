import React, { useState } from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { TextInput, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { createClaim, reportAbuse } from '@workspace/api-client-react';
import { Report } from '@/context/ReportsContext';
import { useColors } from '@/hooks/useColors';
import { T, Button, ErrorBox, F } from './ui';

export function CommunityActions({ report }: { report: Report }) {
  if (IS_PREVIEW || report.demo || report.local) return null;
  return <SharedReportActions report={report} />;
}

function SharedReportActions({ report }: { report: Report }) {
  const c = useColors();
  const { isSignedIn } = useAuth();
  const [mode, setMode] = useState<'claim' | 'abuse' | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  if (report.demo || report.local) return null;
  return <View style={{ gap: 10, marginTop: 20 }}>
    {report.hidden ? <ErrorBox message="أُخفي البلاغ بعد مراجعة شكوى. لن يظهر في البحث العام." /> : null}
    {!report.isOwner && report.status === 'open' ? <Button testID="claim-open" label={report.type === 'found' ? 'قد يكون هذا غرضي' : 'لدي معلومات عن الغرض'} variant="soft" onPress={() => { if (!isSignedIn) router.push('/sign-in'); else { setMode('claim'); setSent(''); } }} /> : null}
    <Button label="إبلاغ عن إساءة" variant="ghost" testID="abuse-open" onPress={() => { if (!isSignedIn) router.push('/sign-in'); else { setMode('abuse'); setSent(''); } }} />
    {mode ? <>
      <T size={13}>{mode === 'claim' ? 'صف علامة مميزة أو معلومات عن الغرض. هذا الطلب خاص بك وبصاحب البلاغ، وليس إثبات هوية. لا ترسل وثائق أو أرقام اتصال.' : 'اشرح سبب البلاغ عن الإساءة. يراه المشرفون فقط، ولا نكشف هويتك لصاحب البلاغ.'}</T>
      <TextInput testID="private-description" accessibilityLabel="وصف خاص" value={text} onChangeText={setText} maxLength={500} multiline placeholder="اكتب هنا" placeholderTextColor={c.mutedForeground} style={{ color: c.foreground, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 100, fontFamily: F.regular, textAlign: 'right' }} />
      <Button testID="private-submit" label="إرسال الطلب" loading={busy} onPress={async () => {
        setBusy(true); setErr('');
        try {
          if (mode === 'claim') await createClaim({ reportId: report.id, evidence: text.trim() });
          else await reportAbuse(report.id, { reason: text.trim() });
          setSent(mode === 'claim' ? 'أُرسل الطلب الخاص. تابع حالته من طلبات الملكية.' : 'أُرسلت الشكوى للمراجعة.');
          setMode(null); setText('');
        } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }} />
      <Button label="إلغاء" variant="ghost" onPress={() => setMode(null)} />
    </> : null}
    {err ? <ErrorBox message={err} /> : null}
    {sent ? <T color={c.success}>{sent}</T> : null}
    {isSignedIn ? <Button label="طلبات الملكية والتواصل" variant="ghost" onPress={() => router.push('/claims')} /> : null}
  </View>;
}
