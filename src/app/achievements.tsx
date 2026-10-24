import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card, SectionTitle, Txt } from '@/components/ui';
import { AchievementTile } from '@/features/gamification/AchievementTile';
import { TIER_LABEL } from '@/features/gamification/Badge';
import { ACHIEVEMENTS, Tier, TIER_XP } from '@/features/gamification/engine';
import { useGamification } from '@/features/gamification/useGamification';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const TIERS: Tier[] = ['bronze', 'silver', 'gold'];

/** Every achievement, grouped by tier. Personal progress only: nothing here compares you with anyone. */
export default function AchievementsScreen() {
  const { state, dispatch } = useStore();
  const { colors } = useTheme();
  const g = useGamification();
  const unlocked = useMemo(() => new Map(state.progress.achievements.map(a => [a.id, a.unlockedAt])), [state.progress.achievements]);

  if (!g.enabled) {
    return (
      <Screen title="Achievements" back>
        <Banner icon="trophy-outline" title="Game elements are off" body="XP, levels and achievements are hidden and nothing is being tracked. Turn them back on any time." />
        <Button label="Turn game elements on" icon="trophy-outline" onPress={() => dispatch({ type: 'delight', patch: { gamification: true } })} />
      </Screen>
    );
  }

  return (
    <Screen title="Achievements" subtitle={`${unlocked.size} of ${ACHIEVEMENTS.length} unlocked · Level ${g.level.level} ${g.level.title}`} back>
      <Card style={{ padding: space.lg, gap: space.xs }}>
        <Txt variant="subheading">How this works</Txt>
        <Txt variant="small" color="textMuted">
          Achievements mark real milestones: things you made, shared, set up or took control of. There are no streaks to lose and no time-based
          rewards, and doing the same thing over and over earns less each time. Only you can see this page.
        </Txt>
      </Card>
      {TIERS.map((tier, ti) => {
        const defs = ACHIEVEMENTS.filter(a => a.tier === tier);
        const got = defs.filter(a => unlocked.has(a.id)).length;
        return (
          <Animated.View key={tier} entering={FadeInDown.delay(ti * 80).duration(280)}>
            <SectionTitle>{TIER_LABEL[tier]} · {got} of {defs.length} · {TIER_XP[tier]} XP each</SectionTitle>
            <View style={[styles.grid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {defs.map(def => (
                <View key={def.id} style={styles.cell}>
                  <AchievementTile def={def} facts={g.facts} unlockedAt={unlocked.get(def.id)} size={60} />
                </View>
              ))}
            </View>
          </Animated.View>
        );
      })}
      <Button label="Back to You" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/you'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, paddingHorizontal: space.xs },
  cell: { width: '50%', paddingHorizontal: space.sm, paddingVertical: space.xs },
});
