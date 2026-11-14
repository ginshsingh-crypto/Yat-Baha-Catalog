import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { T, ROW } from './ui';
import { useColors } from '@/hooks/useColors';

export function PreviewConnectivity() {
  const c = useColors();
  const [online, setOnline] = useState(true);
  const [state, setState] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const connectivity = () => setOnline(navigator.onLine);
    const worker = () => setState(document.documentElement.dataset.previewOffline ?? '');
    connectivity(); worker();
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    window.addEventListener('yat-preview-offline', worker);
    return () => {
      window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity);
      window.removeEventListener('yat-preview-offline', worker);
    };
  }, []);
  const extra = !online ? 'دون اتصال · يمكنك العمل على جهازك' : state === 'update' ? 'تحديث جاهز عند إعادة فتح نوافذ المعاينة' : state === 'ready' ? 'جاهز دون اتصال عند إعادة الفتح' : '';
  return <View style={{ backgroundColor: c.turquoiseSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 18, gap: 3 }}>
    <T size={11} color={c.secondaryForeground} center>نسخة للمعاينة · بياناتك محفوظة على هذا الجهاز</T>
    {extra ? <View style={{ flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      <Feather name={!online ? 'wifi-off' : state === 'update' ? 'refresh-cw' : 'check-circle'} size={11} color={c.turquoise} />
      <T size={10} color={c.turquoise} center>{extra}</T>
    </View> : null}
  </View>;
}
