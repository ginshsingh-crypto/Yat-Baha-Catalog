import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ROW, T, haptic } from '@/components/ui';

const ITEMS = [
  { name: 'index', label: 'الرئيسية', icon: 'home' },
  { name: 'search', label: 'اكتشف', icon: 'search' },
  { name: 'mine', label: 'بلاغاتي', icon: 'inbox' },
  { name: 'saved', label: 'المحفوظات', icon: 'bookmark' },
  { name: 'settings', label: 'المزيد', icon: 'more-horizontal' },
] as const;

/** Explicit Arabic visual order on every device, independent of system locale. */
export default function TabLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false }} tabBar={({ state, emitter, navigateToTab }) => (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border, paddingTop: 8, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 14 : 8), paddingHorizontal: 8, flexDirection: ROW }}>
      {ITEMS.map(item => {
        const route = state.routes.find(r => r.name === item.name);
        if (!route) return null;
        const active = state.routes[state.index].key === route.key;
        return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }} testID={`tab-${item.name}`} onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) { haptic.tap(); navigateToTab(route.key); }
        }} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16, backgroundColor: active ? c.turquoiseSoft : 'transparent' }}>
          <Feather name={item.icon} size={21} color={active ? c.turquoise : c.mutedForeground} />
          <T size={11} w={active ? 'bold' : 'medium'} color={active ? c.turquoise : c.mutedForeground} center>{item.label}</T>
        </Pressable>;
      })}
    </View>
  )}>
    {ITEMS.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />)}
  </Tabs>;
}
