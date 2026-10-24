import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Divider, EmptyState, SectionTitle, Tag, Txt } from '@/components/ui';
import { integrationFor, STATUS_COPY } from '@/integrations/catalog';
import { space } from '@/theme/tokens';

export default function IntegrationScreen() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  const info = integrationFor(platform);
  if (!info) return <Screen title="Not found" back><EmptyState icon="help-circle-outline" title="Unknown platform" /></Screen>;
  const canImport = info.capabilities.some(c => c.status === 'available' && /import/i.test(c.label));

  return (
    <Screen title={info.name} back>
      <Txt color="textMuted">{info.summary}</Txt>
      {canImport ? <Button label="Import a chat" icon="download-outline" onPress={() => router.push('/import')} /> : (
        <Banner icon="time-outline" title="Not connected in this prototype" body="hye has no server yet, so nothing here works today. Each status shows what the platform’s official API allows." />
      )}
      <SectionTitle>What’s possible</SectionTitle>
      <Card>
        {info.capabilities.map((c, i) => {
          const s = STATUS_COPY[c.status];
          return (
            <View key={c.label}>
              {i > 0 ? <Divider /> : null}
              <View style={{ padding: space.lg, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Txt variant="subheading" style={{ flex: 1 }}>{c.label}</Txt>
                  <Tag label={s.label} tone={s.tone} />
                </View>
                <Txt variant="small" color="textMuted">{c.note}</Txt>
              </View>
            </View>
          );
        })}
      </Card>
      <SectionTitle>What you can do instead</SectionTitle>
      <Card style={{ padding: space.lg, gap: space.sm }}>
        {info.alternatives.map(a => <Txt key={a}>• {a}</Txt>)}
      </Card>
      <Txt variant="caption" color="textMuted">
        hye uses official APIs and the permissions you approve. We don’t scrape, bypass encryption or store passwords for other services.
      </Txt>
    </Screen>
  );
}
