import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Badge, TIER_LABEL } from './Badge';
import { AchievementDef, Facts } from './engine';

/** Badge + title + hint. Locked tiles explain how to unlock and show progress when it's countable. */
export const AchievementTile = memo(function AchievementTile({ def, facts, unlockedAt, size = 56, compact }: {
  def: AchievementDef; facts: Facts; unlockedAt?: string; size?: number; compact?: boolean;
}) {
  const { colors } = useTheme();
  const locked = !unlockedAt;
  const prog = locked && def.progress ? def.progress(facts) : null;
  const when = unlockedAt ? new Date(unlockedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const label = locked
    ? `${def.title}, ${TIER_LABEL[def.tier]}, locked. ${def.description}${prog ? ` ${prog.current} of ${prog.target} done.` : ''}`
    : `${def.title}, ${TIER_LABEL[def.tier]}, unlocked ${when}. ${def.description}`;
  return (
    <View accessible accessibilityLabel={label} style={[styles.tile, compact && styles.compact]}>
      <Badge icon={def.icon} tier={def.tier} locked={locked} size={size} />
      <Text style={[type.small, { color: locked ? colors.textMuted : colors.text, fontWeight: '700', textAlign: 'center' }]} numberOfLines={1}>
        {def.title}
      </Text>
      <Text style={[type.caption, { color: colors.textMuted, textAlign: 'center' }]} numberOfLines={compact ? 2 : 3}>
        {locked ? def.description : `Unlocked ${when}`}
      </Text>
      {prog ? (
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ width: `${(prog.current / prog.target) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: colors.accent }} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
  compact: { paddingVertical: space.xs },
  track: { height: 5, width: '70%', borderRadius: 3, overflow: 'hidden', marginTop: 2 },
});
