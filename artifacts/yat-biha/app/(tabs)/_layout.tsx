import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { F } from '@/components/ui';

const TABS: { name: string; label: string; sf: [SFSymbol, SFSymbol]; icon: keyof typeof Feather.glyphMap }[] = [
  { name: 'index', label: 'الرئيسية', sf: ['house', 'house.fill'], icon: 'home' },
  { name: 'search', label: 'البحث', sf: ['magnifyingglass', 'magnifyingglass'], icon: 'search' },
  { name: 'mine', label: 'بلاغاتي', sf: ['tray', 'tray.fill'], icon: 'inbox' },
  { name: 'saved', label: 'المحفوظات', sf: ['bookmark', 'bookmark.fill'], icon: 'bookmark' },
  { name: 'settings', label: 'المزيد', sf: ['ellipsis.circle', 'ellipsis.circle.fill'], icon: 'more-horizontal' },
];

function NativeTabLayout() {
  return (
    <NativeTabs>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Icon sf={{ default: t.sf[0], selected: t.sf[1] }} />
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarIcon: ({ color, focused }) =>
              isIOS ? <SymbolView name={focused ? t.sf[1] : t.sf[0]} tintColor={color as string} size={24} /> : <Feather name={t.icon} size={22} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
