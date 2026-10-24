import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GradientButton, PhotoAvatar, PressableScale } from '@/components/premium';
import type { Post } from '@/domain/types';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Person } from './util';

const STORY_SIZE = 62;

/** Your "Add" bubble followed by contacts' stories; unseen first, seen rings turn grey. */
export function StoriesRow({ me, people, seen, onAdd, onOpen }: {
  me: Person; people: Person[]; seen: ReadonlySet<string>; onAdd: () => void; onOpen: (id: string) => void;
}) {
  const { colors } = useTheme();
  const ordered = [...people].sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories} accessibilityLabel="Stories">
      <PressableScale accessibilityRole="button" accessibilityLabel="Share a new photo" haptic="tap" onPress={onAdd} style={styles.story}>
        <View>
          <View style={{ padding: 5 }}>
            <PhotoAvatar name={me.name} uri={me.avatarUrl} size={STORY_SIZE} />
          </View>
          <LinearGradient colors={gradients.brand} style={[styles.addBadge, { borderColor: colors.bg }]}>
            <Ionicons name="add" size={16} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>Add</Text>
      </PressableScale>
      {ordered.map(p => {
        const wasSeen = seen.has(p.id);
        return (
          <PressableScale
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}'s story${wasSeen ? ', viewed' : ', new'}`}
            haptic="tap"
            onPress={() => onOpen(p.id)}
            style={styles.story}
          >
            <PhotoAvatar name={p.name} uri={p.avatarUrl} size={STORY_SIZE} ring seen={wasSeen} />
            <Text style={[type.caption, { color: wasSeen ? colors.textMuted : colors.text, maxWidth: STORY_SIZE + 10 }]} numberOfLines={1}>{p.firstName}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** Feed ↔ grid switch. */
export function ViewToggle({ mode, onChange }: { mode: 'feed' | 'grid'; onChange: (m: 'feed' | 'grid') => void }) {
  const { colors } = useTheme();
  const item = (m: 'feed' | 'grid', icon: 'albums-outline' | 'grid-outline', label: string) => {
    const on = mode === m;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={() => onChange(m)}
        style={[styles.toggleItem, on && { backgroundColor: colors.surface, shadowOpacity: 0.08 }]}
      >
        <Ionicons name={on ? (icon.replace('-outline', '') as typeof icon) : icon} size={18} color={on ? colors.text : colors.textMuted} />
        <Text style={[type.small, { color: on ? colors.text : colors.textMuted, fontWeight: '600' }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={[styles.toggle, { backgroundColor: colors.surfaceAlt }]}>
      {item('feed', 'albums-outline', 'Feed')}
      {item('grid', 'grid-outline', 'Grid')}
    </View>
  );
}

/** The end of the feed. Nothing more to pull you in; just a friendly stop. */
export function CaughtUpCard({ onShare }: { onShare: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.caught, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.caughtIcon}>
        <Ionicons name="checkmark" size={30} color="#fff" />
      </LinearGradient>
      <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>You’re all caught up</Text>
      <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
        You’ve seen every photo your contacts shared this week. Time for something else, or share a moment of your own.
      </Text>
      <GradientButton label="Share a photo" icon="camera-outline" onPress={onShare} style={{ alignSelf: 'stretch', marginTop: space.sm }} />
    </View>
  );
}

/** Square tile for the grid view. */
export const GridTile = memo(function GridTile({ post, size, authorName, onOpen }: {
  post: Post; size: number; authorName: string; onOpen: (id: string) => void;
}) {
  const { colors } = useTheme();
  const uri = post.media[0]?.uri;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Photo by ${authorName}${post.media.length > 1 ? `, ${post.media.length} photos` : ''}. ${post.likes.length} likes`}
      onPress={() => onOpen(post.id)}
      style={({ pressed }) => ({ width: size, height: size, padding: 1, opacity: pressed ? 0.8 : 1 })}
    >
      <Image source={{ uri }} recyclingKey={uri} style={{ flex: 1, backgroundColor: colors.surfaceAlt }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      {post.media.length > 1 ? <Ionicons name="copy" size={16} color="#fff" style={styles.multi} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  stories: { paddingHorizontal: space.md, gap: space.sm, paddingVertical: space.sm },
  story: { alignItems: 'center', gap: 4, minWidth: 72 },
  addBadge: { position: 'absolute', right: 2, bottom: 2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  toggle: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, marginHorizontal: space.md, marginVertical: space.sm },
  toggleItem: {
    flex: 1, minHeight: 40, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  caught: { alignItems: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginTop: space.sm },
  caughtIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  multi: { position: 'absolute', top: 7, right: 7, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
});
