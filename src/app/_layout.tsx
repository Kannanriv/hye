import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, EmptyState } from '@/components/ui';
import { AchievementWatcher } from '@/features/gamification/useAchievementWatcher';
import { usePhotosSimulation } from '@/features/photos/simulation';
import { usePostsSimulation } from '@/features/posts/simulation';
import { StoreProvider, useStore } from '@/state/store';
import { ThemeProvider, useTheme } from '@/theme/useTheme';

/** App-wide background services for signed-in users: demo activity and achievement celebrations. */
function SignedInServices() {
  usePostsSimulation();
  usePhotosSimulation();
  return <AchievementWatcher />;
}

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
          <Stack.Screen name="achievements" />
          <Stack.Screen name="post/[id]" />
          <Stack.Screen name="post/compose" options={{ presentation: 'modal' }} />
          <Stack.Screen name="photo/[id]" />
          <Stack.Screen name="photo/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="reel/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="story/[contactId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      {signedIn ? <SignedInServices /> : null}
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
