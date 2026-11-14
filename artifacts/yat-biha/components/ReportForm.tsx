import React, { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_PREVIEW } from '@/config/runtime';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PhotoAssist } from '@/components/PhotoAssist';
import { useColors } from '@/hooks/useColors';
import { useCaptureDraft } from '@/hooks/useCaptureDraft';
import { CATEGORIES, CITIES, categoryOf, ReportInput, ReportType } from '@/context/ReportsContext';
import { Button, Chip, ErrorBox, F, haptic, ROW, T } from '@/components/ui';
import { CAPTURE_COLORS, CaptureErrors, categorySuggestion, fillCaptureSuggestion, latinDigits, localDate, validateCapture, withColor } from '@/utils/reportCapture';

const MAX_PHOTO_B64 = 800_000;
const STEPS = ['الغرض', 'المكان والوقت', 'المراجعة'];
const STEP_FIELDS = [['title', 'category', 'description'], ['city', 'place', 'date']] as const;

export function ReportForm({ initial, submitLabel, onSubmit, localOnly = false, draftId = 'new' }: {
  initial: Partial<ReportInput>;
  submitLabel: string;
  onSubmit: (value: ReportInput) => Promise<void>;
  localOnly?: boolean;
  draftId?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState<ReportInput>(() => ({
    type: initial.type ?? 'lost', title: initial.title ?? '', category: initial.category ?? '',
    description: initial.description ?? '', city: initial.city ?? '', place: initial.place ?? '',
    date: initial.date ?? localDate(), photoUri: initial.photoUri,
  }));
  const [step, setStep] = useState(0);
  const [scrollReset, setScrollReset] = useState(0);
  const [errors, setErrors] = useState<CaptureErrors>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [allCities, setAllCities] = useState(false);
  const draft = useCaptureDraft(draftId, value, step);
  const lost = value.type === 'lost';
  const suggested = useMemo(() => categorySuggestion(`${value.title} ${value.description}`), [value.title, value.description]);

  function update<Key extends keyof ReportInput>(key: Key, next: ReportInput[Key]) {
    setValue((previous) => ({ ...previous, [key]: next }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setReviewed(false);
    if (key === 'description') setColorError(null);
  }

  function chooseColor(color: string) {
    try { update('description', withColor(value.description, color)); }
    catch (error) { setColorError(error instanceof Error ? error.message : 'تعذّر إضافة اللون دون تغيير نص الوصف.'); haptic.error(); }
  }

  function goTo(next: number) {
    setSaveError(null);
    if (next > step) {
      const checked = validateCapture(value);
      const relevant = STEP_FIELDS.slice(0, next).flat();
      const active: CaptureErrors = {};
      for (const field of relevant) if (checked[field]) active[field] = checked[field];
      setErrors(active);
      if (Object.keys(active).length) { haptic.error(); setScrollReset((current) => current + 1); return; }
    }
    haptic.tap();
    setStep(next);
  }

  async function pick(camera: boolean) {
    setPhotoMsg(null);
    setPhotoBusy(true);
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain && Platform.OS !== 'web') {
          Alert.alert('الإذن غير متاح', 'يمكنك تفعيل الإذن من إعدادات الجهاز، أو المتابعة بدون صورة.', [
            { text: 'متابعة بدون صورة', style: 'cancel' },
            { text: 'فتح الإعدادات', onPress: () => { void Linking.openSettings().catch(() => {}); } },
          ]);
        } else setPhotoMsg('الصورة اختيارية. يمكنك المتابعة بدون منح الإذن.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, allowsEditing: true, aspect: [4, 3], base64: true, exif: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) { setPhotoMsg('تعذّر تجهيز الصورة. اختر صورة أخرى أو تابع بدون صورة.'); return; }
      if (asset.base64.length > MAX_PHOTO_B64) {
        setPhotoMsg('الصورة أكبر من ٦٠٠ ك.ب تقريباً. قصّها حول الغرض أو اختر صورة أصغر للحفاظ على مساحة جهازك.');
        return;
      }
      const mime = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
      update('photoUri', `data:${mime};base64,${asset.base64}`);
      haptic.success();
    } catch {
      setPhotoMsg(camera ? 'تعذّر فتح الكاميرا. يمكنك اختيار صورة من المعرض.' : 'تعذّر فتح المعرض. حاول مرة أخرى أو تابع بدون صورة.');
    } finally { setPhotoBusy(false); }
  }

  async function submit() {
    if (submitting.current) return;
    const checked = validateCapture(value);
    setErrors(checked);
    if (Object.keys(checked).length) {
      setStep(STEP_FIELDS[0].some((field) => checked[field]) ? 0 : 1);
      haptic.error(); return;
    }
    if (!reviewed) { setSaveError('أكد مراجعة النص والصورة قبل الحفظ.'); return; }
    submitting.current = true;
    setSaving(true); setSaveError(null);
    try {
      await onSubmit({ ...value, title: value.title.trim(), description: value.description.trim(), city: value.city.trim(), place: value.place.trim() });
      await draft.finish();
      haptic.success();
    } catch (error) {
      haptic.error(); setSaveError(error instanceof Error ? error.message : 'تعذّر الحفظ. مسودتك ما زالت على جهازك.');
    } finally { submitting.current = false; setSaving(false); }
  }

  const input = (error?: string) => ({ backgroundColor: c.card, borderWidth: 1, borderColor: error ? c.destructive : c.input, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontFamily: F.regular, fontSize: 16, color: c.foreground, textAlign: 'right' as const, writingDirection: 'rtl' as const });
  const card = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 24, padding: 20, gap: 4 };
  const local = IS_PREVIEW || localOnly;

  if (!draft.ready) return <View style={{ padding: 28, backgroundColor: c.background, flex: 1 }}><T color={c.mutedForeground}>نجهّز مساحة بلاغك…</T></View>;

  if (draft.existing && !draft.resolved) return (
    <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center', padding: 24 }}>
      <View style={[card, { gap: 14 }]}>
        <View style={{ alignSelf: 'flex-end', width: 56, height: 56, borderRadius: 18, backgroundColor: c.turquoiseSoft, alignItems: 'center', justifyContent: 'center' }}><Feather name="edit-3" size={25} color={c.turquoise} /></View>
        <T w="bold" size={26}>نكمّل من حيث توقّفت؟</T>
        <T color={c.mutedForeground}>لديك مسودة محفوظة على هذا الجهاز. لم تُنشر بعد.</T>
        <View style={{ backgroundColor: c.background, borderRadius: 14, padding: 14 }}><T w="semibold">{draft.existing.value.title || 'بلاغ بدون عنوان'}</T><T size={12} color={c.mutedForeground}>الخطوة {draft.existing.step + 1} من ٣ · {new Date(draft.existing.savedAt).toLocaleDateString('ar-SA')}</T></View>
        <Button testID="draft-restore" label="متابعة المسودة" icon="arrow-left" onPress={() => { const saved = draft.existing!; setValue(saved.value); setStep(saved.step); draft.restore(); }} />
        <Button testID="draft-discard" label="بدء بلاغ جديد" variant="ghost" onPress={() => { void draft.discard().catch(() => setSaveError('تعذّر حذف المسودة القديمة. حاول مجدداً.')); }} />
        {saveError ? <ErrorBox message={saveError} /> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: ROW, alignItems: 'center', gap: 8 }}>
          {STEPS.map((label, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`الخطوة ${index + 1}: ${label}`} accessibilityState={{ selected: step === index, disabled: index > step }} disabled={index > step || saving} onPress={() => goTo(index)} style={{ flex: 1, flexDirection: ROW, alignItems: 'center', gap: 6, minHeight: 44 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: index <= step ? c.primary : c.muted, alignItems: 'center', justifyContent: 'center' }}>
              {index < step ? <Feather name="check" size={13} color={c.primaryForeground} /> : <T size={12} w="bold" center color={index === step ? c.primaryForeground : c.mutedForeground}>{index + 1}</T>}
            </View>
            <T size={12} w={index === step ? 'bold' : 'regular'} color={index <= step ? c.foreground : c.mutedForeground} numberOfLines={1} style={{ flexShrink: 1 }}>{label}</T>
          </Pressable>)}
        </View>
        <View style={{ flexDirection: ROW, gap: 5, marginTop: 4 }}>{STEPS.map((_, index) => <View key={index} style={{ height: 3, flex: 1, borderRadius: 3, backgroundColor: index <= step ? c.turquoise : c.muted }} />)}</View>
        <T size={11} color={draft.status === 'error' ? c.destructive : c.mutedForeground} style={{ marginTop: 7 }} accessibilityLiveRegion="polite">
          {draft.hydrationError ? 'الحفظ التلقائي متوقف لحماية مسودتك القديمة.' : draft.status === 'error' ? 'تعذّر حفظ المسودة تلقائياً. أبقِ هذه الصفحة مفتوحة حتى الحفظ.' : draft.status === 'saving' ? 'نحفظ مسودتك…' : draft.status === 'saved' ? 'المسودة محفوظة على جهازك' : 'ثلاث خطوات بسيطة · الصورة اختيارية'}
        </T>
      </View>

      <KeyboardAwareScrollViewCompat key={`${step}-${scrollReset}`} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 18 }} keyboardShouldPersistTaps="handled" bottomOffset={22}>
        {draft.hydrationError ? <View testID="draft-read-error" style={{ backgroundColor: c.orangeSoft, borderRadius: 18, padding: 16, gap: 10 }}>
          <T w="semibold" size={14} color="#684018">{draft.hydrationError === 'corrupt' ? 'تعذّر فتح المسودة المحفوظة' : 'تعذّرت قراءة المسودة من الجهاز'}</T>
          <T size={12} color="#684018">يمكنك متابعة الكتابة، لكن لن نستبدل المسودة القديمة تلقائياً. أعد المحاولة، أو اختر حذفها والبدء بهذه المسودة. لا تغلق الصفحة قبل حفظ بياناتك الجديدة.</T>
          <Button testID="draft-retry" label={draft.hydrating ? 'جارٍ إعادة القراءة…' : 'إعادة قراءة المسودة'} icon="refresh-cw" variant="soft" disabled={draft.hydrating} onPress={() => { void draft.retryHydration(); }} />
          <Button testID="draft-replace-unread" label="حذف المسودة القديمة والمتابعة" variant="ghost" disabled={draft.hydrating} onPress={() => { void draft.discard().catch(() => setSaveError('تعذّر حذف المسودة القديمة. أعد المحاولة قبل إغلاق الصفحة.')); }} />
        </View> : null}
        <View style={{ gap: 3 }}>
          <T w="bold" size={28}>{step === 0 ? 'كل غرض له حكاية.' : step === 1 ? 'من أين نبدأ البحث؟' : 'جاهز لخطوة أقرب.'}</T>
          <T size={14} color={c.mutedForeground}>{step === 0 ? 'صورة واضحة ووصف بسيط يساعدان على العثور على التطابق.' : step === 1 ? 'مكان تقريبي وتاريخ صحيح يجعلان المقارنة أدق.' : local ? 'هذه هي التفاصيل التي ستُحفظ في تجربة جهازك.' : 'راجع ما سيراه الآخرون قبل نشر بلاغك.'}</T>
        </View>

        {step === 0 ? <>
          <View style={{ flexDirection: ROW, backgroundColor: c.muted, borderRadius: 17, padding: 4 }}>
            {(['lost', 'found'] as ReportType[]).map((type) => <Pressable key={type} testID={`type-${type}`} accessibilityRole="radio" accessibilityState={{ selected: value.type === type }} accessibilityLabel={type === 'lost' ? 'فقدت شيئاً' : 'وجدت شيئاً'} onPress={() => update('type', type)} style={{ flex: 1, flexDirection: ROW, justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 13, backgroundColor: value.type === type ? c.card : 'transparent' }}><Feather name={type === 'lost' ? 'search' : 'check-circle'} size={18} color={value.type === type ? c.primary : c.mutedForeground} /><T w="semibold" size={14} color={value.type === type ? c.primary : c.mutedForeground}>{type === 'lost' ? 'فقدت شيئاً' : 'وجدت شيئاً'}</T></Pressable>)}
          </View>

          <View style={[card, { padding: 16 }]}>
            {value.photoUri ? <View style={{ borderRadius: 17, overflow: 'hidden', marginBottom: 12 }}><Image source={{ uri: value.photoUri }} style={{ width: '100%', height: 210 }} contentFit="cover" accessibilityLabel="الصورة المختارة للبلاغ" /><Pressable testID="remove-photo" accessibilityRole="button" accessibilityLabel="إزالة الصورة" onPress={() => update('photoUri', undefined)} style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#141B2DCC', borderRadius: 22, padding: 12 }}><Feather name="x" size={18} color="#FFFFFF" /></Pressable></View> : <View style={{ alignItems: 'center', paddingVertical: 18, gap: 7 }}><View style={{ backgroundColor: c.turquoiseSoft, borderRadius: 20, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}><Feather name="camera" size={27} color={c.turquoise} /></View><T w="semibold" size={16}>ابدأ بصورة إن أمكن</T><T size={12} center color={c.mutedForeground}>الغرض فقط. أخفِ الأسماء والأرقام والوجوه.</T></View>}
            <View style={{ flexDirection: ROW, gap: 8 }}>
              <Button testID="choose-photo" label={value.photoUri ? 'تغيير الصورة' : 'إضافة صورة'} icon="image" variant="soft" onPress={() => { void pick(false); }} disabled={photoBusy} style={{ flex: 1 }} />
              {Platform.OS !== 'web' ? <Button label="تصوير" icon="camera" variant="ghost" onPress={() => { void pick(true); }} disabled={photoBusy} style={{ flex: 1 }} /> : null}
            </View>
            {photoMsg ? <T size={12} color={c.destructive} accessibilityLiveRegion="polite" style={{ marginTop: 8 }}>{photoMsg}</T> : null}
            {!localOnly ? <PhotoAssist photoUri={value.photoUri} canFill={!value.title.trim() || !value.category.trim() || !value.description.trim()} onApply={(suggestion) => { setValue((previous) => fillCaptureSuggestion(previous, suggestion)); setReviewed(false); setErrors({}); }} /> : null}
          </View>

          <View style={card}>
            <Field label="ما الغرض؟" error={errors.title}>
              <TextInput testID="f-title" accessibilityLabel="عنوان البلاغ" value={value.title} onChangeText={(text) => update('title', text)} placeholder="مثال: محفظة جلدية سوداء" placeholderTextColor={c.mutedForeground} style={input(errors.title)} maxLength={60} />
            </Field>
            {suggested && suggested !== value.category ? <Pressable testID="category-suggestion" accessibilityRole="button" accessibilityLabel={`استخدام الفئة المقترحة ${categoryOf(suggested).label}`} onPress={() => update('category', suggested)} style={{ marginTop: 10, flexDirection: ROW, alignItems: 'center', gap: 7, backgroundColor: c.turquoiseSoft, borderRadius: 12, padding: 12 }}><Feather name="zap" size={15} color={c.turquoise} /><T size={12} style={{ flex: 1 }}>من كلماتك، نقترح: {categoryOf(suggested).label}</T><Feather name="plus" size={16} color={c.turquoise} /></Pressable> : null}
            <Field label="الفئة" error={errors.category}>
              <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 7 }}>{CATEGORIES.map((item) => <Chip key={item.key} label={item.label} icon={item.icon as keyof typeof Feather.glyphMap} active={value.category === item.key} onPress={() => update('category', item.key)} />)}</View>
            </Field>
            <Field label="اللون" hint="اختياري · يُضاف إلى الوصف" error={colorError ?? undefined}>
              <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 9 }}>{CAPTURE_COLORS.map((color) => { const selected = value.description.split(/\r?\n/).includes(`اللون: ${color.label}.`); return <Pressable key={color.label} accessibilityRole="button" accessibilityLabel={`لون ${color.label}`} accessibilityState={{ selected }} onPress={() => chooseColor(color.label)} style={{ minWidth: 52, minHeight: 60, alignItems: 'center', gap: 4 }}><View style={{ width: 29, height: 29, borderRadius: 15, backgroundColor: color.value, borderWidth: selected ? 3 : 1, borderColor: selected ? c.turquoise : c.border }}>{selected ? <Feather name="check" size={16} color={color.label === 'أبيض' ? c.primary : '#FFFFFF'} style={{ alignSelf: 'center', marginTop: 3 }} /> : null}</View><T size={11}>{color.label}</T></Pressable>; })}</View>
            </Field>
            <Field label="وصف يساعد على التعرّف" error={errors.description} hint={`${value.description.length}/400`}>
              <TextInput testID="f-desc" accessibilityLabel="وصف الغرض" value={value.description} onChangeText={(text) => update('description', text)} multiline maxLength={400} placeholder="الحجم، العلامة التجارية، المادة والحالة العامة…" placeholderTextColor={c.mutedForeground} style={[input(errors.description), { minHeight: 120, textAlignVertical: 'top' }]} />
            </Field>
            <View style={{ flexDirection: ROW, alignItems: 'flex-start', gap: 8, marginTop: 14 }}><Feather name="lock" size={16} color={c.turquoise} style={{ marginTop: 3 }} /><T size={12} color={c.mutedForeground} style={{ flex: 1 }}>{lost ? 'احتفظ بتفصيلة لا تظهر هنا لتثبت ملكيتك لاحقاً، مثل محتويات الغرض أو علامة مخفية.' : 'لا تكشف كل التفاصيل. اترك علامة مميزة ليصفها المالك الحقيقي في طلب الملكية.'}</T></View>
          </View>
        </> : null}

        {step === 1 ? <View style={card}>
          <Field label="المدينة" error={errors.city}>
            <TextInput testID="f-city" accessibilityLabel="المدينة" value={value.city} onChangeText={(text) => update('city', text)} placeholder="اكتب مدينتك أو اخترها" placeholderTextColor={c.mutedForeground} style={input(errors.city)} maxLength={50} />
            <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 7, marginTop: 10 }}>{(allCities ? CITIES : CITIES.slice(0, 4)).map((city) => <Chip key={city} label={city} active={value.city === city} onPress={() => update('city', city)} />)}<Chip label={allCities ? 'مدن أقل' : 'كل المدن'} icon={allCities ? 'minus' : 'plus'} onPress={() => setAllCities(!allCities)} /></View>
          </Field>
          <Field label={lost ? 'آخر مكان تتذكّره' : 'مكان العثور'} error={errors.place} hint="تقريبي وعام">
            <TextInput testID="f-place" accessibilityLabel="المكان العام" value={value.place} onChangeText={(text) => update('place', text)} placeholder="مثال: حديقة الملك عبدالله، قرب المدخل" placeholderTextColor={c.mutedForeground} style={input(errors.place)} maxLength={80} />
            <T size={12} color={c.mutedForeground} style={{ marginTop: 7 }}>لا نحتاج موقعك الدقيق أو عنوان منزلك.</T>
          </Field>
          <Field label={lost ? 'متى فقدته؟' : 'متى وجدته؟'} error={errors.date}>
            <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>{['اليوم', 'أمس', 'قبل يومين'].map((label, index) => <Chip key={label} label={label} active={value.date === localDate(index)} onPress={() => update('date', localDate(index))} />)}</View>
            <TextInput testID="f-date" accessibilityLabel={lost ? 'تاريخ الفقدان بصيغة سنة شهر يوم' : 'تاريخ العثور بصيغة سنة شهر يوم'} value={value.date} onChangeText={(text) => update('date', latinDigits(text))} placeholder="YYYY-MM-DD" placeholderTextColor={c.mutedForeground} style={[input(errors.date), { textAlign: 'left', writingDirection: 'ltr' }]} keyboardType="numbers-and-punctuation" maxLength={10} />
          </Field>
          <View style={{ marginTop: 20, flexDirection: ROW, gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.turquoiseSoft }}><Feather name="compass" size={20} color={c.turquoise} /><T size={13} style={{ flex: 1 }}>نستخدم المكان والتوقيت مع وصف الغرض لترتيب اقتراحات المقارنة. الاقتراح لا يثبت الملكية.</T></View>
        </View> : null}

        {step === 2 ? <>
          <View style={[card, { gap: 12 }]}>
            <View style={{ flexDirection: ROW, gap: 14, alignItems: 'center' }}>
              {value.photoUri ? <Image source={{ uri: value.photoUri }} style={{ width: 86, height: 86, borderRadius: 18 }} contentFit="cover" accessibilityLabel="معاينة صورة البلاغ" /> : <View style={{ width: 74, height: 74, borderRadius: 18, backgroundColor: c.turquoiseSoft, alignItems: 'center', justifyContent: 'center' }}><Feather name={categoryOf(value.category).icon as keyof typeof Feather.glyphMap} size={30} color={c.turquoise} /></View>}
              <View style={{ flex: 1, gap: 3 }}><T size={12} color={lost ? c.magenta : c.turquoise}>{lost ? 'بلاغ فقدان' : 'بلاغ عثور'} · {categoryOf(value.category).label}</T><T w="bold" size={21}>{value.title}</T></View>
            </View>
            <T size={14} color={c.mutedForeground}>{value.description}</T>
            <Button label="تعديل وصف الغرض" icon="edit-3" variant="ghost" onPress={() => goTo(0)} />
          </View>
          <View style={[card, { gap: 10 }]}>
            <ReviewRow icon="map-pin" label="المدينة والمكان" value={`${value.city} · ${value.place}`} />
            <ReviewRow icon="calendar" label={lost ? 'تاريخ الفقدان' : 'تاريخ العثور'} value={value.date} />
            <Button label="تعديل المكان والتاريخ" icon="edit-3" variant="ghost" onPress={() => goTo(1)} />
          </View>
          <View style={{ backgroundColor: c.orangeSoft, padding: 18, borderRadius: 20, gap: 8 }}><View style={{ flexDirection: ROW, gap: 8 }}><Feather name="shield" size={20} color="#8A4B00" /><T w="bold" size={15} color="#684018">تفصيلتك الخاصة تبقى معك</T></View><T size={13} color="#684018">لا تضع رقم الهوية أو الهاتف أو محتويات الغرض كاملة. عند ظهور مرشح مناسب، قارن التفاصيل الخاصة قبل أي تسليم.</T></View>
          <Pressable testID="review-confirm" accessibilityRole="checkbox" accessibilityState={{ checked: reviewed }} accessibilityLabel="راجعت النص والصورة ولا يحتويان على بيانات شخصية أو تفاصيل إثبات الملكية" onPress={() => { setReviewed(!reviewed); setSaveError(null); }} style={{ flexDirection: ROW, alignItems: 'flex-start', gap: 11, paddingVertical: 10 }}>
            <View style={{ width: 25, height: 25, borderRadius: 7, borderWidth: 1.5, borderColor: reviewed ? c.turquoise : c.input, backgroundColor: reviewed ? c.turquoise : c.card, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>{reviewed ? <Feather name="check" size={17} color="#FFFFFF" /> : null}</View>
            <T size={13} style={{ flex: 1 }}>راجعت النص والصورة، وأخفيت البيانات الشخصية وتفاصيل إثبات الملكية.</T>
          </Pressable>
          <T size={12} center color={c.mutedForeground}>{IS_PREVIEW ? 'نسخة للمعاينة: يُحفظ بلاغك وصورته على هذا الجهاز فقط. لن يصلا إلى مستخدمين آخرين.' : localOnly ? 'هذا البلاغ محفوظ على جهازك فقط حتى تختار نشر نسخة منه.' : 'بعد النشر تصبح هذه التفاصيل والصورة مرئية للمجتمع. يمكنك تعديل البلاغ أو حذفه من بلاغاتي.'}</T>
        </> : null}
        {saveError ? <ErrorBox message={saveError} /> : null}
        {Object.values(errors).some(Boolean) ? <T size={13} color={c.destructive} accessibilityLiveRegion="polite">أكمل الحقول المعلّمة قبل المتابعة.</T> : null}
      </KeyboardAwareScrollViewCompat>

      <View style={{ backgroundColor: c.card, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderColor: c.border, flexDirection: ROW, gap: 10 }}>
        <Button testID={step === 2 ? 'submit' : 'capture-next'} label={step === 2 ? submitLabel : step === 0 ? 'المكان والوقت' : 'مراجعة البلاغ'} icon={step === 2 ? 'check' : 'arrow-left'} onPress={step === 2 ? () => { void submit(); } : () => goTo(step + 1)} loading={saving} disabled={photoBusy} style={{ flex: 1 }} />
        {step > 0 ? <Button testID="capture-back" label="السابق" variant="ghost" onPress={() => goTo(step - 1)} disabled={saving} /> : null}
      </View>
    </View>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const c = useColors();
  return <View style={{ marginTop: 14 }}><View style={{ flexDirection: ROW, justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 9 }}><T w="semibold" size={14}>{label}</T>{hint ? <T size={11} color={c.mutedForeground} style={{ flexShrink: 1 }}>{hint}</T> : null}</View>{children}{error ? <T size={12} color={c.destructive} style={{ marginTop: 6 }} accessibilityLiveRegion="polite">{error}</T> : null}</View>;
}

function ReviewRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  const c = useColors();
  return <View style={{ flexDirection: ROW, alignItems: 'center', gap: 10 }}><Feather name={icon} size={20} color={c.turquoise} /><View style={{ flex: 1 }}><T size={11} color={c.mutedForeground}>{label}</T><T w="medium" size={14}>{value}</T></View></View>;
}
