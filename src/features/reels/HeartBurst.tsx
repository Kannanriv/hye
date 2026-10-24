import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

const SIZE = 110;

/** Big heart that pops where the user double-tapped, then floats up and fades. */
export function HeartBurst({ x, y, reduceMotion }: { x: number; y: number; reduceMotion: boolean }) {
  const scale = useSharedValue(reduceMotion ? 1 : 0.2);
  const opacity = useSharedValue(reduceMotion ? 0 : 1);
  const lift = useSharedValue(0);
  const tilt = (x % 2 === 0 ? 1 : -1) * 12;

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(350, withTiming(0, { duration: 200 })));
      return;
    }
    scale.value = withSequence(withSpring(1.15, { damping: 9, stiffness: 260 }), withTiming(1, { duration: 120 }));
    lift.value = withDelay(380, withTiming(-90, { duration: 420, easing: Easing.in(Easing.quad) }));
    opacity.value = withDelay(420, withTiming(0, { duration: 380 }));
  }, [lift, opacity, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }, { rotate: `${tilt}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.heart, { left: x - SIZE / 2, top: y - SIZE / 2 }, style]}>
      <Ionicons name="heart" size={SIZE} color="#FF3B5C" style={styles.shadow} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heart: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 4 } },
});
