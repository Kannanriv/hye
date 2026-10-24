import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, ConfirmDialog, EmptyState, platformLabel, Tag, TextField, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { SavedLink } from '@/domain/types';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { platformForUrl } from '@/utils/labels';
import { formatListTime } from '@/utils/time';

/** Only ever open web links, even if stored data was tampered with (no intent:, file:, javascript:). */
function openSafely(url: string) {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => undefined);
}

export default function FeedScreen() {
  const { state, dispatch } = useStore();
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState<SavedLink['platform'] | 'all'>('all');
  const [removing, setRemoving] = useState<SavedLink | null>(null);

  const platforms = useMemo(() => [...new Set(state.savedLinks.map(l => l.platform))], [state.savedLinks]);
  const links = state.savedLinks.filter(
    l => (platform === 'all' || l.platform === platform) && (!q || `${l.url} ${l.note}`.toLowerCase().includes(q.toLowerCase())),
  );

  const save = () => {
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) return setError('Paste a full link that starts with https://');
    dispatch({ type: 'saveLink', link: { id: newId('lnk'), url: trimmed, note: note.trim(), platform: platformForUrl(trimmed), savedAt: new Date().toISOString() } });
    setUrl('');
    setNote('');
    setError(undefined);
  };

  return (
    <Screen title="Social Feed" subtitle="Posts you’ve saved from anywhere">
      <Banner
        icon="information-circle-outline"
        title="No live feeds are connected"
        body="Social platforms don’t let apps like hye show your personal timeline. Save posts here by link, and we’ll add feeds only where an official API allows it."
      />
      <Card style={{ padding: space.lg, gap: space.md }}>
        <TextField label="Post link" value={url} onChangeText={t => { setUrl(t); setError(undefined); }} placeholder="https://…" autoCapitalize="none" keyboardType="url" error={error} />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why you saved it" />
        <Button label="Save post" icon="bookmark-outline" onPress={save} disabled={!url.trim()} />
      </Card>

      {state.savedLinks.length ? (
        <>
          <TextField value={q} onChangeText={setQ} placeholder="Search saved posts" accessibilityLabel="Search saved posts" />
          <View style={styles.chips}>
            <Chip label="All" selected={platform === 'all'} onPress={() => setPlatform('all')} />
            {platforms.map(p => <Chip key={p} label={platformLabel(p)} selected={platform === p} onPress={() => setPlatform(p)} />)}
          </View>
        </>
      ) : null}

      {links.length === 0 ? (
        <EmptyState icon="bookmark-outline" title={state.savedLinks.length ? 'No saved posts match' : 'Nothing saved yet'} body={state.savedLinks.length ? undefined : 'Paste a link to a post you want to keep. It stays private to you.'} />
      ) : (
        links.map(l => (
          <Card key={l.id} style={{ padding: space.lg, gap: space.sm }}>
            <View style={styles.top}>
              <Tag label={platformLabel(l.platform)} />
              <Txt variant="caption" color="textMuted" style={{ flex: 1 }}>Saved {formatListTime(l.savedAt)}</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove saved post" hitSlop={8} onPress={() => setRemoving(l)}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {l.note ? <Txt>{l.note}</Txt> : null}
            <Pressable accessibilityRole="link" accessibilityLabel={`Open original post: ${l.url}`} onPress={() => openSafely(l.url)} style={styles.link}>
              <Ionicons name="open-outline" size={16} color={colors.accent} />
              <Txt variant="small" color="accent" numberOfLines={1} style={{ flex: 1 }}>{l.url}</Txt>
            </Pressable>
          </Card>
        ))
      )}
      <ConfirmDialog
        visible={!!removing}
        title="Remove saved post?"
        body="This only removes it from hye. The original post isn’t affected."
        confirmLabel="Remove"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing) dispatch({ type: 'removeLink', id: removing.id }); setRemoving(null); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
});
