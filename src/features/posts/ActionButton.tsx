import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { compact } from '@/components/premium';
import type { IconName } from '@/components/ui';
import { type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type ActionEffect = 'pop' | 'spin' | 'bounce' | 'none';

/**
 * One icon + counter in a post's action row. `effect` decides the delight animation that plays
 * when the action becomes active (heart pop with a burst ring, repost spin, bookmark bounce).
 */
export const ActionButton = memo(function ActionButton({
  icon, activeIcon, active = false, count, activeColor, label, onPress, effect = 'none', size = 19,
}: {
  icon: IconName; activeIcon?: IconName; active?: boolean; count?: number; activeColor?: string;
  label: string; onPress?: () => void; effect?: ActionEffect; size?: number;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const burst = useSharedValue(0);
  const prev = useRef(active);

  useEffect(() => {
    const became = active && !prev.current;
    prev.current = active;
    if (!became || reduceMotion) return;
    if (effect === 'pop') {
      scale.value = withSequence(withTiming(0.6, { duration: 90 }), withSpring(1.3, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10, stiffness: 220 }));
      burst.value = 0;
      burst.value = withTiming(1, { duration: 450 });
    } else if (effect === 'spin') {
      rotate.value = withSpring(rotate.value + 360, { damping: 12, stiffness: 140 });
      scale.value = withSequence(withSpring(1.2, { damping: 8, stiffness: 380 }), withSpring(1, { damping: 12 }));
    } else if (effect === 'bounce') {
      scale.value = withSequence(withSpring(0.8, { damping: 10, stiffness: 500 }), withSpring(1, { damping: 7, stiffness: 300 }));
    }
  }, [active, effect, reduceMotion, scale, rotate, burst]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }] }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value === 0 || burst.value === 1 ? 0 : 0.55 * (1 - burst.value),
    transform: [{ scale: 0.4 + burst.value * 1.4 }],
  }));

  const tint = active ? activeColor ?? colors.accent : colors.textMuted;
  const content = (
    <>
      <View style={styles.iconWrap}>
        {effect === 'pop' ? <Animated.View pointerEvents="none" style={[styles.burst, { borderColor: activeColor ?? colors.accent }, burstStyle]} /> : null}
        <Animated.View style={iconStyle}>
          <Ionicons name={active && activeIcon ? activeIcon : icon} size={size} color={tint} />
        </Animated.View>
      </View>
      {count !== undefined ? (
        <View style={styles.countWrap}>
          <Animated.View key={count} entering={reduceMotion ? undefined : FadeInDown.duration(180)}>
            <Text style={[type.caption, styles.count, { color: tint }]}>{count > 0 ? compact(count) : ''}</Text>
          </Animated.View>
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.btn} accessible accessibilityLabel={label}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  iconWrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  countWrap: { minWidth: 18, height: 18, overflow: 'hidden', justifyContent: 'center' },
  count: { fontWeight: '600', fontVariant: ['tabular-nums'], marginLeft: 2 },
});
