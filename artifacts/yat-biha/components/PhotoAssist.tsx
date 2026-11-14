import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { IS_PREVIEW } from '@/config/runtime';
import { useColors } from '@/hooks/useColors';
import { categoryOf } from '@/context/ReportsContext';
import { requestPhotoSuggestion, type PhotoSuggestion } from '@/utils/photoAssist';
import { Button, ErrorBox, ROW, T } from './ui';

export function PhotoAssist(props: { photoUri?: string; canFill?: boolean; onApply: (value: PhotoSuggestion) => void }) {
  // Static preview has no service credentials and must never simulate model output.
  if (IS_PREVIEW || !props.photoUri?.startsWith('data:')) return null;
  return <ConnectedPhotoAssist {...props} />;
}

function ConnectedPhotoAssist({ photoUri, canFill = true, onApply }: { photoUri?: string; canFill?: boolean; onApply: (value: PhotoSuggestion) => void }) {
  const c = useColors();
  const { isSignedIn, getToken } = useAuth();
  const [consentOpen, setConsentOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<PhotoSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    setSuggestion(null); setError(''); setConsentOpen(false); setBusy(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [photoUri]);
  async function analyse() {
    if (!photoUri) return;
    const controller = new AbortController();
    active.current?.abort(); active.current = controller;
    setError(''); setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const result = await requestPhotoSuggestion(photoUri, await getToken(), controller.signal);
      if (!controller.signal.aborted) { setSuggestion(result); setConsentOpen(false); }
    } catch (e) {
      if (active.current === controller) setError(controller.signal.aborted ? 'انتهت مهلة الخدمة. يمكنك المتابعة يدوياً.' : (e as Error).message);
    } finally { clearTimeout(timeout); if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <View style={{ backgroundColor: c.secondary, borderRadius: 18, padding: 16, gap: 10 }}>
    <View style={{ flexDirection: ROW, alignItems: 'center', gap: 8 }}><Feather name="aperture" size={18} color={c.turquoise} /><T w="bold">مساعدة اختيارية من الصورة</T></View>
    <T size={12} color={c.mutedForeground}>اقتراح عنوان وفئة ووصف عام من الصورة، مع اللون الظاهر. يملأ الحقول الفارغة فقط ويحافظ على ما كتبته. لا يتحقق من الملكية.</T>
    {!consentOpen && !suggestion ? <Button variant="ghost" label="اقتراح وصف من الصورة" icon="aperture" onPress={() => isSignedIn ? setConsentOpen(true) : router.push('/sign-in')} /> : null}
    {consentOpen ? <>
      <T size={13}>سيُرسل محتوى الصورة إلى خادم التطبيق ثم OpenAI لتحليلها. لا تستخدم صور أشخاص أو هويات أو بطاقات أو بيانات خاصة. يمكنك إكمال الوصف دون إرسال الصورة للتحليل.</T>
      <T size={12} color={c.mutedForeground}>لا يخزن التطبيق صورة التحليل في هذا المسار. تخضع معالجة المزوّد لسياسة الخصوصية المنشورة للخدمة.</T>
      <Button label={busy ? 'جارٍ تحليل الصورة…' : 'أوافق، حلّل الصورة'} disabled={busy} onPress={analyse} />
      <Button variant="ghost" label="المتابعة يدوياً" disabled={busy} onPress={() => setConsentOpen(false)} />
    </> : null}
    {error ? <ErrorBox message={error} /> : null}
    {suggestion ? <>
      <T w="semibold">اقتراح قابل للخطأ — راجعه أولاً</T>
      <T selectable>{suggestion.title}{suggestion.color ? ` · ${suggestion.color}` : ''}</T>
      <T size={12}>الفئة المقترحة: {categoryOf(suggestion.category).label}</T>
      <T size={13} selectable>{suggestion.description}</T>
      <T size={12} color={c.mutedForeground}>{canFill ? 'لن نستبدل عنوانك أو فئتك أو وصفك الحالي. راجع أي حقول نملؤها قبل النشر.' : 'حقولك مكتملة؛ لن نغيّرها. يمكنك الرجوع للاقتراح وتعديل نصك يدوياً.'}</T>
      <Button label="ملء الحقول الفارغة فقط" icon="check" disabled={!canFill} onPress={() => { onApply(suggestion); setSuggestion(null); }} />
      <Button variant="ghost" label="تجاهل الاقتراح" onPress={() => setSuggestion(null)} />
    </> : null}
  </View>;
}
