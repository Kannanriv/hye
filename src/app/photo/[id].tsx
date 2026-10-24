import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ComponentRef, memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemoPill, PhotoAvatar, useHaptics } from '@/components/premium';
import { ConfirmDialog, EmptyState, IconButton, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Comment } from '@/domain/types';
import { PhotoPostCard } from '@/features/photos/PhotoPostCard';
import { storyImages } from '@/features/photos/stories';
import { usePhotoActions } from '@/features/photos/usePhotoActions';
import { go, likedByLine, Person, timeShort, usePeople } from '@/features/photos/util';
import { useStore } from '@/state/store';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const QUICK = ['❤️', '🙌', '🔥', '😍', '👏', '😂'];

const CommentRow = memo(function CommentRow({ comment, author }: { comment: Comment; author: Person }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.comment} accessible accessibilityLabel={`${author.name}${author.isDemo ? ', demo' : ''}: ${comment.text}. ${timeShort(comment.createdAt)}`}>
      <PhotoAvatar name={author.name} uri={author.avatarUrl} size={34} />
      <View style={styles.commentBody}>
        <View style={styles.nameRow}>
          <Text style={[type.small, styles.bold, { color: colors.text }]}>{author.name}</Text>
          {author.isDemo ? <DemoPill /> : null}
          <Text style={[type.caption, { color: colors.textMuted }]}>{timeShort(comment.createdAt)}</Text>
        </View>
        <Text style={[type.small, { color: colors.text }]}>{comment.text}</Text>
      </View>
    </Animated.View>
  );
});

export default function PhotoDetail() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const person = usePeople();
  const handlers = usePhotoActions();
  const buzz = useHaptics();
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const list = useRef<FlatList<Comment>>(null);
  const post = state.posts.find(p => p.id === id);

  // On the detail page, "comment" focuses the composer instead of navigating.
  const detailHandlers = useMemo(() => ({ ...handlers, onComment: () => input.current?.focus(), onOpen: undefined }), [handlers]);

  const send = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !post) return;
    dispatch({ type: 'addComment', id: post.id, comment: { id: newId('cmt'), authorId: 'me', text: clean, createdAt: new Date().toISOString() } });
    buzz('tap');
    setDraft('');
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
  }, [post, dispatch, buzz]);

  const renderItem = useCallback(({ item }: { item: Comment }) => <CommentRow comment={item} author={person(item.authorId)} />, [person]);

  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="arrow-back" label="Back" onPress={go.back} />
      <Txt variant="heading" style={{ flex: 1 }}>Photo</Txt>
      {post?.authorId === 'me' ? <IconButton icon="trash-outline" label="Delete photo" color="danger" onPress={() => setConfirmDelete(true)} /> : null}
    </View>
  );

  if (!post) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        {header}
        <EmptyState icon="image-outline" title="This photo isn’t available" body="It may have been deleted." />
      </View>
    );
  }

  const author = person(post.authorId);
  const n = post.comments.length;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        {header}
        <FlatList
          ref={list}
          data={post.comments}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: space.lg }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: space.md, paddingHorizontal: space.md }}>
              <PhotoPostCard
                post={post}
                author={author}
                likedBy={likedByLine(post, person)}
                hasStory={storyImages(post.authorId).length > 0}
                detail
                handlers={detailHandlers}
              />
              <Text accessibilityRole="header" style={[type.subheading, { color: colors.text, paddingHorizontal: space.xs }]}>
                {n ? `Comments · ${n}` : 'Comments'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={[type.small, { color: colors.textMuted, paddingHorizontal: space.lg, paddingVertical: space.md }]}>
              No comments yet. Say something kind to {author.firstName === 'You' ? 'yourself' : author.firstName}.
            </Text>
          }
        />
        <View style={[styles.composerWrap, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quick}>
            {QUICK.map(e => (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Comment ${e}`} onPress={() => send(e)} style={styles.quickBtn}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <PhotoAvatar name={person('me').name} size={32} />
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              placeholder={`Add a comment for ${author.firstName === 'You' ? 'your photo' : author.firstName}…`}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Add a comment"
              autoFocus={focus === '1'}
              multiline
              maxLength={500}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: !draft.trim() }}
              disabled={!draft.trim()}
              onPress={() => send(draft)}
              style={styles.sendBtn}
            >
              {draft.trim() ? (
                <Text style={[type.subheading, { color: colors.accent }]}>Post</Text>
              ) : (
                <Ionicons name="send" size={20} color={colors.textMuted} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this photo?"
        body="It will be removed from hye for you and your contacts, along with its likes and comments. This can’t be undone."
        confirmLabel="Delete photo"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          dispatch({ type: 'deletePost', id: post.id });
          go.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs },
  list: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  comment: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  commentBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bold: { fontWeight: '700' },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth },
  quick: { paddingHorizontal: space.md, gap: space.xs, paddingTop: space.xs },
  quickBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, width: '100%', maxWidth: 640, alignSelf: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
  sendBtn: { minWidth: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
});
