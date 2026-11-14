import React, { useEffect, useState } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet, Text, TextProps, View, ViewStyle, StyleProp, PressableProps } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Report, categoryOf, useReports } from '@/context/ReportsContext';

// Layout direction helpers: render Arabic RTL regardless of device locale.
export const ROW = (I18nManager.isRTL ? 'row' : 'row-reverse') as 'row' | 'row-reverse';
export const START = (I18nManager.isRTL ? 'flex-start' : 'flex-end') as 'flex-start' | 'flex-end';

export const F = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
};

export const haptic = {
  tap: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  impact: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TProps = TextProps & { w?: keyof typeof F; size?: number; color?: string; center?: boolean };
export function T({ w = 'regular', size = 15, color, center, style, ...rest }: TProps) {
  const c = useColors();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: F[w], fontSize: size, lineHeight: Math.round(size * 1.6), color: color ?? c.foreground, textAlign: center ? 'center' : 'right', writingDirection: 'rtl' },
        style,
      ]}
    />
  );
}

type PressProps = {
  onPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode;
  disabled?: boolean; testID?: string; haptics?: boolean;
  accessibilityLabel?: string; accessibilityHint?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityState?: PressableProps['accessibilityState'];
};
export function Press({ onPress, style, children, disabled, testID, haptics = true,
  accessibilityLabel, accessibilityHint, accessibilityRole = 'button', accessibilityState }: PressProps) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      style={[a, style, disabled && { opacity: 0.45 }]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPressIn={() => { if (!reduced) s.value = withSpring(0.98, { damping: 22, stiffness: 400 }); }}
      onPressOut={() => { if (!reduced) s.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
      onPress={() => { if (haptics) haptic.tap(); onPress?.(); }}
    >{children}</AnimatedPressable>
  );
}

export function Button({ label, icon, onPress, variant = 'primary', loading, disabled, testID, style }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'soft'; loading?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const map = {
    primary: [c.primary, c.primaryForeground],
    accent: [c.orange, c.accentForeground],
    ghost: ['transparent', c.foreground],
    danger: [c.destructive, c.destructiveForeground],
    soft: [c.secondary, c.secondaryForeground],
  } as const;
  const [bg, fg] = map[variant];
  return (
    <Press accessibilityLabel={loading ? 'جارٍ الحفظ' : label} testID={testID} onPress={onPress} disabled={disabled || loading} style={[{ backgroundColor: bg, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18, flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: c.border }, style]}>
      {loading ? <Pulse color={fg} /> : icon ? <Feather name={icon} size={18} color={fg} /> : null}
      <T w="semibold" size={15} color={fg}>
        {loading ? 'جارٍ الحفظ…' : label}
      </T>
    </Press>
  );
}

function Pulse({ color }: { color: string }) {
  const o = useSharedValue(0.3);
  const reduced = useReducedMotion();
  useEffect(() => {
    o.value = reduced ? 1 : withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [o, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }, a]} />;
}

export function Chip({ label, active, onPress, icon, tone }: { label: string; active?: boolean; onPress: () => void; icon?: keyof typeof Feather.glyphMap; tone?: string }) {
  const c = useColors();
  const bg = active ? tone ?? c.primary : c.card;
  return (
    <Press accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', flexDirection: ROW, alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: active ? bg : c.border }}>
      {icon ? <Feather name={icon} size={14} color={active ? c.primaryForeground : c.mutedForeground} /> : null}
      <T w="medium" size={13} color={active ? c.primaryForeground : c.foreground}>
        {label}
      </T>
    </Press>
  );
}

export function TypeBadge({ type, small }: { type: 'lost' | 'found'; small?: boolean }) {
  const c = useColors();
  const lost = type === 'lost';
  return (
    <View style={{ flexDirection: ROW, alignItems: 'center', gap: 5, paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 2 : 4, borderRadius: 999, backgroundColor: lost ? c.magentaSoft : c.turquoiseSoft }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: lost ? c.magenta : c.turquoise }} />
      <T w="semibold" size={small ? 11 : 12} color={lost ? c.magenta : '#0E6F7E'}>
        {lost ? 'مفقود' : 'معثور عليه'}
      </T>
    </View>
  );
}

export function DemoTag() {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: c.orangeSoft }}>
      <T w="semibold" size={11} color="#8A4B00">
        مثال توضيحي
      </T>
    </View>
  );
}

export function Thumb({ report, size = 76 }: { report: Report; size?: number }) {
  const c = useColors();
  const cat = categoryOf(report.category);
  const lost = report.type === 'lost';
  if (report.photoUri) return <Image source={{ uri: report.photoUri }} style={{ width: size, height: size, borderRadius: 16 }} contentFit="cover" transition={200} />;
  return (
    <View style={{ width: size, height: size, borderRadius: 16, backgroundColor: lost ? c.magentaSoft : c.turquoiseSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: size * 1.1, height: size * 1.1, borderRadius: size, borderWidth: 10, borderColor: lost ? '#9C1F5E14' : '#1FA3B81F', top: -size * 0.4, left: -size * 0.4 }} />
      <Feather name={cat.icon as keyof typeof Feather.glyphMap} size={size * 0.36} color={lost ? c.magenta : '#0E6F7E'} />
    </View>
  );
}

