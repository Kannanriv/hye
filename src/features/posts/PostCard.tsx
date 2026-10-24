import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DemoPill, PhotoAvatar, PressableScale, compact } from '@/components/premium';
import type { Post } from '@/domain/types';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { formatDateTime } from '@/utils/time';
import { ActionButton } from './ActionButton';
import { Author, plural, relativeTime, relativeTimeLong } from './helpers';
import { RichText } from './RichText';

export interface PostHandlers {
  open: (id: string) => void;
  avatar: (authorId: string) => void;
  mention: (handle: string) => void;
  menu: (id: string) => void;
  reply: (id: string) => void;
  like: (id: string) => void;
  repost: (id: string) => void;
  save: (id: string) => void;
  share: (id: string) => void;
}

/** Media frame for a post's single image. Very tall or very wide images are clamped. */
export function PostImage({ uri, aspectRatio, rounded = radius.md }: { uri: string; aspectRatio?: number; rounded?: number }) {
  const { colors } = useTheme();
  const ratio = Math.min(1.9, Math.max(0.8, aspectRatio ?? 1.5));
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: rounded, backgroundColor: colors.surfaceAlt }}
      contentFit="cover"
      transition={220}
      cachePolicy="memory-disk"
      accessibilityLabel="Photo attached to the post"
    />
  );
}

