import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/useTheme';

/**
 * Circular character-count ring drawn with two clipped half-rings (no SVG needed).
 * Turns amber in the last 20 characters and red past the limit, where it shows how many to remove.
 */
export function ProgressRing({ used, limit, size = 28, stroke = 3 }: { used: number; limit: number; size?: number; stroke?: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);
  const left = limit - used;
  const warn = left <= 20;
  const over = left < 0;
  const color = over ? colors.danger : warn ? colors.warning : colors.accent;

  useEffect(() => {
    const target = Math.min(1, used / limit);
    progress.value = reduceMotion ? target : withTiming(target, { duration: 160 });
  }, [used, limit, progress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withSpring(warn ? 1.25 : 1, { damping: 12, stiffness: 260 });
  }, [warn, scale, reduceMotion]);

  // Each half shows a semicircle arc (top + right borders coloured) rotated into view.
  const rightStyle = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value * 2);
    return { transform: [{ rotate: `${-135 + 180 * p}deg` }] };
  });
  const leftStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.value * 2 - 1));
    return { transform: [{ rotate: `${45 + 180 * p}deg` }] };
  });
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const circle = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  const arc = [circle, { borderColor: 'transparent', borderTopColor: color, borderRightColor: color }];
  const half = size / 2;

  return (
    <Animated.View
      style={[{ width: size, height: size }, wrapStyle]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={over ? `${-left} characters over the limit` : `${left} characters left`}
      accessibilityValue={{ min: 0, max: limit, now: Math.min(used, limit) }}
    >
      <View style={[StyleSheet.absoluteFill, circle, { borderColor: colors.border }]} />
      <View style={[styles.clip, { left: half, width: half, height: size }]}>
        <Animated.View style={[arc, { position: 'absolute', left: -half }, rightStyle]} />
      </View>
      <View style={[styles.clip, { left: 0, width: half, height: size }]}>
        <Animated.View style={[arc, { position: 'absolute', left: 0 }, leftStyle]} />
      </View>
      {warn ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ fontSize: 9, fontWeight: '700', color }}>{left}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
