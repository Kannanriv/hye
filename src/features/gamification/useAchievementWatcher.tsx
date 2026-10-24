import { usePathname } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHaptics } from '@/components/premium';
import { useStore } from '@/state/store';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Badge, TIER_GRADIENT, TIER_LABEL } from './Badge';
import { AchievementDef, GamContext, headline, newlyUnlocked } from './engine';
import { recordVisit, tabForPath, useVisitedTabs } from './visited';

// Watches app state for real progress, records new achievements and plays a short, skippable
// celebration. Mount once at the root, inside the router, theme and safe-area providers.

const SHOW_MS = 2400; // whole celebration stays under 2.5 s
const PARTICLES = 14;

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => alive && setReduce(v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

export function AchievementWatcher() {
  const { state, dispatch } = useStore();
  const pathname = usePathname();
  const visited = useVisitedTabs();
  const ctx = useMemo<GamContext>(() => ({ visited }), [visited]);
  const [toast, setToast] = useState<{ def: AchievementDef; more: number; key: number } | null>(null);
  const marking = useRef(new Set<string>());
  const { user, delight, progress } = state;
  const on = !!user && delight.gamification;

  useEffect(() => {
    const tab = tabForPath(pathname);
    if (tab && user) recordVisit(tab);
  }, [pathname, user]);

  // Record achievements whose conditions are now met.
  useEffect(() => {
    if (!on) return;
    const fresh = newlyUnlocked(state, ctx);
    if (fresh.length) dispatch({ type: 'unlockAchievements', ids: fresh });
  }, [on, state, ctx, dispatch]);

  // Celebrate once per achievement. Several at once (e.g. after an import) become one toast.
  useEffect(() => {
    if (!on || toast) return;
    const done = new Set(progress.celebrated);
    const pending = progress.achievements.map(a => a.id).filter(id => !done.has(id) && !marking.current.has(id));
    if (!pending.length) return;
    pending.forEach(id => { marking.current.add(id); dispatch({ type: 'markCelebrated', id }); });
    const def = headline(pending);
    if (def && delight.celebrations) setToast({ def, more: pending.length - 1, key: Date.now() });
  }, [on, toast, progress, delight.celebrations, dispatch]);

  if (!on || !delight.celebrations || !toast) return null;
  return <Celebration key={toast.key} def={toast.def} more={toast.more} onDone={() => setToast(null)} />;
}

const Celebration = memo(function Celebration({ def, more, onDone }: { def: AchievementDef; more: number; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const reduce = useReduceMotion();
  const scale = useSharedValue(reduce ? 1 : 0.6);
  const burst = useSharedValue(0);

  useEffect(() => {
    buzz('success');
    const label = `Achievement unlocked: ${def.title}. ${def.description}${more ? ` And ${more} more.` : ''}`;
    AccessibilityInfo.announceForAccessibility(label);
    if (!reduce) {
      scale.value = withSpring(1, { damping: 11, stiffness: 180 });
      burst.value = withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }
    const t = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(t);
    // Runs once per celebration; the parent remounts with a new key for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const accent = TIER_GRADIENT[def.tier];

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space.sm, alignItems: 'center' }]}>
      <Animated.View entering={FadeIn.duration(reduce ? 200 : 160)} exiting={FadeOut.duration(200)} style={[styles.wrap, cardStyle]}>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={`Achievement unlocked: ${def.title}. ${def.description}${more ? ` Plus ${more} more.` : ''}`}
          accessibilityHint="Dismisses the celebration"
          accessibilityLiveRegion="polite"
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.badgeBox}>
            {reduce ? null : Array.from({ length: PARTICLES }, (_, i) => <Particle key={i} index={i} progress={burst} color={accent[i % accent.length]} />)}
            <Badge icon={def.icon} tier={def.tier} size={56} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.caption, { color: colors.accent, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }]}>
              Achievement unlocked · {TIER_LABEL[def.tier]}
            </Text>
            <Text style={[type.subheading, { color: colors.text }]} numberOfLines={1}>{def.title}</Text>
            <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={2}>
              {def.description}{more ? `  +${more} more` : ''}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const Particle = memo(function Particle({ index, progress, color }: { index: number; progress: SharedValue<number>; color: string }) {
  // Deterministic spread so the burst looks designed, not random.
  const angle = (index / PARTICLES) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
  const dist = 34 + (index % 3) * 10;
  const size = 5 + (index % 3);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p === 0 ? 0 : 1 - p,
      transform: [
        { translateX: Math.cos(angle) * dist * p },
        { translateY: Math.sin(angle) * dist * p },
        { scale: 1 - p * 0.5 },
      ],
    };
  });
  return <Animated.View style={[styles.particle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
});

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 420, paddingHorizontal: space.lg },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8, minHeight: 56,
  },
  badgeBox: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', left: 25, top: 25 },
});