/** Compact embedded post used for quotes (in cards and in the composer). */
export const QuoteEmbed = memo(function QuoteEmbed({ post, author, now, onPress }: {
  post?: Post; author?: Author; now: number; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = !post || !author ? (
    <Text style={[type.small, { color: colors.textMuted }]}>This post is no longer available.</Text>
  ) : (
    <>
      <View style={styles.quoteHead}>
        <PhotoAvatar name={author.name} uri={author.avatarUrl} size={20} />
        <Text style={[type.small, styles.name, { color: colors.text }]} numberOfLines={1}>{author.name}</Text>
        {post.simulated ? <DemoPill /> : null}
        <Text style={[type.small, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>@{author.handle} · {relativeTime(post.createdAt, now)}</Text>
      </View>
      <RichText text={post.text} numberOfLines={4} style={type.small} />
      {post.media[0]?.kind === 'image' ? <View style={{ marginTop: space.sm }}><PostImage uri={post.media[0].uri} aspectRatio={post.media[0].aspectRatio} rounded={radius.sm} /></View> : null}
    </>
  );
  const frame = [styles.quote, { borderColor: colors.border, backgroundColor: colors.bg }];
  if (!onPress || !post) return <View style={frame}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Quoted post from ${author?.name}: ${post.text}`}
      style={({ pressed }) => [frame, pressed && { opacity: 0.75 }]}
    >
      {body}
    </Pressable>
  );
});

/**
 * A post in the feed or a thread. `focus` renders the larger "main post" layout of a thread.
 * All callbacks come from `usePostHandlers` so they're stable and the card stays memoised.
 */
export const PostCard = memo(function PostCard({
  post, author, quoted, quotedAuthor, replyCount, now, h, replyingTo, focus, flat,
}: {
  post: Post; author: Author; quoted?: Post; quotedAuthor?: Author; replyCount: number; now: number;
  h: PostHandlers; replyingTo?: string; focus?: boolean; flat?: boolean;
}) {
  const { colors } = useTheme();
  const liked = post.likes.includes('me');
  const reposted = post.reposts.includes('me');
  const image = post.media.find(m => m.kind === 'image');
  const time = relativeTimeLong(post.createdAt, now);

  const a11yLabel = [
    `${author.name}${post.simulated ? ', demo account' : ''}`,
    focus ? formatDateTime(post.createdAt) : time,
    replyingTo ? `replying to ${replyingTo}` : '',
    post.text,
    image ? 'with a photo' : '',
    quoted && quotedAuthor ? `quoting ${quotedAuthor.name}: ${quoted.text}` : '',
  ].filter(Boolean).join('. ');

  const header = (
    <View style={styles.header}>
      <Text style={[type.subheading, styles.name, { color: colors.text }]} numberOfLines={1}>{author.name}</Text>
      {post.simulated ? <DemoPill /> : null}
      {post.audience === 'contacts' ? <Ionicons name="people" size={13} color={colors.textMuted} accessibilityLabel="Contacts only" /> : null}
      {focus ? null : (
        <Text style={[type.small, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
          @{author.handle} · {relativeTime(post.createdAt, now)}
        </Text>
      )}
    </View>
  );

  return (
    <PressableScale
      accessible={false}
      scaleTo={0.985}
      onPress={focus ? undefined : () => h.open(post.id)}
      onLongPress={() => h.menu(post.id)}
      delayLongPress={350}
      style={[
        styles.card,
        flat ? styles.flat : [styles.raised, { backgroundColor: colors.surface, borderColor: colors.border }],
      ]}
    >
      {reposted && !focus ? (
        <View style={styles.repostedBy}>
          <Ionicons name="repeat" size={13} color={colors.success} />
          <Text style={[type.caption, { color: colors.textMuted, fontWeight: '600' }]}>You reposted</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={() => h.avatar(post.authorId)}
          accessibilityRole="button"
          accessibilityLabel={`View ${author.name}'s profile`}
          hitSlop={4}
          style={styles.avatarHit}
        >
          <PhotoAvatar name={author.name} uri={author.avatarUrl} size={focus ? 48 : 44} />
        </Pressable>
        <View style={styles.main}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityHint={focus ? undefined : 'Opens the thread'}
            accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'More options' }]}
            onAccessibilityAction={e => (e.nativeEvent.actionName === 'longpress' ? h.menu(post.id) : !focus && h.open(post.id))}
          >
            {focus ? (
              <View>
                {header}
                <Text style={[type.small, { color: colors.textMuted }]}>@{author.handle}</Text>
              </View>
            ) : header}
            {replyingTo ? (
              <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                Replying to <Text style={{ color: colors.accent }}>@{replyingTo}</Text>
              </Text>
            ) : null}
            {post.text ? (
              <RichText text={post.text} onMention={h.mention} style={focus ? styles.focusText : styles.text} />
            ) : null}
            {image ? <View style={styles.media}><PostImage uri={image.uri} aspectRatio={image.aspectRatio} /></View> : null}
            {post.quoteOfId ? (
              <View style={styles.media}>
                <QuoteEmbed post={quoted} author={quotedAuthor} now={now} onPress={quoted ? () => h.open(quoted.id) : undefined} />
              </View>
            ) : null}
            {focus ? (
              <>
                <Text style={[type.small, { color: colors.textMuted, marginTop: space.md }]}>
                  {formatDateTime(post.createdAt)} · <Text style={{ color: colors.text, fontWeight: '700' }}>{compact(post.views)}</Text> views
                </Text>
                <View style={[styles.stats, { borderColor: colors.border }]}>
                  <Stat n={post.reposts.length} label="Reposts" />
                  <Stat n={replyCount} label="Replies" />
                  <Stat n={post.likes.length} label="Likes" />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <ActionButton icon="chatbubble-outline" count={replyCount} label={`Reply. ${plural(replyCount, 'reply', 'replies')}`} onPress={() => h.reply(post.id)} />
        <ActionButton
          icon="repeat" active={reposted} count={post.reposts.length} activeColor={colors.success} effect="spin"
          label={`${reposted ? 'Undo repost' : 'Repost'}. ${plural(post.reposts.length, 'repost')}`} onPress={() => h.repost(post.id)}
        />
        <ActionButton
          icon="heart-outline" activeIcon="heart" active={liked} count={post.likes.length} activeColor={colors.danger} effect="pop"
          label={`${liked ? 'Unlike' : 'Like'}. ${plural(post.likes.length, 'like')}`} onPress={() => h.like(post.id)}
        />
        {focus ? null : <ActionButton icon="stats-chart-outline" count={post.views} label={plural(post.views, 'view')} size={16} />}
        <View style={styles.trailing}>
          <ActionButton
            icon="bookmark-outline" activeIcon="bookmark" active={post.saved} effect="bounce"
            label={post.saved ? 'Remove bookmark' : 'Bookmark'} onPress={() => h.save(post.id)}
          />
          <ActionButton icon="share-outline" label="Share" onPress={() => h.share(post.id)} />
        </View>
      </View>
    </PressableScale>
  );
});

function Stat({ n, label }: { n: number; label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.small, { color: colors.textMuted }]}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{compact(n)}</Text> {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  raised: {
    marginHorizontal: space.md, marginBottom: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  flat: {},
  repostedBy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 30, marginBottom: 4 },
  row: { flexDirection: 'row', gap: space.md },
  avatarHit: { alignSelf: 'flex-start' },
  main: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, maxWidth: '60%' },
  text: { marginTop: 2 },
  focusText: { marginTop: space.md, fontSize: 19, lineHeight: 27 },
  media: { marginTop: space.sm },
  stats: { flexDirection: 'row', gap: space.lg, marginTop: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginHorizontal: -10 },
  trailing: { flexDirection: 'row' },
  quote: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, gap: 4 },
  quoteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
