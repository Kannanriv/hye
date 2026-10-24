import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import type { IconName } from '@/components/ui';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Small, quiet status toast (e.g. "Copied"). Disappears on its own; never blocks the screen. */
export function useToast(top = space.md) {
  const { colors } = useTheme();
  const [toast, setToast] = useState<{ id: number; text: string; icon: IconName } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, icon: IconName = 'checkmark-circle') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, icon });
    timer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const node = toast ? (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().damping(16)}
        exiting={FadeOutUp.duration(180)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: colors.text }]}
      >
        <Ionicons name={toast.icon} size={16} color={colors.surface} />
        <Text style={[type.small, { color: colors.surface, fontWeight: '600' }]}>{toast.text}</Text>
      </Animated.View>
    </View>
  ) : null;
  return [node, show] as const;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
