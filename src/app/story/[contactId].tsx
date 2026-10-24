import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DemoPill, PhotoAvatar } from '@/components/premium';
import { markStorySeen, storyContactIds, storyImages } from '@/features/photos/stories';
import { go, usePeople } from '@/features/photos/util';
import { space, type } from '@/theme/tokens';

const PER_IMAGE_MS = 5000;
const CLOSE_DRAG = 110;

function Segment({ state, progress }: { state: 'done' | 'active' | 'todo'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'active' ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fill]} />
    </View>
  );
}

export default function StoryViewer() {
  const params = useLocalSearchParams<{ contactId: string }>();
  const insets = useSafeAreaInsets();
  const person = usePeople();
  const reduceMotion = useReducedMotion();
  const [contactId, setContactId] = useState(String(params.contactId ?? ''));
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const images = useMemo(() => storyImages(contactId), [contactId]);
  const who = person(contactId);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (contactId) markStorySeen(contactId);
  }, [contactId]);

  const close = useCallback(() => go.back(), []);
  // Screen reader users move through photos with the Previous/Next buttons, at their own pace.
  const auto = !screenReader;
  const nextRef = useRef<() => void>(() => undefined);
  const onFinished = useCallback(() => nextRef.current(), []);

  const run = useCallback((from: number) => {
    // Progress is a timer, not decorative motion, so it runs even with Reduce Motion on.
    progress.value = from;
    progress.value = withTiming(1, { duration: (1 - from) * PER_IMAGE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, done => {
      if (done) scheduleOnRN(onFinished);
    });
  }, [progress, onFinished]);

  const next = useCallback(() => {
    if (index < images.length - 1) {
      setIndex(i => i + 1);
      return;
    }
    const at = storyContactIds.indexOf(contactId);
    const following = storyContactIds[at + 1];
    if (following) {
      setContactId(following);
      setIndex(0);
    } else close();
  }, [index, images.length, contactId, close]);

  const prev = useCallback(() => {
    if (index > 0) setIndex(i => i - 1);
    else {
      const at = storyContactIds.indexOf(contactId);
      const before = storyContactIds[at - 1];
      if (before) {
        setContactId(before);
        setIndex(0);
      } else if (loaded && !paused && auto) run(0);
      else progress.value = 0;
    }
  }, [index, contactId, progress, loaded, paused, auto, run]);
  nextRef.current = next;

  // New photo: reset and wait for it to load before the timer starts.
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    setLoaded(false);
    const upcoming = images[index + 1];
    if (upcoming) Image.prefetch(upcoming).catch(() => undefined);
  }, [index, images, progress]);

  useEffect(() => {
    if (!loaded || paused || !auto) {
      cancelAnimation(progress);
      return;
    }
    run(progress.value >= 1 ? 0 : progress.value);
  }, [loaded, paused, auto, run, progress]);

  const holding = useRef(false);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderGrant: () => setPaused(true),
    onPanResponderMove: (_, g) => { dragY.value = Math.max(0, g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > CLOSE_DRAG || g.vy > 1.2) {
        close();
        return;
      }
      dragY.value = reduceMotion ? 0 : withSpring(0, { damping: 18 });
      setPaused(false);
    },
    onPanResponderTerminate: () => {
      dragY.value = 0;
      setPaused(false);
    },
  }), [close, dragY, reduceMotion]);

  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }, { scale: 1 - Math.min(dragY.value, 300) / 3000 }],
    borderRadius: dragY.value > 0 ? 18 : 0,
  }));

  if (!images.length) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.subheading, { color: '#fff' }]}>This story isn’t available</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.textBtn}>
          <Text style={[type.subheading, { color: '#fff' }]}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const uri = images[Math.min(index, images.length - 1)];

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <Animated.View style={[styles.flex, styles.sheet, sheet]}>
        <Image
          key={uri}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduceMotion ? 0 : 200}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${who.name}'s story, photo ${index + 1} of ${images.length}`}
          accessibilityIgnoresInvertColors
        />
        {!loaded ? <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} accessibilityLabel="Loading photo" /> : null}
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={[styles.topScrim, { height: insets.top + 120 }]} pointerEvents="none" />

        {/* Tap zones: left third goes back, the rest goes forward; press and hold pauses. */}
        <View style={styles.zones}>
          <Pressable
            style={{ flex: 1 }}
            onPress={prev}
            onLongPress={() => { holding.current = true; setPaused(true); }}
            onPressOut={() => { if (holding.current) { holding.current = false; setPaused(false); } }}
            delayLongPress={180}
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
          />
          <Pressable
            style={{ flex: 2 }}
            onPress={next}
            onLongPress={() => { holding.current = true; setPaused(true); }}
            onPressOut={() => { if (holding.current) { holding.current = false; setPaused(false); } }}
            delayLongPress={180}
            accessibilityRole="button"
            accessibilityLabel={index < images.length - 1 ? 'Next photo' : 'Next story'}
          />
        </View>

        <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
          <View style={styles.bars} accessibilityLabel={`Photo ${index + 1} of ${images.length}`}>
            {images.map((img, i) => (
              <Segment key={`${contactId}:${img}`} progress={progress} state={i < index ? 'done' : i === index ? 'active' : 'todo'} />
            ))}
          </View>
          <View style={styles.headerRow} pointerEvents="box-none">
            <PhotoAvatar name={who.name} uri={who.avatarUrl} size={34} />
            <Text style={[type.subheading, styles.name]} numberOfLines={1}>{who.name}</Text>
            {who.isDemo ? <DemoPill /> : null}
            {paused ? <Ionicons name="pause" size={16} color="#fff" accessibilityLabel="Paused" /> : null}
            <View style={styles.flex} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Resume story' : 'Pause story'}
              onPress={() => setPaused(p => !p)}
              hitSlop={4}
              style={styles.iconBtn}
            >
              <Ionicons name={paused ? 'play' : 'pause'} size={22} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close stories" onPress={close} hitSlop={4} style={styles.iconBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.lg },
  sheet: { overflow: 'hidden', backgroundColor: '#111' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  zones: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.sm, gap: space.sm },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: 2 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  segmentFill: { height: 3, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xs },
  name: { color: '#fff', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textBtn: { minHeight: 44, paddingHorizontal: space.lg, justifyContent: 'center' },
});
