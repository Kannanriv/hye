import { ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// Circular progress ring built from two clipped half-circles (no SVG needed).
// Each half holds a circle whose border is coloured on one side only; rotating it reveals the arc.

export function LevelRing({ pct, size = 112, thickness = 8, color, track, reduceMotion, children }: {
  pct: number; size?: number; thickness?: number; color: string; track: string; reduceMotion?: boolean; children?: ReactNode;
}) {
  const progress = useSharedValue(reduceMotion ? pct : 0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, pct));
    progress.value = reduceMotion ? target : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pct, reduceMotion, progress]);

  const half = size / 2;
  const arc = { width: size, height: size, borderRadius: half, borderWidth: thickness, borderColor: 'transparent', borderTopColor: color, borderRightColor: color };

  // Right half shows 0..180°; the arc starts parked on the left (hidden) and swings in.
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-135 + 360 * Math.min(progress.value, 0.5)}deg` }],
  }));
  // Left half shows 180..360° once progress passes halfway.
  const leftStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.5 ? 1 : 0,
    transform: [{ rotate: `${45 + 360 * Math.max(progress.value - 0.5, 0)}deg` }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, borderWidth: thickness, borderColor: track }]} />
      <View style={[styles.clip, { left: half, width: half, height: size }]}>
        <Animated.View style={[arc, { position: 'absolute', left: -half }, rightStyle]} />
      </View>
      <View style={[styles.clip, { left: 0, width: half, height: size }]}>
        <Animated.View style={[arc, { position: 'absolute', left: 0 }, leftStyle]} />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
