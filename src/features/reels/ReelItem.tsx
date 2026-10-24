import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoSource, VideoView } from 'expo-video';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityActionEvent, ActivityIndicator, GestureResponderEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { compact, DemoPill, PhotoAvatar, PressableScale } from '@/components/premium';
import type { IconName } from '@/components/ui';
import type { Post } from '@/domain/types';
import { gradients, radius, space, type } from '@/theme/tokens';
import { HeartBurst } from './HeartBurst';
import { plural, ReelAuthor } from './people';

const DOUBLE_TAP_MS = 280;

export interface ReelItemProps {
  post: Post;
  author: ReelAuthor;
  width: number;
  height: number;
  /** This reel is the one on screen (others stay paused at the start). */
  current: boolean;
  /** Current, tab focused and not paused by the user. */
  playing: boolean;
  muted: boolean;
  reduceMotion: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onLike: (id: string, fromDoubleTap?: boolean) => void;
  onComment: (id: string) => void;
  onShare: (post: Post) => void;
  onSave: (id: string) => void;
  onFollow: (contactId: string) => void;
}

export const ReelItem = memo(function ReelItem(props: ReelItemProps) {
  const { post, author, width, height, current, playing, muted, reduceMotion } = props;
  const media = post.media[0];
  const uri = media?.uri ?? '';
  const source = useMemo<VideoSource>(() => ({ uri, useCaching: /^https?:/.test(uri) && Platform.OS !== 'web' }), [uri]);

  const player = useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const [held, setHeld] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const failed = status === 'error';
  const shouldPlay = playing && !held && !failed;

  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay]);

  useEffect(() => { player.muted = muted; }, [muted, player]);

  // Reels you swipe away start from the beginning next time.
  const progress = useSharedValue(0);
  useEffect(() => {
    if (current) return;
    try { player.currentTime = 0; } catch { /* not loaded yet */ }
    progress.value = 0;
  }, [current, player, progress]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const d = player.duration;
    if (!d) return;
    const next = Math.min(1, currentTime / d);
    progress.value = next < progress.value ? next : withTiming(next, { duration: 250, easing: Easing.linear });
  });

  const ready = firstFrame || (status === 'readyToPlay' && isPlaying);
  const posterOpacity = useSharedValue(1);
  useEffect(() => {
    posterOpacity.value = ready ? withTiming(0, { duration: reduceMotion ? 0 : 220 }) : 1;
  }, [posterOpacity, ready, reduceMotion]);
  const posterStyle = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const retry = useCallback(() => {
    setFirstFrame(false);
    player.replaceAsync(source).then(() => { if (playing) player.play(); }).catch(() => undefined);
  }, [player, playing, source]);

  // Tap: mute/unmute (with a flash of the speaker icon). Double tap: like. Hold: pause.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ scale: 0.8 + flash.value * 0.2 }] }));
  const lastTap = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (singleTimer.current) clearTimeout(singleTimer.current); }, []);

  const { onToggleMute, onLike, onTogglePause } = props;
  const toggleMuteWithFlash = useCallback(() => {
    onToggleMute();
    flash.value = withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 450 }), withTiming(0, { duration: 250 }));
  }, [flash, onToggleMute]);

  const doubleTap = useCallback((x: number, y: number) => {
    onLike(post.id, true);
    setBurst({ x, y, key: Date.now() });
  }, [onLike, post.id]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(t);
  }, [burst]);

  const onSurfacePress = useCallback((e: GestureResponderEvent) => {
    const now = Date.now();
    const { locationX, locationY } = e.nativeEvent;
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTimer.current) clearTimeout(singleTimer.current);
      lastTap.current = 0;
      doubleTap(locationX, locationY);
      return;
    }
    lastTap.current = now;
    singleTimer.current = setTimeout(toggleMuteWithFlash, DOUBLE_TAP_MS);
  }, [doubleTap, toggleMuteWithFlash]);

  const onA11yAction = useCallback((e: AccessibilityActionEvent) => {
    switch (e.nativeEvent.actionName) {
      case 'activate': onToggleMute(); break;
      case 'like': onLike(post.id); break;
      case 'pause': onTogglePause(); break;
    }
  }, [onLike, onToggleMute, onTogglePause, post.id]);

  const showPausedIcon = current && !failed && ready && (held || !playing);

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
        onFirstFrameRender={() => setFirstFrame(true)}
        accessible={false}
      />

      {/* Poster (blurred while loading) until the first frame is on screen. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, posterStyle]}>
        {media?.poster ? (
          <Image source={{ uri: media.poster }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={failed ? 30 : 12} transition={200} accessible={false} />
        ) : <View style={[StyleSheet.absoluteFill, styles.posterFallback]} />}
        {!failed && current && status !== 'readyToPlay' ? (
          <View style={styles.center}><ActivityIndicator color="#fff" size="large" accessibilityLabel="Loading reel" /></View>
        ) : null}
      </Animated.View>

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onSurfacePress}
        onLongPress={() => setHeld(true)}
        onPressOut={() => { if (held) setHeld(false); }}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={`Reel by ${author.name}. ${post.text}`}
        accessibilityHint={muted ? 'Unmutes sound' : 'Mutes sound'}
        accessibilityActions={[
          { name: 'activate', label: muted ? 'Unmute' : 'Mute' },
          { name: 'like', label: post.likes.includes('me') ? 'Unlike' : 'Like' },
          { name: 'pause', label: playing ? 'Pause' : 'Play' },
        ]}
        onAccessibilityAction={onA11yAction}
      />

      <Animated.View pointerEvents="none" style={[styles.center, flashStyle]}>
        <View style={styles.flashBubble}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={34} color="#fff" />
        </View>
      </Animated.View>

      {showPausedIcon ? (
        <View pointerEvents="none" style={styles.center}>
          <View style={styles.flashBubble}><Ionicons name="play" size={38} color="#fff" style={{ marginLeft: 4 }} /></View>
        </View>
      ) : null}

      {burst ? <HeartBurst key={burst.key} x={burst.x} y={burst.y} reduceMotion={reduceMotion} /> : null}

      {failed ? (
        <View style={styles.center}>
          <View style={styles.errorCard} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={30} color="#fff" />
            <Text style={[type.subheading, styles.white]}>Couldn’t play this reel</Text>
            <Text style={[type.small, styles.dim, { textAlign: 'center' }]}>Check your connection, then try again.</Text>
            <PressableScale accessibilityRole="button" accessibilityLabel="Try again" haptic="tap" onPress={retry} style={styles.retry}>
              <Ionicons name="refresh" size={18} color="#000" />
              <Text style={[type.subheading, { color: '#000' }]}>Try again</Text>
            </PressableScale>
          </View>
        </View>
      ) : null}

      <LinearGradient pointerEvents="none" colors={gradients.scrim} style={[styles.scrim, { height: Math.round(height * 0.45) }]} />

      <View style={styles.info} pointerEvents="box-none">
        <AuthorRow author={author} simulated={!!post.simulated} onFollow={props.onFollow} />
        {post.text ? <Caption text={post.text} /> : null}
        <AudioLine name={author.firstName} spinning={shouldPlay && isPlaying} reduceMotion={reduceMotion} views={post.views} />
      </View>

      <ActionRail post={post} reduceMotion={reduceMotion} onLike={onLike} onComment={props.onComment} onShare={props.onShare} onSave={props.onSave} />

      <View style={styles.progressTrack} pointerEvents="none" accessible={false}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
});

function AuthorRow({ author, simulated, onFollow }: { author: ReelAuthor; simulated: boolean; onFollow: (id: string) => void }) {
  return (
    <View style={styles.authorRow}>
      <PhotoAvatar name={author.name} uri={author.avatarUrl} size={36} />
      <Text style={[type.subheading, styles.white, styles.shadow, { flexShrink: 1 }]} numberOfLines={1}>{author.isMe ? 'You' : author.name}</Text>
      {simulated || author.isDemo ? <DemoPill /> : null}
      {author.isMe ? null : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={author.following ? `Following ${author.name}. Unfollow` : `Follow ${author.name}`}
          accessibilityState={{ selected: author.following }}
          haptic="select"
          hitSlop={8}
          onPress={() => onFollow(author.id)}
          style={[styles.follow, author.following && styles.following]}
        >
          {author.following ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          <Text style={[type.small, styles.white, { fontWeight: '700' }]}>{author.following ? 'Following' : 'Follow'}</Text>
        </PressableScale>
      )}
    </View>
  );
}

function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const parts = useMemo(() => text.split(/(#[\p{L}\p{N}_]+)/u), [text]);
  return (
    <Pressable
      onPress={() => setExpanded(e => !e)}
      disabled={!long && !expanded}
      accessibilityRole={long ? 'button' : 'text'}
      accessibilityLabel={text}
      accessibilityHint={long ? (expanded ? 'Collapses the caption' : 'Shows the full caption') : undefined}
      accessibilityState={long ? { expanded } : undefined}
      hitSlop={6}
    >
      <Text
        style={[type.small, styles.white, styles.shadow]}
        numberOfLines={expanded ? undefined : 2}
        onTextLayout={e => { if (!expanded) setLong(e.nativeEvent.lines.length >= 2 && text.length > 70); }}
      >
        {parts.map((p, i) => (p.startsWith('#') ? <Text key={i} style={{ fontWeight: '700' }}>{p}</Text> : p))}
      </Text>
      {long ? <Text style={[type.caption, styles.dim, { fontWeight: '700', marginTop: 2 }]}>{expanded ? 'Less' : 'More'}</Text> : null}
    </Pressable>
  );
}

function AudioLine({ name, spinning, reduceMotion, views }: { name: string; spinning: boolean; reduceMotion: boolean; views: number }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (spinning && !reduceMotion) {
      rotation.value = withRepeat(withTiming(rotation.value + 360, { duration: 5000, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(rotation);
    }
  }, [reduceMotion, rotation, spinning]);
  const disc = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <View style={styles.audioRow} accessible accessibilityLabel={`Original audio by ${name}. ${views} views`}>
      <Animated.View style={[styles.disc, disc]}>
        <Ionicons name="musical-notes" size={12} color="#fff" />
      </Animated.View>
      <Text style={[type.caption, styles.white, { flexShrink: 1 }]} numberOfLines={1}>Original audio · {name}</Text>
      <Text style={[type.caption, styles.dim]}>·</Text>
      <Ionicons name="play" size={11} color="rgba(255,255,255,0.8)" />
      <Text style={[type.caption, styles.dim]}>{compact(views)}</Text>
    </View>
  );
}

function ActionRail({ post, reduceMotion, onLike, onComment, onShare, onSave }: {
  post: Post; reduceMotion: boolean;
  onLike: (id: string) => void; onComment: (id: string) => void; onShare: (p: Post) => void; onSave: (id: string) => void;
}) {
  const liked = post.likes.includes('me');
  const likes = post.likes.length;
  const pop = useSharedValue(1);
  const prevLiked = useRef(liked);
  useEffect(() => {
    if (liked && !prevLiked.current && !reduceMotion) {
      pop.value = withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 }));
    }
    prevLiked.current = liked;
  }, [liked, pop, reduceMotion]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <View style={styles.rail}>
      <RailButton
        icon={liked ? 'heart' : 'heart-outline'}
        color={liked ? '#FF3B5C' : '#fff'}
        label={`${liked ? 'Unlike' : 'Like'}. ${plural(likes, 'like')}`}
        selected={liked}
        count={compact(likes)}
        onPress={() => onLike(post.id)}
        iconStyle={popStyle}
      />
      <RailButton icon="chatbubble-ellipses-outline" label={`Comments. ${plural(post.comments.length, 'comment')}`} count={compact(post.comments.length)} onPress={() => onComment(post.id)} />
      <RailButton icon="paper-plane-outline" label="Share" count="Share" onPress={() => onShare(post)} />
      <RailButton
        icon={post.saved ? 'bookmark' : 'bookmark-outline'}
        label={post.saved ? 'Saved. Remove from saved' : 'Save'}
        selected={post.saved}
        count={post.saved ? 'Saved' : 'Save'}
        onPress={() => onSave(post.id)}
      />
    </View>
  );
}

function RailButton({ icon, color = '#fff', label, count, onPress, selected, iconStyle }: {
  icon: IconName; color?: string; label: string; count: string; onPress: () => void; selected?: boolean;
  iconStyle?: ReturnType<typeof useAnimatedStyle>;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      scaleTo={0.88}
      onPress={onPress}
      style={styles.railBtn}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={icon} size={30} color={color} style={styles.shadow} />
      </Animated.View>
      <Text style={[type.caption, styles.white, styles.shadow, { fontWeight: '700' }]} numberOfLines={1}>{count}</Text>
    </PressableScale>
  );
}

const textShadow = { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  posterFallback: { backgroundColor: '#111' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  flashBubble: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  errorCard: { alignItems: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.6)', maxWidth: 300 },
  retry: { marginTop: space.sm, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  info: { position: 'absolute', left: space.lg, right: 84, bottom: space.xl, gap: space.sm },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  follow: {
    minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: '#fff',
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: space.xs,
  },
  following: { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disc: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#222', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: space.sm, bottom: space.xl, alignItems: 'center', gap: space.md },
  railBtn: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressFill: { height: 2, backgroundColor: '#fff' },
  white: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.8)' },
  shadow: textShadow,
});
