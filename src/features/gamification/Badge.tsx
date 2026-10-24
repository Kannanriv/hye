import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { View } from 'react-native';

import type { IconName } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';
import type { Tier } from './engine';

export const TIER_GRADIENT: Record<Tier, readonly [string, string, ...string[]]> = {
  bronze: ['#F59E0B', '#B45309'],
  silver: ['#94A3B8', '#475569'],
  gold: ['#FBBF24', '#F59E0B', '#DB2777'],
};

export const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/** Round achievement badge. Locked badges are greyed with a lock overlay. */
export const Badge = memo(function Badge({ icon, tier, locked, size = 56 }: { icon: string; tier: Tier; locked?: boolean; size?: number }) {
  const { colors } = useTheme();
  const glyph = <Ionicons name={icon as IconName} size={size * 0.46} color={locked ? colors.textMuted : '#fff'} />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {locked ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          {glyph}
        </View>
      ) : (
        <LinearGradient colors={TIER_GRADIENT[tier]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          {glyph}
        </LinearGradient>
      )}
      {locked ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: size * 0.36, height: size * 0.36, borderRadius: size, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="lock-closed" size={size * 0.18} color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );
});
