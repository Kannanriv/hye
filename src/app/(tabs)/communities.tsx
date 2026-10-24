import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Avatar, Banner, Button, Card, Divider, EmptyState, Row, SectionTitle } from '@/components/ui';
import { useStore } from '@/state/store';
import { formatListTime } from '@/utils/time';

export default function CommunitiesScreen() {
  const { state } = useStore();
  const groups = useMemo(
    () => state.conversations.filter(c => c.kind === 'group' && c.origin === 'native').sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    [state.conversations],
  );
  const adminOf = groups.filter(g => g.members.some(m => m.contactId === 'me' && m.role === 'admin'));

  return (
    <Screen title="Communities" subtitle="Groups you belong to">
      <Button label="Create a group" icon="add" onPress={() => router.push({ pathname: '/new-chat', params: { mode: 'group' } })} />
      {groups.length === 0 ? (
        <EmptyState icon="people-outline" title="No groups yet" body="Create a group to plan, share and talk with several people at once." />
      ) : (
        <>
          <SectionTitle>{`Your groups · ${groups.length}`}</SectionTitle>
          <Card>
            {groups.map((g, i) => (
              <View key={g.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  label={g.title}
                  detail={`${g.members.length} members · active ${formatListTime(g.lastActivityAt)}${adminOf.includes(g) ? ' · you’re an admin' : ''}`}
                  right={<Avatar name={g.title} size={32} group />}
                  onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: g.id } })}
                />
              </View>
            ))}
          </Card>
        </>
      )}
      <Banner
        icon="construct-outline"
        title="Communities with multiple groups are coming later"
        body="For now, a community is a group. Announcement channels and sub-groups will arrive with the hye server."
      />
    </Screen>
  );
}
