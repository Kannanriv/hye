import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoAvatar, PressableScale, useHaptics } from '@/components/premium';
import { Button, EmptyState, IconButton, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Post } from '@/domain/types';
import { charCount, openCompose, plural, POST_LIMIT, UNKNOWN_AUTHOR, useNow, useReplyCounts } from '@/features/posts/helpers';
import { PostCard } from '@/features/posts/PostCard';
import { usePostUI } from '@/features/posts/usePostUI';
import { useStore } from '@/state/store';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const now = useNow();
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlatList<Post>>(null);
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/posts' as never)), []);
  const { h, overlays, authors } = usePostUI({ onDeleted: deleted => { if (deleted === id) back(); }, toastTop: insets.top + 60 });

  const post = state.posts.find(p => p.id === id);
  const postsById = useMemo(() => new Map(state.posts.map(p => [p.id, p])), [state.posts]);
  const replyCounts = useReplyCounts(state.posts);
  const replies = useMemo(
    () => state.posts.filter(p => p.replyToId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [state.posts, id],
  );
  // Up to three ancestors, oldest first, so a reply is read in context.
  const ancestors = useMemo(() => {
    const chain: Post[] = [];
    let cur = post?.replyToId ? postsById.get(post.replyToId) : undefined;
    while (cur && chain.length < 3) {
      chain.unshift(cur);
      cur = cur.replyToId ? postsById.get(cur.replyToId) : undefined;
    }
    return chain;
  }, [post, postsById]);
  const parentMissing = !!post?.replyToId && !postsById.has(post.replyToId);

  // Count a view once per visit.
  const viewed = useRef(false);
  useEffect(() => {
    if (post && !viewed.current && post.authorId !== 'me') {
      viewed.current = true;
      dispatch({ type: 'viewPost', id: post.id });
    }
  }, [post, dispatch]);

  // New replies (yours or simulated) slide in.
  const initialReplies = useRef<Set<string> | null>(null);
  if (!initialReplies.current && post) initialReplies.current = new Set(replies.map(r => r.id));

  const [draft, setDraft] = useState('');
  const used = charCount(draft);
  const over = used > POST_LIMIT;
  const author = post ? authors.get(post.authorId) ?? UNKNOWN_AUTHOR : UNKNOWN_AUTHOR;
  const me = authors.get('me') ?? UNKNOWN_AUTHOR;

  const sendReply = () => {
    if (!post || !draft.trim() || over) return;
    dispatch({
      type: 'addPost',
      post: {
        id: newId('post'), kind: 'text', authorId: 'me', text: draft.trim(), media: [], createdAt: new Date().toISOString(),
        likes: [], reposts: [], comments: [], replyToId: post.id, saved: false, views: 0, audience: 'everyone',
      },
    });
    buzz('success');
    setDraft('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const card = useCallback((p: Post, extra: { focus?: boolean; replyingTo?: string } = {}) => {
    const quoted = p.quoteOfId ? postsById.get(p.quoteOfId) : undefined;
    return (
      <PostCard
        post={p}
        author={authors.get(p.authorId) ?? UNKNOWN_AUTHOR}
        quoted={quoted}
        quotedAuthor={quoted ? authors.get(quoted.authorId) : undefined}
        replyCount={replyCounts.get(p.id) ?? 0}
        now={now}
        h={h}
        flat
        {...extra}
      />
    );
  }, [authors, postsById, replyCounts, now, h]);

  const renderItem = useCallback(({ item }: { item: Post }) => {
    const node = <View style={[styles.reply, { borderColor: colors.border }]}>{card(item)}</View>;
    if (reduceMotion || initialReplies.current?.has(item.id)) return node;
    return <Animated.View entering={FadeInDown.springify().damping(15)}>{node}</Animated.View>;
  }, [card, colors.border, reduceMotion]);

  const header = (
    <Topbar onBack={back} title="Post" />
  );

  if (!post) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        {header}
        <EmptyState
          icon="trash-outline"
          title="This post isn’t available"
          body="It may have been deleted by its author."
          action={<Button label="Back to Posts" variant="secondary" onPress={back} />}
        />
        {overlays}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {header}
      <FlatList
        ref={listRef}
        data={replies}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        windowSize={7}
        ListHeaderComponent={
          <View style={[styles.main, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {parentMissing ? (
              <View style={[styles.missing, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Txt variant="small" color="textMuted">Replying to a post that was deleted.</Txt>
              </View>
            ) : null}
            {ancestors.map(a => (
              <View key={a.id}>
                {card(a)}
                <View style={[styles.connector, { backgroundColor: colors.border }]} />
              </View>
            ))}
            {card(post, { focus: true, replyingTo: ancestors.length ? authors.get(ancestors[ancestors.length - 1].authorId)?.handle : undefined })}
            <View style={[styles.repliesHead, { borderColor: colors.border }]}>
              <Txt variant="subheading">{replies.length ? plural(replies.length, 'reply', 'replies') : 'Replies'}</Txt>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.noReplies}>
            <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              No replies yet. Say something kind to {author.id === 'me' ? 'start the conversation' : author.name.split(' ')[0]}.
            </Txt>
          </View>
        }
        ListFooterComponent={replies.length ? <Txt variant="caption" color="textMuted" style={styles.end}>End of thread</Txt> : undefined}
      />

      <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <PhotoAvatar name={me.name} size={34} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Reply to @${author.handle}`}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`Reply to ${author.name}`}
          multiline
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
        />
        {used > POST_LIMIT - 40 ? (
          <Text style={[type.caption, { color: over ? colors.danger : colors.warning, fontWeight: '700' }]} accessibilityLabel={over ? `${used - POST_LIMIT} characters over the limit` : `${POST_LIMIT - used} characters left`}>
            {POST_LIMIT - used}
          </Text>
        ) : (
          <IconButton icon="expand-outline" label="Open full composer" color="textMuted" size={20} onPress={() => openCompose({ replyTo: post.id })} />
        )}
        <PressableScale
          haptic="tap"
          onPress={sendReply}
          disabled={!draft.trim() || over}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          accessibilityState={{ disabled: !draft.trim() || over }}
          style={[styles.send, { backgroundColor: colors.accent, opacity: !draft.trim() || over ? 0.4 : 1 }]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
        </PressableScale>
      </View>
      {overlays}
    </KeyboardAvoidingView>
  );
}

function Topbar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.topbar}>
      <IconButton icon="arrow-back" label="Back" onPress={onBack} />
      <Txt variant="heading">{title}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: space.xl },
  main: {
    marginHorizontal: space.md, marginBottom: space.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    paddingTop: space.xs,
  },
  connector: { position: 'absolute', left: space.lg + 21, top: 60, bottom: -12, width: 2, borderRadius: 1 },
  missing: { flexDirection: 'row', gap: space.xs, alignItems: 'center', margin: space.md, padding: space.sm, borderRadius: radius.sm },
  repliesHead: { paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  reply: { marginHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  noReplies: { padding: space.xl },
  end: { textAlign: 'center', paddingVertical: space.lg },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: space.md, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
