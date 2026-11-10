import React, { useState } from 'react';
import { TextInput, View, Platform } from 'react-native';
import { useAuth, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { router, Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useColors } from '@/hooks/useColors';
import { Button, T, ErrorBox, F } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();
export default function SignIn() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { signIn, errors: inErrors } = useSignIn();
  const { signUp, errors: upErrors } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message || 'تعذّر تسجيل الدخول. حاول مجدداً.'); }
    finally { setBusy(false); }
  };
  const navigate = ({ session }: { session?: { currentTask?: unknown } | null }) => {
    if (session?.currentTask) { setError('يتطلب الحساب خطوة تحقق إضافية. أكملها لدى مزوّد تسجيل الدخول.'); return; }
    router.replace('/');
  };
  async function submit() {
    if (register) {
      if (!verify) {
        const result = await signUp.password({ emailAddress: email.trim(), password });
        if (result.error) throw new Error(result.error.message);
        await signUp.verifications.sendEmailCode();
        setVerify(true);
      } else {
        const result = await signUp.verifications.verifyEmailCode({ code });
        if (result.error) throw new Error(result.error.message);
        if (signUp.status === 'complete') await signUp.finalize({ navigate });
        else setError('لم يكتمل التحقق. راجع الرمز ومتطلبات الحساب.');
      }
    } else {
      const result = verify ? await signIn.mfa.verifyEmailCode({ code }) : await signIn.password({ emailAddress: email.trim(), password });
      if (result.error) throw new Error(result.error.message);
      if (signIn.status === 'complete') await signIn.finalize({ navigate });
      else if (signIn.status === 'needs_client_trust' && signIn.supportedSecondFactors.some((f) => f.strategy === 'email_code')) {
        await signIn.mfa.sendEmailCode(); setVerify(true);
      } else setError('يلزم تحقق إضافي للحساب. استخدم طريقة تسجيل الدخول الأصلية أو تواصل مع الدعم.');
    }
  }
  if (isSignedIn) return <Redirect href="/" />;
  const input = { backgroundColor: c.card, color: c.foreground, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 14, fontFamily: F.regular };
  const fieldErrors = Object.values((register ? upErrors : inErrors).fields).filter(Boolean).map((e) => e?.message).join('\n');
  return <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" bottomOffset={30} contentContainerStyle={{ padding: 24, gap: 16, paddingTop: Platform.OS === 'web' ? 67 : 24, paddingBottom: insets.bottom + 40 }}>
    <T w="bold" size={26}>{register ? 'انضم إلى يأت بها' : 'مرحباً بعودتك'}</T>
    <T size={14}>تصفّح بحرية، وسجّل الدخول لنشر البلاغات وإرسال طلب خاص. لا نعرض بريدك أو هويتك للعامة.</T>
    {verify ? <TextInput accessibilityLabel="رمز التحقق" placeholder="رمز التحقق بالبريد" placeholderTextColor={c.mutedForeground} value={code} onChangeText={setCode} keyboardType="number-pad" style={input} /> : <>
      <TextInput accessibilityLabel="البريد الإلكتروني" testID="auth-email" placeholder="البريد الإلكتروني" placeholderTextColor={c.mutedForeground} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
      <TextInput accessibilityLabel="كلمة المرور" testID="auth-password" placeholder="كلمة المرور" placeholderTextColor={c.mutedForeground} value={password} onChangeText={setPassword} secureTextEntry style={input} />
    </>}
    {error || fieldErrors ? <ErrorBox message={error || fieldErrors} /> : null}
    <Button label={verify ? 'تأكيد الرمز' : register ? 'إنشاء حساب' : 'تسجيل الدخول'} loading={busy} onPress={() => run(submit)} />
    {verify ? <Button variant="ghost" label="إعادة إرسال الرمز" onPress={() => run(async () => { if (register) await signUp.verifications.sendEmailCode(); else await signIn.mfa.sendEmailCode(); })} /> : <Button label="المتابعة باستخدام Google" variant="soft" onPress={() => run(async () => {
      const result = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri() });
      if (result.createdSessionId && result.setActive) await result.setActive({ session: result.createdSessionId, navigate });
      else setError('لم يكتمل تسجيل الدخول. جرّب البريد الإلكتروني.');
    })} />}
    <Button variant="ghost" label={register ? 'لدي حساب بالفعل' : 'إنشاء حساب جديد'} onPress={() => { setRegister(!register); setVerify(false); setError(''); }} />
    <View nativeID="clerk-captcha" />
  </KeyboardAwareScrollViewCompat>;
}
