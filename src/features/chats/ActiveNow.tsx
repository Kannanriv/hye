import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { PhotoAvatar, PressableScale } from '@/components/premium';
import { Txt } from '@/components/ui';
import type { Contact } from '@/domain/types';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Horizontal row of (simulated) people who are around right now. Tapping opens the 1:1 chat. */
export const ActiveNow = memo(function ActiveNow({ contacts, onPick }: { contacts: Contact[]; onPick: (contactId: string) => void }) {
  const { colors } = useTheme();
  if (!contacts.length) return null;
  return (
    <View>
      <View style={styles.label}>
        <Txt variant="caption" color="textMuted" style={{ fontWeight: '700', letterSpacing: 0.4 }}>ACTIVE NOW</Txt>
        <Txt variant="caption" color="textMuted">· demo presence</Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ flexGrow: 0 }}>
        {contacts.map((c, i) => (
          <Animated.View key={c.id} entering={FadeInRight.delay(i * 40).springify().damping(18)}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${c.displayName}, demo contact, shown as active. Opens your chat`}
              haptic="tap"
              onPress={() => onPick(c.id)}
              style={styles.person}
            >
              <View>
                <PhotoAvatar name={c.displayName} uri={c.avatarUrl} size={56} />
                <View style={[styles.dot, { backgroundColor: colors.success, borderColor: colors.surface }]} />
              </View>
              <Txt variant="caption" numberOfLines={1} style={styles.name}>{c.displayName.split(' ')[0]}</Txt>
            </PressableScale>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  label: { flexDirection: 'row', gap: 4, paddingHorizontal: space.lg, paddingTop: space.xs },
  row: { gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  person: { alignItems: 'center', width: 64, gap: 4 },
  dot: { position: 'absolute', right: 1, bottom: 1, width: 15, height: 15, borderRadius: 8, borderWidth: 2.5 },
  name: { maxWidth: 64, textAlign: 'center' },
});
