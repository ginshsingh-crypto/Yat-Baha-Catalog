import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ReportsProvider } from '@/context/ReportsContext';
import { useColors } from '@/hooks/useColors';
import { F } from '@/components/ui';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { Platform } from 'react-native';

if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_DOMAIN) setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

function AuthenticatedReports({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth();
  // Native requests have no cookie jar. Web uses same-origin Clerk cookies.
  if (Platform.OS !== 'web') setAuthTokenGetter(() => getToken());
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
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache} proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}>
          <ClerkLoaded>
          <AuthenticatedReports>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthenticatedReports>
          </ClerkLoaded>
          </ClerkProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
