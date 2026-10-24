import { Ionicons } from '@expo/vector-icons';
import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { DemoPill, PhotoAvatar } from '@/components/premium';
import type { IconName } from '@/components/ui';
import type { Post } from '@/domain/types';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { demoPhotoPlace } from './demo';
import { MediaCarousel } from './MediaCarousel';
import { Person, plural, timeAgo } from './util';

export interface PhotoCardHandlers {
  onLike: (id: string) => void;
  /** Double-tap: only ever likes, never unlikes. */
  onDoubleLike: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (post: Post) => void;
  onSave: (id: string) => void;
  onOpen?: (id: string) => void;
  onAuthor?: (authorId: string) => void;
}

const CAPTION_CLAMP = 110;

function ActionIcon({ icon, label, onPress, color, children }: {
  icon: IconName; label: string; onPress: () => void; color: string; children?: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      {children ?? <Ionicons name={icon} size={26} color={color} />}
    </Pressable>
  );
}

/** One photo post: header, swipeable photos, actions, likes, caption and comment preview. */
export const PhotoPostCard = memo(function PhotoPostCard({ post, author, likedBy, latestComment, hasStory, detail, handlers }: {
  post: Post;
  author: Person;
  likedBy: string | null;
  /** Shown under the caption in the feed: "Maya: Love this". */
  latestComment?: { name: string; text: string } | null;
  hasStory?: boolean;
  /** Detail page: full caption, no comment preview. */
  detail?: boolean;
  handlers: PhotoCardHandlers;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(!!detail);
  const liked = post.likes.includes('me');
  const pop = useSharedValue(1);
  const wasLiked = useRef(liked);
  useEffect(() => {
    const changed = liked && !wasLiked.current;
    wasLiked.current = liked;
    if (changed) pop.value = withSequence(withSpring(1.3, { damping: 8, stiffness: 400 }), withSpring(1, { damping: 10 }));
  }, [liked, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const place = demoPhotoPlace(post.id) ?? (post.authorId === 'me' ? (post.audience === 'contacts' ? 'Shared with your contacts' : 'Shared with everyone') : undefined);
  const long = post.text.length > CAPTION_CLAMP || post.text.includes('\n');
  const n = post.comments.length;
  const likeCount = post.likes.length;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasStory ? `${author.name}'s story` : author.name}
          disabled={!hasStory || !handlers.onAuthor}
          onPress={() => handlers.onAuthor?.(post.authorId)}
          hitSlop={6}
        >
          <PhotoAvatar name={author.name} uri={author.avatarUrl} size={36} ring={hasStory} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={[type.small, styles.bold, { color: colors.text }]} numberOfLines={1}>{author.name}</Text>
            {post.simulated || author.isDemo ? <DemoPill /> : null}
          </View>
          {place ? <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>{place}</Text> : null}
        </View>
        {handlers.onOpen && !detail ? (
          <ActionIcon icon="ellipsis-horizontal" label="Open photo details" color={colors.textMuted} onPress={() => handlers.onOpen?.(post.id)} />
        ) : null}
      </View>

      <MediaCarousel
        media={post.media}
        label={`Photo by ${author.name}${post.text ? `: ${post.text.slice(0, 80)}` : ''}`}
        onDoubleTap={() => handlers.onDoubleLike(post.id)}
        onPress={handlers.onOpen && !detail ? () => handlers.onOpen?.(post.id) : undefined}
      />

      <View style={styles.actions}>
        <ActionIcon
          icon="heart-outline"
          label={`${liked ? 'Unlike' : 'Like'}, ${plural(likeCount, 'like')}`}
          color={colors.text}
          onPress={() => handlers.onLike(post.id)}
        >
          <Animated.View style={popStyle}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={27} color={liked ? colors.danger : colors.text} />
          </Animated.View>
        </ActionIcon>
        <ActionIcon icon="chatbubble-outline" label={`Comment, ${plural(n, 'comment')}`} color={colors.text} onPress={() => handlers.onComment(post.id)} />
        <ActionIcon icon="paper-plane-outline" label="Share" color={colors.text} onPress={() => handlers.onShare(post)} />
        <View style={{ flex: 1 }} />
        <ActionIcon
          icon={post.saved ? 'bookmark' : 'bookmark-outline'}
          label={post.saved ? 'Remove from saved' : 'Save'}
          color={colors.text}
          onPress={() => handlers.onSave(post.id)}
        />
      </View>

      <View style={styles.body}>
        {likedBy ? (
          <Text style={[type.small, styles.bold, { color: colors.text }]} accessibilityLabel={`${likedBy}. ${plural(likeCount, 'like')}`}>{likedBy}</Text>
        ) : (
          <Text style={[type.small, { color: colors.textMuted }]}>Be the first to like this</Text>
        )}
        {post.text ? (
          <Text style={[type.small, { color: colors.text }]} numberOfLines={expanded ? undefined : 2}>
            <Text style={styles.bold}>{author.name.split(' ')[0]} </Text>
            {post.text}
          </Text>
        ) : null}
        {long && !expanded ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Show full caption" onPress={() => setExpanded(true)} hitSlop={8} style={styles.more}>
            <Text style={[type.small, { color: colors.textMuted, fontWeight: '600' }]}>more</Text>
          </Pressable>
        ) : null}
        {!detail && n > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`View all ${plural(n, 'comment')}`} onPress={() => handlers.onComment(post.id)} hitSlop={6} style={styles.more}>
            <Text style={[type.small, { color: colors.textMuted }]}>{n === 1 ? 'View 1 comment' : `View all ${n} comments`}</Text>
          </Pressable>
        ) : null}
        {!detail && latestComment ? (
          <Text style={[type.small, { color: colors.text }]} numberOfLines={1}>
            <Text style={styles.bold}>{latestComment.name} </Text>
            {latestComment.text}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>{timeAgo(post.createdAt)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingTop: space.xs },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.md, paddingBottom: space.md, gap: 4 },
  more: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center' },
});
