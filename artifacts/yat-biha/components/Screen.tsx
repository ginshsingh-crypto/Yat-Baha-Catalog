import React from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { Platform, ScrollView, View, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { T } from '@/components/ui';

export function TabScreen({ title, subtitle, children, header, ...rest }: ScrollViewProps & { title?: string; subtitle?: string; header?: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 24 : insets.top + 8;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: top, paddingHorizontal: 20, paddingBottom: 130 }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {IS_PREVIEW ? (
        <View style={{ backgroundColor: c.turquoiseSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 18 }}>
          <T size={12} color={c.primary} center>نسخة للمعاينة · بياناتك محفوظة على هذا الجهاز</T>
        </View>
      ) : null}
      {header}
      {title ? (
        <View style={{ marginBottom: 18, marginTop: 6 }}>
          <T w="bold" size={32} style={{ lineHeight: 46 }}>
            {title}
          </T>
          {subtitle ? (
            <T size={14} color={c.mutedForeground}>
              {subtitle}
            </T>
          ) : null}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}
