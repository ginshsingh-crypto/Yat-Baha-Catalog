import React, { useEffect } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet, Text, TextProps, View, ViewStyle, StyleProp } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
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

export function Press({ onPress, style, children, disabled, testID, haptics = true }: { onPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean; testID?: string; haptics?: boolean }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPressIn={() => (s.value = withSpring(0.965, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      onPress={() => {
        if (haptics) haptic.tap();
        onPress?.();
      }}
    >
      <Animated.View style={[a, style, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
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
    <Press testID={testID} onPress={onPress} disabled={disabled || loading} style={[{ backgroundColor: bg, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18, flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: c.border }, style]}>
      {loading ? <Pulse color={fg} /> : icon ? <Feather name={icon} size={18} color={fg} /> : null}
      <T w="semibold" size={15} color={fg}>
        {loading ? 'جارٍ الحفظ…' : label}
      </T>
    </Press>
  );
}

function Pulse({ color }: { color: string }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }, a]} />;
}

export function Chip({ label, active, onPress, icon, tone }: { label: string; active?: boolean; onPress: () => void; icon?: keyof typeof Feather.glyphMap; tone?: string }) {
  const c = useColors();
  const bg = active ? tone ?? c.primary : c.card;
  return (
    <Press onPress={onPress} style={{ flexDirection: ROW, alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: active ? bg : c.border }}>
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
  const days = Math.round((+new Date(new Date().toISOString().slice(0, 10)) - +new Date(iso)) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'قبل يومين';
  if (days <= 10) return `قبل ${days} أيام`;
  return iso;
};

export function ReportCard({ report, index = 0 }: { report: Report; index?: number }) {
  const c = useColors();
  const { saved, toggleSaved } = useReports();
  const isSaved = saved.includes(report.id);
  const returned = report.status === 'returned';
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).springify().damping(18)}>
      <Press testID={`card-${report.id}`} onPress={() => router.push(`/report/${report.id}`)} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, returned && { opacity: 0.72 }]}>
        <Thumb report={report} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: ROW, gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeBadge type={report.type} small />
            {report.demo ? <DemoTag /> : null}
            {returned ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: c.successSoft }}>
                <T w="semibold" size={11} color={c.success}>
                  أُعيد
                </T>
              </View>
            ) : null}
          </View>
          <T w="bold" size={16} numberOfLines={1}>
            {report.title}
          </T>
          <View style={{ flexDirection: ROW, alignItems: 'center', gap: 4 }}>
            <Feather name="map-pin" size={12} color={c.mutedForeground} />
            <T size={12} color={c.mutedForeground} numberOfLines={1} style={{ flexShrink: 1 }}>
              {report.city} · {relDate(report.date)}
            </T>
          </View>
        </View>
        <Pressable
          hitSlop={12}
          testID={`save-${report.id}`}
          onPress={() => {
            haptic.impact();
            toggleSaved(report.id).catch(() => { haptic.error(); });
          }}
          style={{ alignSelf: 'flex-start', padding: 4 }}
        >
          <Feather name="bookmark" size={20} color={isSaved ? c.orange : c.mutedForeground} style={isSaved ? { opacity: 1 } : { opacity: 0.6 }} />
        </Pressable>
      </Press>
    </Animated.View>
  );
}

export function Empty({ icon, title, body, action }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; action?: React.ReactNode }) {
  const c = useColors();
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-6, { duration: 1600 }), -1, true);
  }, [y]);
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
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o]);
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
        <Pressable onPress={onAction} hitSlop={10}>
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
