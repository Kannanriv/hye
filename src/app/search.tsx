import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Chip, EmptyState, SourceBadge, TextField, Txt } from '@/components/ui';
import { searchMessages } from '@/state/selectors';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { formatDateTime } from '@/utils/time';

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <Txt variant="small" numberOfLines={2}>{text}</Txt>;
  const start = Math.max(0, i - 40);
  return (
    <Txt variant="small" numberOfLines={2}>
      {start > 0 ? '…' : ''}{text.slice(start, i)}
      <Txt variant="small" color="accent" style={{ fontWeight: '700' }}>{text.slice(i, i + q.length)}</Txt>
      {text.slice(i + q.length)}
    </Txt>
  );
}

export default function SearchScreen() {
  const { state } = useStore();
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'all' | 'native' | 'imported'>('all');
  const hits = useMemo(() => searchMessages(state, q).filter(h => scope === 'all' || h.conversation.origin === scope), [state, q, scope]);

  return (
    <Screen title="Search" back scroll={false}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <TextField autoFocus value={q} onChangeText={setQ} placeholder="Search every message and file name" accessibilityLabel="Search messages" returnKeyType="search" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip label="Everything" selected={scope === 'all'} onPress={() => setScope('all')} />
          <Chip label="hye chats" selected={scope === 'native'} onPress={() => setScope('native')} />
          <Chip label="Imported" selected={scope === 'imported'} onPress={() => setScope('imported')} />
        </View>
        {q.trim().length >= 2 ? (
          <View accessibilityLiveRegion="polite">
            <Txt variant="caption" color="textMuted">{hits.length === 200 ? 'Showing the 200 most recent results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`}</Txt>
          </View>
        ) : null}
      </View>
      <FlatList
        data={hits}
        keyExtractor={h => h.message.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={hits.length ? { padding: space.lg, gap: space.sm } : { flexGrow: 1 }}
        ListEmptyComponent={
          q.trim().length < 2
            ? <EmptyState icon="search" title="Search across everything" body="Find messages in your hye chats and imported history. Type at least 2 characters." />
            : <EmptyState icon="search" title={`No results for “${q.trim()}”`} body="Check the spelling or try fewer words." />
        }
        renderItem={({ item: h }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${h.message.senderName} in ${h.conversation.title}: ${h.message.text}`}
            onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: h.conversation.id } })}
            style={({ pressed }) => [styles.hit, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.top}>
              <Txt variant="subheading" numberOfLines={1} style={{ flex: 1 }}>{h.conversation.title}</Txt>
              <Txt variant="caption" color="textMuted">{formatDateTime(h.message.sentAt)}</Txt>
            </View>
            <Txt variant="caption" color="textMuted">{h.message.senderId === 'me' ? 'You' : h.message.senderName}</Txt>
            <Highlight text={h.message.text || h.message.attachments.map(a => a.fileName).join(', ')} q={q.trim()} />
            <SourceBadge source={h.conversation.source} imported={h.conversation.origin === 'imported'} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hit: { padding: space.md, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