export const relDate = (iso: string) => {
  const now = new Date();
  const localToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((localToday - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'قبل يومين';
  if (days <= 10) return `قبل ${days.toLocaleString('ar-SA')} أيام`;
  return iso;
};

export function ReportCard({ report, index = 0 }: { report: Report; index?: number }) {
  const c = useColors();
  const { saved, toggleSaved } = useReports();
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const reduced = useReducedMotion();
  const isSaved = saved.includes(report.id);
  const returned = report.status === 'returned';
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 5) * 30).duration(240)} style={{ marginBottom: 12 }}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, marginBottom: 0 }]}>
        <Press testID={`card-${report.id}`} accessibilityLabel={`${report.title}، ${report.city}، ${report.type === 'lost' ? 'مفقود' : 'معثور عليه'}`} onPress={() => router.push(`/report/${report.id}`)} style={{ flex: 1, minWidth: 0, flexDirection: ROW, gap: 14, alignItems: 'center' }}>
          <Thumb report={report} size={72} />
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <View style={{ flexDirection: ROW, gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <TypeBadge type={report.type} small />
              {report.demo ? <DemoTag /> : null}
              {returned ? <T size={11} w="semibold" color={c.success}>تمت الإعادة</T> : null}
            </View>
            <T w="semibold" size={16} numberOfLines={2}>{report.title}</T>
            <View style={{ flexDirection: ROW, alignItems: 'center', gap: 4 }}>
              <Feather name="map-pin" size={12} color={c.mutedForeground} />
              <T size={12} color={c.mutedForeground} numberOfLines={1} style={{ flexShrink: 1 }}>{report.city} · {relDate(report.date)}</T>
            </View>
            {report.local ? <T size={10} color={c.mutedForeground}>على جهازك</T> : null}
          </View>
        </Press>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? `إلغاء حفظ ${report.title}` : `حفظ ${report.title}`}
          accessibilityState={{ selected: isSaved, disabled: saving }}
          disabled={saving}
          testID={`save-${report.id}`}
          onPress={async () => {
            setSaving(true); setSaveError(false); haptic.tap();
            try { await toggleSaved(report.id); } catch { setSaveError(true); haptic.error(); }
            finally { setSaving(false); }
          }}
          style={{ alignSelf: 'flex-start', width: 44, height: 44, borderRadius: 14, backgroundColor: isSaved ? c.orangeSoft : c.background, alignItems: 'center', justifyContent: 'center' }}
        ><Feather name="bookmark" size={19} color={isSaved ? '#985508' : c.mutedForeground} /></Pressable>
      </View>
      {saveError ? <T accessibilityRole="alert" size={12} color={c.destructive}>تعذّر تحديث المحفوظات. حاول مجدداً.</T> : null}
    </Animated.View>
  );
}

export function Empty({ icon, title, body, action }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; action?: React.ReactNode }) {
  const c = useColors();
  const y = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    y.value = reduced ? 0 : withRepeat(withTiming(-4, { duration: 2000 }), -1, true);
  }, [y, reduced]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 28, gap: 10 }}>
      <Animated.View style={[{ width: 92, height: 92, borderRadius: 46, backgroundColor: c.turquoiseSoft, alignItems: 'center', justifyContent: 'center' }, a]}>
        <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }} />
        <Feather name={icon} size={36} color={c.primary} />
      </Animated.View>
      <T w="bold" size={18} center style={{ marginTop: 14 }}>
        {title}
      </T>
      <T size={14} color={c.mutedForeground} center>
        {body}
      </T>
      {action ? <View style={{ marginTop: 8, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function SkeletonList() {
  const c = useColors();
  const o = useSharedValue(0.5);
  const reduced = useReducedMotion();
  useEffect(() => {
    o.value = reduced ? 1 : withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ gap: 12 }, a]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: c.muted, borderColor: c.muted, height: 104 }]} />
      ))}
    </Animated.View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.magentaSoft, borderRadius: 16, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: ROW, gap: 8, alignItems: 'center' }}>
        <Feather name="alert-triangle" size={18} color={c.destructive} />
        <T w="semibold" color={c.destructive} style={{ flex: 1 }}>
          {message}
        </T>
      </View>
      {onRetry ? <Button label="إعادة المحاولة" icon="refresh-cw" variant="danger" onPress={onRetry} /> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12 }}>
      <T w="bold" size={19}>
        {title}
      </T>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={{ minHeight: 44, justifyContent: 'center' }} hitSlop={4}>
          <T w="semibold" size={13} color={c.turquoise}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: ROW, gap: 14, padding: 14, borderRadius: 22, borderWidth: 1, alignItems: 'center', marginBottom: 12 },
});
