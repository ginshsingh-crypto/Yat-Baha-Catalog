import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, TextInput, View, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { CATEGORIES, CITIES, ReportInput, ReportType } from '@/context/ReportsContext';
import { Button, Chip, ErrorBox, F, haptic, ROW, T } from '@/components/ui';

// Picker URIs are transient cache files; persist an inline data URI instead, capped at ~600 KB.
const MAX_PHOTO_B64 = 800_000;

const today = () => new Date().toISOString().slice(0, 10);
const shift = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Errors = Partial<Record<'title' | 'category' | 'description' | 'city' | 'place' | 'date', string>>;

export function ReportForm({ initial, submitLabel, onSubmit }: { initial: Partial<ReportInput>; submitLabel: string; onSubmit: (v: ReportInput) => Promise<void> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<ReportType>(initial.type ?? 'lost');
  const [title, setTitle] = useState<string>(initial.title ?? '');
  const [category, setCategory] = useState<string>(initial.category ?? '');
  const [description, setDescription] = useState<string>(initial.description ?? '');
  const [city, setCity] = useState<string>(initial.city ?? '');
  const [place, setPlace] = useState<string>(initial.place ?? '');
  const [date, setDate] = useState<string>(initial.date ?? today());
  const [photoUri, setPhotoUri] = useState<string | undefined>(initial.photoUri);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  const validate = (): Errors => {
    const e: Errors = {};
    if (title.trim().length < 3) e.title = 'اكتب عنواناً من ٣ أحرف على الأقل';
    if (!category) e.category = 'اختر الفئة';
    if (description.trim().length < 10) e.description = 'صف الغرض بـ ١٠ أحرف على الأقل';
    if (city.trim().length < 2) e.city = 'اختر المدينة أو اكتبها';
    if (place.trim().length < 3) e.place = 'اذكر المكان العام التقريبي';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(+new Date(date))) e.date = 'التاريخ بصيغة 2025-01-31';
    else if (date > today()) e.date = 'لا يمكن أن يكون التاريخ في المستقبل';
    if (/\d{9,}/.test(description.replace(/\s/g, ''))) e.description = 'يبدو أن الوصف يحوي رقماً طويلاً. لا تكتب أرقام هواتف أو هويات.';
    return e;
  };

  const pick = async (camera: boolean) => {
    setPhotoMsg(null);
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        haptic.warn();
        if (!perm.canAskAgain && Platform.OS !== 'web') {
          Alert.alert('الإذن مرفوض', camera ? 'فعّل إذن الكاميرا من إعدادات الجهاز لالتقاط صورة.' : 'فعّل إذن الصور من إعدادات الجهاز لاختيار صورة.', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'فتح الإعدادات', onPress: () => Linking.openSettings().catch(() => {}) },
          ]);
        } else setPhotoMsg(camera ? 'لم يُمنح إذن الكاميرا. الصورة اختيارية ويمكنك المتابعة بدونها.' : 'لم يُمنح إذن الصور. الصورة اختيارية.');
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, allowsEditing: true, aspect: [4, 3], base64: true };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        if (!a.base64) {
          haptic.error();
          setPhotoMsg('تعذّر تجهيز الصورة للحفظ على الجهاز. جرّب صورة أخرى.');
          return;
        }
        if (a.base64.length > MAX_PHOTO_B64) {
          haptic.error();
          setPhotoMsg(`الصورة كبيرة جداً (${Math.round((a.base64.length * 0.75) / 1024)} ك.ب). الحد الأقصى ${Math.round((MAX_PHOTO_B64 * 0.75) / 1024)} ك.ب، جرّب قصّها أو اختيار صورة أصغر.`);
          return;
        }
        const mime = a.mimeType && a.mimeType.startsWith('image/') ? a.mimeType : 'image/jpeg';
        setPhotoUri(`data:${mime};base64,${a.base64}`);
        haptic.success();
      }
    } catch {
      setPhotoMsg(camera ? 'الكاميرا غير متاحة على هذا الجهاز. جرّب اختيار صورة من المعرض.' : 'تعذّر فتح المعرض.');
    }
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      haptic.error();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({ type, title: title.trim(), category, description: description.trim(), city: city.trim(), place: place.trim(), date, photoUri });
      haptic.success();
    } catch (err) {
      haptic.error();
      setSaveError((err as Error).message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const input = (err?: string) => ({ backgroundColor: c.card, borderWidth: 1.5, borderColor: err ? c.destructive : c.input, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, fontFamily: F.regular, fontSize: 15, color: c.foreground, textAlign: 'right' as const, writingDirection: 'rtl' as const });
  const lost = type === 'lost';

  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" bottomOffset={20}>
      <View style={{ flexDirection: ROW, backgroundColor: c.muted, borderRadius: 18, padding: 4 }}>
        {(['lost', 'found'] as ReportType[]).map((t) => (
          <Pressable
            key={t}
            testID={`type-${t}`}
            onPress={() => {
              haptic.tap();
              setType(t);
            }}
            style={{ flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: type === t ? (t === 'lost' ? c.magenta : c.turquoise) : 'transparent', alignItems: 'center' }}
          >
            <T w="bold" size={14} color={type === t ? '#FFFFFF' : c.mutedForeground}>
              {t === 'lost' ? 'فقدت شيئاً' : 'وجدت شيئاً'}
            </T>
          </Pressable>
        ))}
      </View>
      <Animated.View key={type} entering={FadeIn.duration(250)}>
        <T size={13} color={c.mutedForeground} style={{ marginTop: 10 }}>
          {lost ? 'صف غرضك بوضوح، واحتفظ بتفصيلة مميزة لنفسك لتثبت بها ملكيتك لاحقاً.' : 'اذكر ما يكفي للتعرّف عليه، وأخفِ التفاصيل الدقيقة ليصفها صاحبه الحقيقي.'}
        </T>
      </Animated.View>

      <Field label="العنوان" error={errors.title}>
        <TextInput testID="f-title" value={title} onChangeText={setTitle} placeholder={lost ? 'مثال: محفظة جلدية سوداء' : 'مثال: مفاتيح مع ميدالية'} placeholderTextColor={c.mutedForeground} style={input(errors.title)} maxLength={60} />
      </Field>

      <Field label="الفئة" error={errors.category}>
        <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((x) => (
            <Chip key={x.key} label={x.label} icon={x.icon as keyof typeof Feather.glyphMap} active={category === x.key} onPress={() => setCategory(x.key)} />
          ))}
        </View>
      </Field>

      <Field label="الوصف" error={errors.description} hint={`${description.length}/400`}>
        <TextInput testID="f-desc" value={description} onChangeText={setDescription} multiline maxLength={400} placeholder="اللون، الحجم، العلامة التجارية، الحالة…" placeholderTextColor={c.mutedForeground} style={[input(errors.description), { minHeight: 110, textAlignVertical: 'top' }]} />
      </Field>

      <Field label="المدينة" error={errors.city}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 8 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, flexDirection: ROW }}>
          {CITIES.map((x) => (
            <Chip key={x} label={x} active={city === x} onPress={() => setCity(x)} />
          ))}
        </ScrollView>
        <TextInput testID="f-city" value={city} onChangeText={setCity} placeholder="أو اكتب اسم المدينة" placeholderTextColor={c.mutedForeground} style={input(errors.city)} />
      </Field>

      <Field label="المكان العام" error={errors.place} hint="مكان عام فقط، لا عنوان منزل">
        <TextInput testID="f-place" value={place} onChangeText={setPlace} placeholder="مثال: حديقة الحي - البوابة الشمالية" placeholderTextColor={c.mutedForeground} style={input(errors.place)} maxLength={80} />
      </Field>

      <Field label={lost ? 'تاريخ الفقدان' : 'تاريخ العثور'} error={errors.date}>
        <View style={{ flexDirection: ROW, gap: 8, marginBottom: 8 }}>
          <Chip label="اليوم" active={date === today()} onPress={() => setDate(today())} />
          <Chip label="أمس" active={date === shift(1)} onPress={() => setDate(shift(1))} />
          <Chip label="قبل يومين" active={date === shift(2)} onPress={() => setDate(shift(2))} />
        </View>
        <TextInput testID="f-date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.mutedForeground} style={input(errors.date)} keyboardType="numbers-and-punctuation" maxLength={10} />
      </Field>

      <Field label="صورة (اختياري)">
        {photoUri ? (
          <Animated.View entering={FadeInDown} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <Image source={{ uri: photoUri }} style={{ width: '100%', aspectRatio: 4 / 3 }} contentFit="cover" />
            <Pressable onPress={() => setPhotoUri(undefined)} style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#16124ACC', borderRadius: 999, padding: 8 }} hitSlop={8}>
              <Feather name="x" size={18} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: ROW, gap: 10, marginTop: photoUri ? 10 : 0 }}>
          {Platform.OS !== 'web' ? <Button label="الكاميرا" icon="camera" variant="soft" onPress={() => pick(true)} style={{ flex: 1 }} /> : null}
          <Button label="المعرض" icon="image" variant="soft" onPress={() => pick(false)} style={{ flex: 1 }} />
        </View>
        {photoMsg ? (
          <T size={12} color={c.magenta} style={{ marginTop: 6 }}>
            {photoMsg}
          </T>
        ) : null}
        <T size={12} color={c.mutedForeground} style={{ marginTop: 6 }}>
          تجنّب تصوير بطاقات الهوية أو الأرقام الظاهرة.
        </T>
      </Field>

      {saveError ? (
        <View style={{ marginTop: 18 }}>
          <ErrorBox message={saveError} />
        </View>
      ) : null}
      {Object.keys(errors).length ? (
        <T size={13} color={c.destructive} style={{ marginTop: 14 }}>
          راجع الحقول المعلّمة بالأحمر.
        </T>
      ) : null}
      <Button testID="submit" label={submitLabel} icon="check" onPress={submit} loading={saving} style={{ marginTop: 20 }} />
      <T size={12} color={c.mutedForeground} center style={{ marginTop: 10 }}>
        يُحفظ على هذا الجهاز فقط، ولن يُنشر أو يُرسل لأي أحد.
      </T>
    </KeyboardAwareScrollViewCompat>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: ROW, justifyContent: 'space-between', marginBottom: 8 }}>
        <T w="semibold" size={14}>
          {label}
        </T>
        {hint ? (
          <T size={12} color={c.mutedForeground}>
            {hint}
          </T>
        ) : null}
      </View>
      {children}
      {error ? (
        <Animated.View entering={FadeInDown.duration(200)}>
          <T size={12} color={c.destructive} style={{ marginTop: 6 }}>
            {error}
          </T>
        </Animated.View>
      ) : null}
    </View>
  );
}
