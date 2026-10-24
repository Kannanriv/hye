import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { GradientButton, PressableScale } from '@/components/premium';
import { gradients, radius, space, type } from '@/theme/tokens';

/** Shown after the last reel: the feed ends here on purpose. */
export function EndCard({ width, height, empty, onRestart, onCreate }: {
  width: number; height: number; empty: boolean; onRestart: () => void; onCreate: () => void;
}) {
  return (
    <View style={[styles.end, { width, height }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
        <Ionicons name={empty ? 'film-outline' : 'checkmark-done'} size={34} color="#fff" />
      </LinearGradient>
      <Text accessibilityRole="header" style={[type.heading, styles.white, { textAlign: 'center' }]}>
        {empty ? 'No reels yet' : 'You’re all caught up'}
      </Text>
      <Text style={[type.body, styles.dim, { textAlign: 'center', maxWidth: 300 }]}>
        {empty
          ? 'When people you follow share reels, they’ll show up here. You could start things off.'
          : 'You’ve seen every reel from your people. That’s the whole feed — no endless scroll here.'}
      </Text>
      <View style={styles.actions}>
        {empty ? null : <GradientButton label="Watch again from the start" icon="refresh" onPress={onRestart} />}
        <PressableScale accessibilityRole="button" accessibilityLabel="Make a reel" haptic="tap" onPress={onCreate} style={styles.outline}>
          <Ionicons name="videocam-outline" size={18} color="#fff" />
          <Text style={[type.subheading, styles.white]}>Make a reel</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** Gentle, dismissible nudge after a run of reels. Floats over the feed and never blocks it. */
export function BreakCard({ top, onDismiss, onPause }: { top: number; onDismiss: () => void; onPause: () => void }) {
  return (
    <Animated.View entering={FadeInUp.duration(260)} exiting={FadeOutUp.duration(200)} style={[styles.breakWrap, { top }]} pointerEvents="box-none">
      <BlurView intensity={50} tint="dark" style={styles.breakCard} accessibilityRole="alert">
        <Ionicons name="cafe-outline" size={24} color="#fff" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.subheading, styles.white]}>Taking a break?</Text>
          <Text style={[type.small, styles.dim]}>You’ve watched 10 reels in a row. Stretch, sip some water — or keep going, your call.</Text>
          <View style={styles.breakActions}>
            <PressableScale accessibilityRole="button" accessibilityLabel="Pause for now" haptic="tap" onPress={onPause} style={styles.chip}>
              <Text style={[type.small, styles.white, { fontWeight: '700' }]}>Pause for now</Text>
            </PressableScale>
            <PressableScale accessibilityRole="button" accessibilityLabel="Keep watching" onPress={onDismiss} style={styles.chip}>
              <Text style={[type.small, styles.white, { fontWeight: '700' }]}>Keep watching</Text>
            </PressableScale>
          </View>
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.close} hitSlop={6}>
          <Ionicons name="close" size={20} color="#fff" />
        </PressableScale>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  end: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  actions: { alignSelf: 'stretch', maxWidth: 340, width: '100%', alignItems: 'stretch', gap: space.md, marginTop: space.md },
  outline: {
    minHeight: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
  },
  breakWrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  breakCard: {
    width: '100%', maxWidth: 440, flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg,
    overflow: 'hidden', backgroundColor: 'rgba(20,20,28,0.55)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  breakActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
  chip: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -space.sm, marginRight: -space.sm },
  white: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.78)' },
});
