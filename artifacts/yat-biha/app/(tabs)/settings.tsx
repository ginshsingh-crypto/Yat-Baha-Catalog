import React, { useState } from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { Alert, Platform, Switch, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { useReports } from '@/context/ReportsContext';
import { TabScreen } from '@/components/Screen';
import { Button, ErrorBox, haptic, ROW, T } from '@/components/ui';
import { useAuth, useClerk } from '@clerk/expo';
import { router } from 'expo-router';
import { useGetCommunityAccount, deleteCommunityAccount } from '@workspace/api-client-react';

function Card({ icon, title, children }: { icon: keyof typeof Feather.glyphMap; title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 16, gap: 8, marginBottom: 14 }}>
      <View style={{ flexDirection: ROW, gap: 10, alignItems: 'center' }}>
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.turquoiseSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={17} color={c.primary} />
        </View>
        <T w="bold" size={16}>
          {title}
        </T>
      </View>
      {children}
    </View>
  );
}

export default function Settings() {
  const c = useColors();
  const { showDemo, setShowDemo, clearAll, mine, saved } = useReports();
  const [err, setErr] = useState<string | null>(null);

  const doClear = async () => {
    try {
      await clearAll();
      haptic.success();
      setErr(null);
    } catch (e) {
      haptic.error();
      setErr((e as Error).message);
    }
  };
  const confirmClear = () => {
    haptic.warn();
    const msg = IS_PREVIEW ? `سيتم حذف ${mine.length} بلاغ تجريبي و${saved.length} عنصر محفوظ، مع المسودات وعمليات البحث المحفوظة وملاحظات الإعادة من هذا الجهاز.` : `سيتم حذف ${mine.filter((r) => r.local).length} بلاغ محلي و${saved.length} عنصر محفوظ، مع المسودات وعمليات البحث المحفوظة وملاحظات الإعادة من هذا الجهاز نهائياً. لن تُحذف البلاغات المشتركة.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doClear();
      return;
    }
    Alert.alert('مسح كل البيانات؟', msg, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'مسح', style: 'destructive', onPress: doClear },
    ]);
  };

  return (
    <TabScreen title="المزيد" subtitle="الإعدادات والخصوصية وعن التطبيق">
      <View style={{ alignItems: 'center', marginBottom: 20, gap: 6 }}>
        <Image source={require('@/assets/images/logo.png')} style={{ width: 88, height: 88, borderRadius: 22 }} />
        <T w="bold" size={20} center>
          يأتِ بها
        </T>
        <T size={12} color={c.mutedForeground} center>
          مجتمع المفقودات والمعثورات
        </T>
      </View>

      {err ? <ErrorBox message={err} /> : null}
      {IS_PREVIEW ? <Card icon="smartphone" title="المعاينة على جهازك">
        <T size={13} color={c.mutedForeground}>جرّب إنشاء البلاغات والصور والبحث والحفظ وتتبع الإعادة. بيانات التجربة محفوظة على هذا الجهاز، ويمكنك مسحها من الزر أدناه.</T>
      </Card> : <CommunityAccount />}


      <Card icon="eye" title="الأمثلة التوضيحية">
        <View style={{ flexDirection: ROW, alignItems: 'center', gap: 12 }}>
          <T size={13} color={c.mutedForeground} style={{ flex: 1 }}>
            عرض ٨ بلاغات تجريبية لتوضيح طريقة الاكتشاف والمطابقة. ليست بلاغات حقيقية.
          </T>
          <Switch
            testID="demo-switch"
            value={showDemo}
            accessibilityLabel="عرض الأمثلة التوضيحية"
            trackColor={{ true: c.turquoise, false: c.muted }}
            onValueChange={(v) => {
              haptic.tap();
              setShowDemo(v).catch((e: Error) => setErr(e.message));
            }}
          />
        </View>
      </Card>

      <Card icon="lock" title="الخصوصية">
        <T size={13} color={c.mutedForeground}>
          {IS_PREVIEW ? 'تُحفظ بلاغات المعاينة وصورها ومحفوظاتها ومسوداتها وعمليات البحث وملاحظات الإعادة في مساحة خاصة بالتجربة على هذا المتصفح أو الجهاز. لا تُرسل إلى مستخدمين آخرين. مسح بيانات المتصفح أو حذف التطبيق قد يمسح التجربة. استخدم بيانات تجريبية، وامسحها من هنا متى شئت.' : 'البلاغات الجديدة وصورها عامة ومحفوظة على الخادم. البريد والهوية لا يظهران للعامة. أدلة الطلب خاصة بمقدم الطلب وصاحب البلاغ؛ يراجع المشرفون الرسائل قبل وصولها وشكاوى الإساءة. القبول ليس توثيق ملكية. البلاغات القديمة والمحـفوظات تبقى على هذا الجهاز. يمكنك حذف بلاغك أو سحب طلبك أو حذف حسابك. لا تكتب أرقام هويات أو هواتف ولا ترفع وثائق أو وجوهاً.'}
        </T>
      </Card>

      <Card icon="shield" title="نصائح السلامة عند التسليم">
        {[
          'تحقّق من الملكية بشكل خاص: اطلب وصف علامات مميزة لا تظهر في البلاغ.',
          'سلّم واستلم في مكان عام مزدحم، أو لدى جهة مخوّلة كأمن المجمع أو مركز الشرطة.',
          'لا تدفع أي مبلغ مقابل استرجاع غرض، ولا تشارك بياناتك البنكية.',
          'المستندات الرسمية تُسلَّم للجهات المختصة مباشرة.',
        ].map((tip) => (
          <View key={tip} style={{ flexDirection: ROW, gap: 8 }}>
            <Feather name="check" size={15} color={c.turquoise} style={{ marginTop: 4 }} />
            <T size={13} color={c.mutedForeground} style={{ flex: 1 }}>
              {tip}
            </T>
          </View>
        ))}
      </Card>

      <Card icon="info" title="عن يأتِ بها">
        <T size={13} color={c.mutedForeground}>
          تطبيق مجتمعي يساعدك على تنظيم بلاغات المفقودات والمعثورات ومقارنتها. المقارنة ترتّب البلاغات من الفئة والمدينة والنوع المعاكس باستخدام اللون والعلامة والوصف والمكان والتاريخ، وتعرض نقاط التشابه والاختلاف. الترتيب تقديري وليس احتمال ملكية أو تأكيداً. تعليم البلاغ كمُعاد تتبّع يدوي منك، ولا يعني التحقق من الملكية. التطبيق غير تابع لأي جهة حكومية ولا يدّعي شراكات رسمية.
        </T>
      </Card>

      <Button label={IS_PREVIEW ? "مسح بيانات التجربة والمحـفوظات" : "مسح البلاغات المحلية والمحـفوظات فقط"} icon="trash-2" variant="ghost" onPress={confirmClear} testID="clear-all" />
    </TabScreen>
  );
}

function CommunityAccount() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const account = useGetCommunityAccount({ query: { enabled: !!isSignedIn, queryKey: ['/api/me', userId] } });
  const deleteAccount = () => {
    const message = 'سيُحذف حسابك وبلاغاتك المشتركة وصورك وطلباتك ورسائلك نهائياً. لا يمكن التراجع. تبقى المسودات المحلية حتى تمسحها.';
    const go = async () => {
      setBusy(true); setErr(null);
      try { await deleteCommunityAccount(); await signOut(); router.replace('/'); }
      catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    };
    if (Platform.OS === 'web') { if (window.confirm(message)) void go(); }
    else Alert.alert('حذف الحساب نهائياً؟', message, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: go }]);
  };

  return <>
    {err ? <ErrorBox message={err} /> : null}
      <Card icon="user" title="حسابك">
        {isSignedIn ? <>
          <Button label="طلبات الملكية والتواصل" onPress={() => router.push('/claims')} />
          {account.data?.isModerator ? <Button label="مراجعة المحتوى" variant="soft" onPress={() => router.push('/moderation')} /> : null}
          <Button label="تسجيل الخروج" variant="ghost" onPress={() => signOut().then(() => router.replace('/')).catch((e) => setErr(e.message))} />
          <Button label="حذف الحساب والبيانات المشتركة نهائياً" variant="ghost" loading={busy} onPress={deleteAccount} testID="delete-account" />
        </> : <Button label="تسجيل الدخول أو إنشاء حساب" onPress={() => router.push('/sign-in')} />}
      </Card>
  </>;
}
