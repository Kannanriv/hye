import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useCallback } from 'react';
import { Platform, Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Avatar, IconName } from './ui';

// Shared "premium" primitives: haptics, springy press feedback, gradient CTAs, photo avatars.
// Feature screens build on these so the whole app feels consistent.

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'heavy';

/** Haptic feedback that respects the user's Settings › Delight › Haptics switch. */
export function useHaptics() {
  const enabled = useStore().state.delight.haptics;
  return useCallback(
    (kind: HapticKind = 'tap') => {
      if (!enabled || Platform.OS === 'web') return;
      const run = {
        tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
        select: () => Haptics.selectionAsync(),
        success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
      }[kind];
      run().catch(() => undefined);
    },
    [enabled],
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down slightly when pressed. */
export function PressableScale({ children, style, scaleTo = 0.96, haptic, onPress, ...rest }: PressableProps & {
  children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: HapticKind;
}) {
  const scale = useSharedValue(1);
  const buzz = useHaptics();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => { scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 }); rest.onPressIn?.(e); }}
      onPressOut={e => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); rest.onPressOut?.(e); }}
      onPress={e => { if (haptic) buzz(haptic); onPress?.(e); }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Primary call to action with the brand gradient. */
export function GradientButton({ label, onPress, icon, disabled, colors: stops = gradients.brand, style }: {
  label: string; onPress: () => void; icon?: IconName; disabled?: boolean; colors?: readonly [string, string, ...string[]]; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      haptic="tap"
      onPress={onPress}
      style={[{ opacity: disabled ? 0.45 : 1, borderRadius: radius.md, overflow: 'hidden' }, style]}
    >
      <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBtn}>
        {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
        <Text style={[type.subheading, { color: '#fff' }]}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

/** Photo avatar with initials fallback, and an optional gradient "story" ring. */
export function PhotoAvatar({ name, uri, size = 44, ring, seen }: { name: string; uri?: string; size?: number; ring?: boolean; seen?: boolean }) {
  const { colors } = useTheme();
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
  ) : (
    <Avatar name={name} size={size} />
  );
  if (!ring) return inner;
  const pad = 2.5;
  return (
    <LinearGradient
      colors={seen ? [colors.border, colors.border] : gradients.brand}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{ width: size + pad * 4, height: size + pad * 4, borderRadius: (size + pad * 4) / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ padding: pad, borderRadius: (size + pad * 2) / 2, backgroundColor: colors.surface }}>{inner}</View>
    </LinearGradient>
  );
}

/** Small "Demo" pill for anything simulated. Keep it visible: honesty is part of the premium feel. */
export function DemoPill() {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel="Simulated demo content">
      <Text style={[type.caption, { color: colors.textMuted, fontWeight: '700' }]}>DEMO</Text>
    </View>
  );
}

/** Compact number formatting for counters: 1.2K, 3.4M. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

const styles = StyleSheet.create({
  gradientBtn: { minHeight: 50, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  pill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
});
