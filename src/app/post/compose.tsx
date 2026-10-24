import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, PhotoAvatar, useHaptics } from '@/components/premium';
import { ConfirmDialog, IconButton, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Post, PostMedia } from '@/domain/types';
import { charCount, POST_LIMIT, UNKNOWN_AUTHOR, useAuthors } from '@/features/posts/helpers';
import { PostImage, QuoteEmbed } from '@/features/posts/PostCard';
import { ProgressRing } from '@/features/posts/ProgressRing';
import { RichText } from '@/features/posts/RichText';
import { useStore } from '@/state/store';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function ComposeScreen() {
  const { replyTo, quote } = useLocalSearchParams<{ replyTo?: string; quote?: string }>();
  const { state, dispatch } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const authors = useAuthors(state);
  const now = Date.now();

  const parent = useMemo(() => (replyTo ? state.posts.find(p => p.id === replyTo) : undefined), [replyTo, state.posts]);
  const quoted = useMemo(() => (quote ? state.posts.find(p => p.id === quote) : undefined), [quote, state.posts]);
  const parentAuthor = parent ? authors.get(parent.authorId) ?? UNKNOWN_AUTHOR : undefined;

  const [text, setText] = useState(() => (parentAuthor && parent?.authorId !== 'me' ? `@${parentAuthor.handle} ` : ''));
  const [media, setMedia] = useState<PostMedia | null>(null);
  const [audience, setAudience] = useState<Post['audience']>('everyone');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const used = charCount(text);
  const over = used > POST_LIMIT;
  const empty = !text.trim() && !media;
  const me = authors.get('me') ?? UNKNOWN_AUTHOR;
  const mode = parent ? 'reply' : quoted ? 'quote' : 'post';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/posts' as never));
  const cancel = () => (empty || text.trim() === `@${parentAuthor?.handle}` ? close() : setConfirmDiscard(true));

  const pickPhoto = async () => {
    setPickError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      buzz('select');
      setMedia({ kind: 'image', uri: a.uri, aspectRatio: a.width && a.height ? a.width / a.height : undefined });
    } catch {
      setPickError('We couldn’t open your photos. Check that hye can access them in your phone’s settings.');
    }
  };

  const submit = () => {
    if (empty || over) return;
    const post: Post = {
      id: newId('post'),
      kind: 'text',
      authorId: 'me',
      text: text.trim(),
      media: media ? [media] : [],
      createdAt: new Date().toISOString(),
      likes: [],
      reposts: [],
      comments: [],
      replyToId: parent?.id,
      quoteOfId: quoted?.id,
      saved: false,
      views: 0,
      audience,
    };
    dispatch({ type: 'addPost', post });
    buzz('success');
    close();
  };

  const cta = mode === 'reply' ? 'Reply' : 'Post';
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, space.md), borderColor: colors.border }]}>
        <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.cancel} hitSlop={8}>
          <Text style={[type.subheading, { color: colors.text }]}>Cancel</Text>
        </Pressable>
        <Txt variant="subheading">{mode === 'reply' ? 'Reply' : mode === 'quote' ? 'Quote post' : 'New post'}</Txt>
        <GradientButton label={cta} onPress={submit} disabled={empty || over} style={styles.cta} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {parent && parentAuthor ? (
          <Animated.View entering={FadeIn} style={styles.parent}>
            <View style={styles.parentRail}>
              <PhotoAvatar name={parentAuthor.name} uri={parentAuthor.avatarUrl} size={36} />
              <View style={[styles.rail, { backgroundColor: colors.border }]} />
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: space.md }}>
              <Text style={[type.small, { color: colors.text, fontWeight: '700' }]}>
                {parentAuthor.name} <Text style={{ color: colors.textMuted, fontWeight: '400' }}>@{parentAuthor.handle}</Text>
              </Text>
              <RichText text={parent.text} numberOfLines={4} style={type.small} />
              <Text style={[type.small, { color: colors.textMuted, marginTop: space.xs }]}>
                Replying to <Text style={{ color: colors.accent }}>@{parentAuthor.handle}</Text>
              </Text>
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.row}>
          <PhotoAvatar name={me.name} size={40} />
          <View style={{ flex: 1, gap: space.md }}>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              multiline
              placeholder={mode === 'reply' ? 'Post your reply' : mode === 'quote' ? 'Add your thoughts' : 'What’s on your mind?'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={mode === 'reply' ? 'Your reply' : 'Your post'}
              accessibilityHint={`Up to ${POST_LIMIT} characters`}
              style={[styles.input, { color: colors.text }]}
              textAlignVertical="top"
            />
            {media ? (
              <Animated.View entering={ZoomIn.springify().damping(15)} exiting={ZoomOut.duration(150)}>
                {media.uri.startsWith('http') ? (
                  <PostImage uri={media.uri} aspectRatio={media.aspectRatio} />
                ) : (
                  <Image
                    source={{ uri: media.uri }}
                    style={{ width: '100%', aspectRatio: Math.min(1.9, Math.max(0.8, media.aspectRatio ?? 1.5)), borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
                    contentFit="cover"
                    transition={200}
                    accessibilityLabel="Selected photo"
                  />
                )}
                <Pressable
                  onPress={() => setMedia(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  style={styles.removeImg}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </Pressable>
              </Animated.View>
            ) : null}
            {quoted ? (
              <QuoteEmbed post={quoted} author={authors.get(quoted.authorId)} now={now} />
            ) : quote ? (
              <QuoteEmbed now={now} />
            ) : null}
            {over ? (
              <Animated.View entering={FadeInDown.duration(160)}>
                <Txt variant="small" color="danger">
                  {`Posts can be up to ${POST_LIMIT} characters. Remove ${used - POST_LIMIT} to post.`}
                </Txt>
              </Animated.View>
            ) : null}
            {pickError ? <Txt variant="small" color="danger">{pickError}</Txt> : null}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.toolbar, { borderColor: colors.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <Pressable
          onPress={() => { buzz('select'); setAudience(a => (a === 'everyone' ? 'contacts' : 'everyone')); }}
          accessibilityRole="button"
          accessibilityLabel={`Audience: ${audience === 'everyone' ? 'everyone can see and reply' : 'only your contacts can see this'}. Double tap to change.`}
          style={[styles.audience, { backgroundColor: colors.accentSoft }]}
        >
          <Ionicons name={audience === 'everyone' ? 'earth' : 'people'} size={15} color={colors.accent} />
          <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
            {audience === 'everyone' ? 'Everyone can see and reply' : 'Contacts only'}
          </Text>
        </Pressable>
        <View style={styles.tools}>
          <IconButton icon={media ? 'image' : 'image-outline'} label={media ? 'Replace photo' : 'Add a photo'} onPress={pickPhoto} color="accent" />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <ProgressRing used={used} limit={POST_LIMIT} />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDiscard}
        title={mode === 'reply' ? 'Discard reply?' : 'Discard post?'}
        body="What you’ve written won’t be saved."
        confirmLabel="Discard"
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); close(); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cta: { minWidth: 84 },
  body: { padding: space.lg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  parent: { flexDirection: 'row', gap: space.md },
  parentRail: { alignItems: 'center', width: 40 },
  rail: { width: 2, flex: 1, marginTop: space.xs, borderRadius: 1 },
  row: { flexDirection: 'row', gap: space.md },
  input: { fontSize: 18, lineHeight: 25, minHeight: 120, paddingTop: space.sm },
  removeImg: {
    position: 'absolute', top: space.sm, right: space.sm, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth, gap: space.md,
  },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill, flexShrink: 1 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sep: { width: StyleSheet.hairlineWidth, height: 24 },
});
