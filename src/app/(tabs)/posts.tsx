import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOutUp, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoAvatar, PressableScale, useHaptics } from '@/components/premium';
import { Button, EmptyState, Txt } from '@/components/ui';
import type { Post } from '@/domain/types';
import { openCompose, plural, UNKNOWN_AUTHOR, useNow, useReplyCounts } from '@/features/posts/helpers';
import { PostCard } from '@/features/posts/PostCard';
import { usePostUI } from '@/features/posts/usePostUI';
import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Segment = 'following' | 'everyone';

export default function PostsScreen() {
  const { state } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const now = useNow();
  const reduceMotion = useReducedMotion();
  const { h, overlays, authors, showToast } = usePostUI({ toastTop: insets.top + 64 });
  const listRef = useRef<FlatList<Post>>(null);

  const [segment, setSegment] = useState<Segment>('following');
  // Posts from others that arrive after this moment wait behind the "new posts" pill, so the feed
  // never jumps under your thumb. Pull to refresh (or tap the pill) to reveal them.
  const [cutoff, setCutoff] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const replyCounts = useReplyCounts(state.posts);
  const postsById = useMemo(() => new Map(state.posts.map(p => [p.id, p])), [state.posts]);

  const { shown, pending } = useMemo(() => {
    const blocked = new Set(state.contacts.filter(c => c.blocked).map(c => c.id));
    const following = new Set(state.contacts.filter(c => c.following).map(c => c.id));
    const inSegment = (p: Post) => segment === 'everyone' || p.authorId === 'me' || following.has(p.authorId);
    const top = state.posts
      .filter(p => p.kind === 'text' && !p.replyToId && !blocked.has(p.authorId) && inSegment(p))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const isShown = (p: Post) => p.authorId === 'me' || Date.parse(p.createdAt) <= cutoff;
    return { shown: top.filter(isShown), pending: top.filter(p => !isShown(p)) };
  }, [state.posts, state.contacts, segment, cutoff]);

  // Ids that appear after the first render animate in once (your new post, revealed posts).
  const knownRef = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const known = knownRef.current;
    const f = new Set<string>();
    if (known) shown.forEach(p => { if (!known.has(p.id)) f.add(p.id); });
    knownRef.current = new Set([...(known ?? []), ...shown.map(p => p.id)]);
    return f;
  }, [shown]);

  const reveal = useCallback(() => {
    const count = pending.length;
    setCutoff(Date.now());
    if (count) {
      buzz('select');
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    return count;
  }, [pending.length, buzz]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      const n = reveal();
      setRefreshing(false);
      showToast(n ? `${plural(n, 'new post')}` : 'You’re all caught up', n ? 'sparkles' : 'checkmark-done-circle');
    }, 650);
  }, [reveal, showToast]);

  const switchTo = useCallback((s: Segment) => {
    buzz('select');
    setSegment(s);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [buzz]);

  const renderItem = useCallback(({ item }: { item: Post }) => {
    const author = authors.get(item.authorId) ?? UNKNOWN_AUTHOR;
    const quoted = item.quoteOfId ? postsById.get(item.quoteOfId) : undefined;
    const card = (
      <PostCard
        post={item}
        author={author}
        quoted={quoted}
        quotedAuthor={quoted ? authors.get(quoted.authorId) : undefined}
        replyCount={replyCounts.get(item.id) ?? 0}
        now={now}
        h={h}
      />
    );
    if (!fresh.has(item.id) || reduceMotion) return card;
    return <Animated.View entering={FadeInDown.springify().damping(15).stiffness(160)}>{card}</Animated.View>;
  }, [authors, postsById, replyCounts, now, h, fresh, reduceMotion]);

  const followingNobody = segment === 'following' && !state.contacts.some(c => c.following);

  const header = (
    <View style={styles.listHeader}>
      <SegmentedControl value={segment} onChange={switchTo} />
    </View>
  );

  const footer = shown.length ? (
    <Animated.View entering={FadeIn.delay(150)} style={[styles.endCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.endIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="checkmark-done" size={26} color={colors.accent} />
      </View>
      <Txt variant="subheading" style={{ textAlign: 'center' }}>You’re all caught up</Txt>
      <Txt variant="small" color="textMuted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {segment === 'following'
          ? 'That’s everything from the people you follow. Pull down any time to check for new posts.'
          : 'That’s every post for now. Time for a stretch, or share what’s on your mind.'}
      </Txt>
      <View style={styles.endActions}>
        {segment === 'following' ? <Button label="See Everyone" variant="secondary" compact onPress={() => switchTo('everyone')} /> : null}
        <Button label="Write a post" icon="create-outline" compact onPress={() => openCompose()} />
      </View>
    </Animated.View>
  ) : undefined;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.titleRow}>
        <Txt variant="title">Posts</Txt>
        <PressableScale
          haptic="tap"
          onPress={() => h.avatar('me')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          style={styles.meBtn}
        >
          <PhotoAvatar name={state.user?.displayName ?? 'You'} size={36} />
        </PressableScale>
      </View>

      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          followingNobody ? (
            <EmptyState
              icon="people-outline"
              title="Follow people to fill this feed"
              body="You’re not following anyone yet. Browse Everyone and tap a photo to follow."
              action={<Button label="Browse Everyone" onPress={() => switchTo('everyone')} />}
            />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No posts yet"
              body="Be the first to share something. Short and sweet works best."
              action={<Button label="Write a post" icon="create-outline" onPress={() => openCompose()} />}
            />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        style={styles.flex}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={false}
      />

      {pending.length ? (
        <Animated.View entering={FadeInUp.springify().damping(14)} exiting={FadeOutUp.duration(160)} style={[styles.pillWrap, { top: insets.top + 64 }]}>
          <PressableScale
            haptic="select"
            onPress={reveal}
            accessibilityRole="button"
            accessibilityLabel={`Show ${plural(pending.length, 'new post')}`}
            style={[styles.newPill, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="arrow-up" size={15} color={colors.onAccent} />
            <View style={styles.pillFaces}>
              {[...new Set(pending.map(p => p.authorId))].slice(0, 3).map((id, i) => {
                const a = authors.get(id) ?? UNKNOWN_AUTHOR;
                return (
                  <View key={id} style={[styles.pillFace, { marginLeft: i ? -8 : 0, borderColor: colors.accent }]}>
                    <PhotoAvatar name={a.name} uri={a.avatarUrl} size={20} />
                  </View>
                );
              })}
            </View>
            <Text style={[type.small, { color: colors.onAccent, fontWeight: '700' }]}>{plural(pending.length, 'new post')}</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      <ComposeFab />
      {overlays}
    </View>
  );
}

function SegmentedControl({ value, onChange }: { value: Segment; onChange: (s: Segment) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const half = (width - 8) / 2;
  useEffect(() => {
    x.value = withSpring(value === 'following' ? 0 : half, { damping: 18, stiffness: 220 });
  }, [value, half, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const items: { key: Segment; label: string }[] = [{ key: 'following', label: 'Following' }, { key: 'everyone', label: 'Everyone' }];
  return (
    <View onLayout={onLayout} accessibilityRole="tablist" style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
      {width ? <Animated.View style={[styles.thumb, { width: half, backgroundColor: colors.surface }, thumb]} /> : null}
      {items.map(it => {
        const selected = value === it.key;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={it.label}
            onPress={() => !selected && onChange(it.key)}
            style={styles.segmentItem}
          >
            <Text style={[type.small, { fontWeight: '700', color: selected ? colors.text : colors.textMuted }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ComposeFab() {
  return (
    <Animated.View entering={FadeIn.delay(200)} style={styles.fabWrap}>
      <PressableScale
        haptic="tap"
        scaleTo={0.9}
        onPress={() => openCompose()}
        accessibilityRole="button"
        accessibilityLabel="Write a post"
        style={styles.fab}
      >
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <Ionicons name="add" size={30} color="#fff" />
        </LinearGradient>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  meBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  listHeader: { paddingHorizontal: space.md, paddingBottom: space.md },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, height: 44 },
  thumb: {
    position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: radius.pill,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  endCard: {
    marginHorizontal: space.md, marginTop: space.sm, padding: space.xl, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', gap: space.sm,
  },
  endIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  endActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  newPill: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 40, borderRadius: radius.pill,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  pillFaces: { flexDirection: 'row' },
  pillFace: { borderWidth: 2, borderRadius: 12 },
  fabWrap: { position: 'absolute', right: space.lg, bottom: space.lg },
  fab: {
    width: 60, height: 60, borderRadius: 30,
    shadowColor: '#4F46E5', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  fabInner: { flex: 1, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
