import React, { useEffect } from 'react';
import { IS_PREVIEW } from '@/config/runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { ReportsProvider } from '@/context/ReportsContext';
import { useColors } from '@/hooks/useColors';
import { F, T } from '@/components/ui';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { Platform, View } from 'react-native';

// The web app can be served independently of the API, just like native builds.
if (!IS_PREVIEW && process.env.EXPO_PUBLIC_DOMAIN) setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

function AuthenticatedReports({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth();
  // Bearer tokens also authenticate a web build hosted on a separate domain.
  setAuthTokenGetter(() => getToken());
  useEffect(() => { queryClient.clear(); }, [userId]);
  return <ReportsProvider key={userId ?? 'guest'}>{children}</ReportsProvider>;
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'رجوع',
        headerTintColor: c.primary,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontFamily: F.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="report/[id]" options={{ title: '' , headerTransparent: false }} />
      <Stack.Screen name="report/new" options={{ title: 'بلاغ جديد', presentation: 'modal' }} />
      <Stack.Screen name="report/edit/[id]" options={{ title: 'تعديل البلاغ', presentation: 'modal' }} />
      <Stack.Screen name="sign-in" options={{ title: 'حسابك', presentation: 'modal' }} />
      <Stack.Screen name="claims" options={{ title: 'طلبات الملكية والتواصل' }} />
      <Stack.Screen name="moderation" options={{ title: 'مراجعة المحتوى' }} />
      <Stack.Screen name="recovery/[id]" options={{ title: 'رحلة الإعادة', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular: require('@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
    IBMPlexSansArabic_500Medium: require('@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf'),
    IBMPlexSansArabic_600SemiBold: require('@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf'),
    IBMPlexSansArabic_700Bold: require('@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#ECEFF3', alignItems: 'center' }}>
    <SafeAreaProvider style={{ width: '100%', flex: 1, ...(Platform.OS === 'web' ? { maxWidth: 720, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E2E7EC' } : {}) }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProviders>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <StatusBar style="dark" />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProviders>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
    </View>
  );
}

function AppProviders({ children }: { children: React.ReactNode }) {
  if (IS_PREVIEW) return <ReportsProvider>{children}</ReportsProvider>;
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <T w="bold" size={24}>الخدمة قيد الإعداد</T>
      <T>لم يكتمل إعداد تسجيل الدخول لهذه النسخة. يمكنك تجربة التطبيق من رابط المعاينة.</T>
    </View>;
  }
  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache} proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}>
      <ClerkLoaded>
        <AuthenticatedReports>{children}</AuthenticatedReports>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
