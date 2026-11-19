import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppErrorBoundary from '@/src/components/common/AppErrorBoundary';
import { AuthProvider } from '@/src/store/auth-store';
import { ThemeProvider, useAppTheme } from '@/src/store/theme-store';
import { VoiceProvider } from '@/src/store/voice-store';

function AppShellNavigator() {
  const { theme } = useAppTheme();

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="user" options={{ headerShown: false }} />
        <Stack.Screen name="admin/index" options={{ headerShown: false }} />
        <Stack.Screen name="admin/dashboard" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={theme.colors.isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <VoiceProvider>
              <AppShellNavigator />
            </VoiceProvider>
          </AuthProvider>
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
