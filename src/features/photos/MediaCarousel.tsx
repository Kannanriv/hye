import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import type { PostMedia } from '@/domain/types';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const DOUBLE_TAP_MS = 280;

export const clampRatio = (r?: number) => Math.min(1.91, Math.max(0.8, r ?? 0.8));

export interface HeartBurstHandle { play: () => void }

/** Big heart that pops in the middle of a photo after a double-tap like. */
export const HeartBurst = forwardRef<HeartBurstHandle>(function HeartBurst(_, ref) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    play: () => {
      // Opacity is a fade, not motion, so it plays even with Reduce Motion; scale/lift do not.
      const never = { reduceMotion: ReduceMotion.Never };
      opacity.value = withSequence(withTiming(1, { duration: 120, ...never }), withDelay(reduce ? 500 : 420, withTiming(0, { duration: 260, ...never })));
      if (reduce) {
        scale.value = 1;
        lift.value = 0;
        return;
      }
      lift.value = 0;
      scale.value = withSequence(withSpring(1.15, { damping: 9, stiffness: 260 }), withSpring(1, { damping: 12 }), withDelay(260, withTiming(0.6, { duration: 260 })));
      lift.value = withDelay(560, withTiming(-40, { duration: 260 }));
    },
  }), [opacity, scale, lift, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: lift.value }, { scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.View style={style}>
        <Ionicons name="heart" size={104} color="#fff" style={styles.heartShadow} />
      </Animated.View>
    </View>
  );
});

/** Swipeable photos with dots, a 1/N counter, double-tap to like and optional single tap. */
export const MediaCarousel = memo(function MediaCarousel({ media, label, onDoubleTap, onPress, tint, onIndexChange }: {
  media: PostMedia[];
  /** Spoken description, e.g. "Photo by Maya Okafor". */
  label: string;
  onDoubleTap?: () => void;
  onPress?: () => void;
  /** Optional overlay colour (create-flow filters). */
  tint?: string;
  onIndexChange?: (i: number) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const burst = useRef<HeartBurstHandle>(null);
  const indexRef = useRef(0);
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratio = clampRatio(media[0]?.aspectRatio);
  const many = media.length > 1;

  useEffect(() => () => { if (single.current) clearTimeout(single.current); }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)), []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i === indexRef.current) return;
    indexRef.current = i;
    setIndex(i);
    onIndexChange?.(i);
  }, [width, onIndexChange]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (single.current) clearTimeout(single.current);
      burst.current?.play();
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (onPress) {
      if (single.current) clearTimeout(single.current);
      single.current = setTimeout(onPress, onDoubleTap ? DOUBLE_TAP_MS : 0);
    }
  }, [onDoubleTap, onPress]);

  const renderItem = useCallback(({ item, index: i }: { item: PostMedia; index: number }) => (
    <Pressable
      onPress={handleTap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={many ? `${label}, ${i + 1} of ${media.length}` : label}
      accessibilityHint={onPress ? 'Opens the photo and comments' : undefined}
      accessibilityActions={onDoubleTap ? [{ name: 'like', label: 'Like photo' }] : undefined}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'like') { burst.current?.play(); onDoubleTap?.(); }
      }}
      style={{ width, height: width / ratio }}
    >
      <Image
        source={{ uri: item.uri }}
        recyclingKey={item.uri}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]}
        contentFit="cover"
        transition={250}
        accessibilityIgnoresInvertColors
      />
      {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
    </Pressable>
  ), [handleTap, width, ratio, colors.surfaceAlt, tint, label, many, media.length, onPress, onDoubleTap]);

  return (
    <View onLayout={onLayout} style={{ width: '100%', aspectRatio: ratio, backgroundColor: colors.surfaceAlt }}>
      {width > 0 ? (
        <FlatList
          data={media}
          keyExtractor={(m, i) => `${i}:${m.uri}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          bounces={false}
          scrollEnabled={many}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          initialNumToRender={1}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          extraData={tint}
        />
      ) : null}
      {many ? (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1}/{media.length}</Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {media.map((m, i) => (
              <View key={`${i}:${m.uri}`} style={[styles.dot, i === index ? styles.dotOn : null]} />
            ))}
          </View>
        </>
      ) : null}
      <HeartBurst ref={burst} />
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  heartShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 4 } },
  counter: { position: 'absolute', top: space.md, right: space.md, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dots: { position: 'absolute', bottom: space.md, alignSelf: 'center', flexDirection: 'row', gap: 5, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 7, paddingVertical: 5, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: '#fff', transform: [{ scale: 1.2 }] },
});
