import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Avatar, Card, Divider, IconName, Row, SectionTitle, Txt } from '@/components/ui';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';

const PAGES: { page: string; label: string; icon: IconName; detail: string }[][] = [
  [
    { page: 'privacy', label: 'Privacy', icon: 'lock-closed-outline', detail: 'Read receipts, typing, last seen, retention' },
    { page: 'notifications', label: 'Notifications', icon: 'notifications-outline', detail: 'What alerts you get' },
    { page: 'appearance', label: 'Appearance', icon: 'contrast-outline', detail: 'Light, dark or system' },
  ],
  [
    { page: 'devices', label: 'Devices and sign-in', icon: 'phone-portrait-outline', detail: 'Sessions and sign-in methods' },
    { page: 'blocked', label: 'Blocked people', icon: 'ban-outline', detail: 'People who can’t message you' },
    { page: 'activity', label: 'Security activity', icon: 'list-outline', detail: 'Log of sensitive actions' },
  ],
  [
    { page: 'data', label: 'Your data', icon: 'cloud-download-outline', detail: 'Export everything or delete your account' },
  ],
];

export default function SettingsScreen() {
  const { state } = useStore();
  const user = state.user!;
  return (
    <Screen title="Settings">
      <Card style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={user.displayName} size={56} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{user.displayName}</Txt>
          <Txt variant="small" color="textMuted">{[user.handle && `@${user.handle}`, user.phone].filter(Boolean).join(' · ')}</Txt>
        </View>
      </Card>
      {PAGES.map((group, gi) => (
        <Card key={gi}>
          {group.map((p, i) => (
            <View key={p.page}>
              {i > 0 ? <Divider /> : null}
              <Row icon={p.icon} label={p.label} detail={p.detail} onPress={() => router.push({ pathname: '/settings/[page]', params: { page: p.page } })} />
            </View>
          ))}
        </Card>
      ))}
      <SectionTitle>About this prototype</SectionTitle>
      <Txt variant="small" color="textMuted">
        hye is running in demo mode. Your data is stored in hye on this device and hye never uploads it. Demo contacts are simulated, and integrations aren’t connected.
      </Txt>
    </Screen>
  );
}
