import { Ionicons } from '@expo/vector-icons';
import { Href, router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, FlatList, FlatListProps, LayoutChangeEvent, Platform, Share, StyleSheet, Text, View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, useHaptics } from '@/components/premium';
import type { IconName } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Post } from '@/domain/types';
import { CommentsSheet } from '@/features/reels/CommentsSheet';
import { BreakCard, EndCard } from '@/features/reels/EndCards';
import { plural, useReelPeople } from '@/features/reels/people';
import { ReelItem } from '@/features/reels/ReelItem';
import { useStore } from '@/state/store';
import { space, type } from '@/theme/tokens';

type Row = { key: string; post: Post } | { key: 'end'; post: null };

const BREAK_AFTER = 10;
const NEW_REEL = '/reel/new' as Href;

export default function ReelsScreen() {
  const { state, dispatch } = useStore();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const reduceMotion = useReducedMotion();
  const personFor = useReelPeople(state.contacts, state.user);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(Platform.OS === 'web'); // browsers only autoplay muted video
  const [paused, setPaused] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [showBreak, setShowBreak] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);

  const reels = useMemo(() => {
    const blocked = new Set(state.contacts.filter(c => c.blocked).map(c => c.id));
    return state.posts
      .filter(p => p.kind === 'reel' && p.media[0]?.kind === 'video' && !blocked.has(p.authorId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.posts, state.contacts]);
  const reelsRef = useRef(reels);
  reelsRef.current = reels;

  const rows = useMemo<Row[]>(() => [...reels.map(p => ({ key: p.id, post: p })), { key: 'end', post: null }], [reels]);

  // Count one view per reel per visit, and a gentle break nudge after a long run.
  const viewed = useRef(new Set<string>());
  const streak = useRef(0);
  const current = rows[activeIndex];
  const currentId = current?.post?.id;
  useEffect(() => {
    if (!focused || !currentId) return;
    if (!viewed.current.has(currentId)) {
      viewed.current.add(currentId);
      dispatch({ type: 'viewPost', id: currentId });
    }
    streak.current += 1;
    if (streak.current >= BREAK_AFTER) {
      streak.current = 0;
      setShowBreak(true);
    }
  }, [currentId, dispatch, focused]);

  useEffect(() => {
    if (focused) return;
    streak.current = 0;
    viewed.current.clear();
    setShowBreak(false);
  }, [focused]);

  const onViewableItemsChanged = useRef<NonNullable<FlatListProps<Row>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const first = viewableItems.find(v => v.isViewable && v.index != null);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      AccessibilityInfo.announceForAccessibility(m ? 'Sound on' : 'Sound off');
      return !m;
    });
  }, []);
  const togglePause = useCallback(() => setPaused(p => !p), []);

  const like = useCallback((id: string, fromDoubleTap?: boolean) => {
    const post = reelsRef.current.find(p => p.id === id);
    if (!post) return;
    const liked = post.likes.includes('me');
    if (fromDoubleTap && liked) { buzz('tap'); return; } // double tap only ever likes
    dispatch({ type: 'toggleLike', id });
    buzz(liked ? 'select' : 'tap');
    const n = post.likes.length + (liked ? -1 : 1);
    AccessibilityInfo.announceForAccessibility(`${liked ? 'Unliked' : 'Liked'}. ${plural(n, 'like')}`);
  }, [buzz, dispatch]);

  const save = useCallback((id: string) => {
    const post = reelsRef.current.find(p => p.id === id);
    dispatch({ type: 'toggleSave', id });
    buzz('select');
    AccessibilityInfo.announceForAccessibility(post?.saved ? 'Removed from saved' : 'Saved');
  }, [buzz, dispatch]);

  const follow = useCallback((contactId: string) => dispatch({ type: 'toggleFollow', contactId }), [dispatch]);

  const share = useCallback((post: Post) => {
    const who = personFor(post.authorId);
    const name = who.isMe ? 'My' : `${who.name}’s`;
    Share.share({ message: `${name} reel on hye: ${post.text}\n${post.media[0]?.uri ?? ''}`.trim() }).catch(() => undefined);
  }, [personFor]);

  const sendComment = useCallback((id: string, text: string) => {
    dispatch({ type: 'addComment', id, comment: { id: newId('cmt'), authorId: 'me', text, createdAt: new Date().toISOString() } });
    buzz('tap');
    AccessibilityInfo.announceForAccessibility('Comment posted');
  }, [buzz, dispatch]);

  const create = useCallback(() => router.push(NEW_REEL), []);
  const restart = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    setPaused(false);
  }, [reduceMotion]);

  // Tablets/desktop: keep a phone-shaped column centred on black.
  const colW = size ? Math.min(size.w, Math.round(size.h * 0.6)) : 0;
  const h = size?.h ?? 0;

  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => {
    if (!item.post) return <EndCard width={colW} height={h} empty={reels.length === 0} onRestart={restart} onCreate={create} />;
    const isCurrent = index === activeIndex;
    return (
      <ReelItem
        post={item.post}
        author={personFor(item.post.authorId)}
        width={colW}
        height={h}
        current={isCurrent}
        playing={isCurrent && focused && !paused}
        muted={muted}
        reduceMotion={reduceMotion}
        onToggleMute={toggleMute}
        onTogglePause={togglePause}
        onLike={like}
        onComment={setCommentsFor}
        onShare={share}
        onSave={save}
        onFollow={follow}
      />
    );
  }, [activeIndex, colW, create, focused, follow, h, like, muted, paused, personFor, reduceMotion, reels.length, restart, save, share, toggleMute, togglePause]);

  const getItemLayout = useCallback((_: ArrayLike<Row> | null | undefined, index: number) => ({ length: h, offset: h * index, index }), [h]);

  const onEnd = !current?.post;
  const commentPost = commentsFor ? reels.find(p => p.id === commentsFor) ?? null : null;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {focused ? <StatusBar style="light" /> : null}
      {size ? (
        <FlatList
          ref={listRef}
          data={rows}
          extraData={activeIndex}
          keyExtractor={r => r.key}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          pagingEnabled
          decelerationRate="fast"
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          style={{ width: colW, alignSelf: 'center' }}
          accessibilityLabel="Reels"
        />
      ) : null}

      <View style={[styles.topBar, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
        <Text accessibilityRole="header" style={[type.heading, styles.title]}>Reels</Text>
        <View style={styles.topActions}>
          {onEnd ? null : (
            <>
              <TopButton icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onPress={togglePause} />
              <TopButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
            </>
          )}
          <TopButton icon="add-circle-outline" label="Make a reel" onPress={create} />
        </View>
      </View>

      {showBreak && focused ? (
        <BreakCard
          top={insets.top + 64}
          onDismiss={() => setShowBreak(false)}
          onPause={() => { setPaused(true); setShowBreak(false); }}
        />
      ) : null}

      <CommentsSheet post={commentPost} personFor={personFor} onClose={() => setCommentsFor(null)} onSend={sendComment} />
    </View>
  );
}

function TopButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} haptic="select" onPress={onPress} style={styles.topBtn} scaleTo={0.9}>
      <Ionicons name={icon} size={24} color="#fff" style={styles.shadow} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  title: { color: '#fff', flex: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
});
