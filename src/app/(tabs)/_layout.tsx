import { Tabs } from 'expo-router';

import { AppNavBar } from '@/components/AppNavBar';
import { useIsWide } from '@/theme/useTheme';

export default function TabsLayout() {
  const wide = useIsWide();
  return (
    <Tabs
      tabBar={props => <AppNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="communities" options={{ title: 'Communities' }} />
      <Tabs.Screen name="feed" options={{ title: 'Social Feed' }} />
      <Tabs.Screen name="connections" options={{ title: 'Connections' }} />
      <Tabs.Screen name="archive" options={{ title: 'Archive' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
