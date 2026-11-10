import React from 'react';
import { Platform, ScrollView, View, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { T } from '@/components/ui';

export function TabScreen({ title, subtitle, children, header, ...rest }: ScrollViewProps & { title?: string; subtitle?: string; header?: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 67 : insets.top + 8;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: top, paddingHorizontal: 20, paddingBottom: 130 }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
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
