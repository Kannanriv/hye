import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, EmptyState } from '@/components/ui';
import { StoreProvider, useStore } from '@/state/store';
import { ThemeProvider, useTheme } from '@/theme/useTheme';

function RootStack() {
  const { state, ready, loadError, startFresh } = useStore();
  const { colors, mode } = useTheme();
  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="alert-circle-outline"
          title="We couldn’t open your saved data"
          body="Nothing has been changed or deleted. Close hye and open it again. If this keeps happening, you can start fresh — that permanently erases what hye saved on this device."
          action={<Button label="Erase and start fresh" variant="danger" onPress={startFresh} />}
        />
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading hye" />
      </View>
    );
  }
  const signedIn = !!state.user;
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="conversation/[id]/index" />
          <Stack.Screen name="conversation/[id]/details" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-chat" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import" />
          <Stack.Screen name="search" />
          <Stack.Screen name="integration/[platform]" />
          <Stack.Screen name="settings/[page]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
