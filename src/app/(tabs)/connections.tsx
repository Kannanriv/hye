import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Card, Divider, Row, SectionTitle, Tag } from '@/components/ui';
import { INTEGRATIONS, STATUS_COPY } from '@/integrations/catalog';
import { useStore } from '@/state/store';

export default function ConnectionsScreen() {
  const { state } = useStore();
  const imports = state.importJobs.length;
  return (
    <Screen title="Connections" subtitle="What hye can and can’t do with other apps">
      <Banner
        icon="shield-checkmark-outline"
        title="No accounts connected"
        body="This prototype has no server, so it can’t connect to other services. We’ll never ask for your passwords or read chats an app hasn’t officially allowed."
      />
      <SectionTitle>Bring your history</SectionTitle>
      <Card>
        <Row icon="download-outline" label="Import a WhatsApp chat" detail={imports ? `${imports} import${imports > 1 ? 's' : ''} so far` : 'From WhatsApp’s “Export chat”'} onPress={() => router.push('/import')} />
      </Card>
      <SectionTitle>Platforms</SectionTitle>
      <Card>
        {INTEGRATIONS.map((p, i) => {
          const best = p.capabilities.find(c => c.status === 'available') ?? p.capabilities.find(c => c.status === 'planned') ?? p.capabilities[0];
          const copy = STATUS_COPY[best.status];
          return (
            <View key={p.platform}>
              {i > 0 ? <Divider /> : null}
              <Row
                label={p.name}
                detail={best.label}
                onPress={() => router.push({ pathname: '/integration/[platform]', params: { platform: p.platform } })}
                right={<Tag label={copy.label} tone={copy.tone} />}
              />
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
