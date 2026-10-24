import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import { ComponentProps, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inboxRows, defaultFilters } from '@/state/selectors';
import { useStore } from '@/state/store';
import { space, type } from '@/theme/tokens';
import { useIsWide, useTheme } from '@/theme/useTheme';
import { ActionSheet, IconName, Txt } from './ui';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['file-tray-full-outline', 'file-tray-full'],
  messages: ['chatbubbles-outline', 'chatbubbles'],
  communities: ['people-outline', 'people'],
  feed: ['newspaper-outline', 'newspaper'],
  connections: ['link-outline', 'link'],
  archive: ['archive-outline', 'archive'],
  settings: ['settings-outline', 'settings'],
};

/** Phones show the first four sections plus "More"; tablets and desktop show all seven in a sidebar. */
const PHONE_PRIMARY = ['index', 'messages', 'communities', 'feed'];

// expo-router vendors React Navigation, so take the tab bar's props from Tabs itself.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function AppNavBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const wide = useIsWide();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const unread = useMemo(() => inboxRows(store.state, { ...defaultFilters, tab: 'unread' }).length, [store.state]);

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (route) navigateToTab(route.key);
  };
  const current = state.routes[state.index].name;

  const item = (name: string, compact: boolean) => {
    const focused = current === name;
    const label = descriptors[state.routes.find(r => r.name === name)!.key].options.title ?? name;
    const badge = name === 'index' && unread ? unread : 0;
    return (
      <Pressable
        key={name}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
        onPress={() => go(name)}
        style={({ pressed }) => [
          compact ? styles.tab : styles.side,
          !compact && focused && { backgroundColor: colors.accentSoft },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View>
          <Ionicons name={ICONS[name][focused ? 1 : 0]} size={compact ? 24 : 22} color={focused ? colors.accent : colors.textMuted} />
          {badge ? <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: colors.surface }]} /> : null}
        </View>
        <Txt variant={compact ? 'caption' : 'body'} color={focused ? 'accent' : 'textMuted'} style={{ fontWeight: focused ? '700' : '500' }}>
          {label}
        </Txt>
      </Pressable>
    );
  };

  if (wide) {
    return (
      <View style={[styles.sidebar, { backgroundColor: colors.surface, borderColor: colors.border, paddingTop: insets.top + space.lg }]}>
        <Txt variant="title" color="accent" style={{ paddingHorizontal: space.md, marginBottom: space.lg }}>hye</Txt>
        {state.routes.map(r => item(r.name, false))}
      </View>
    );
  }

  const moreFocused = !PHONE_PRIMARY.includes(current);
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {PHONE_PRIMARY.map(n => item(n, true))}
      <Pressable accessibilityRole="tab" accessibilityLabel="More: Connections, Archive, Settings" accessibilityState={{ selected: moreFocused }} onPress={() => setMoreOpen(true)} style={styles.tab}>
        <Ionicons name={moreFocused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'} size={24} color={moreFocused ? colors.accent : colors.textMuted} />
        <Txt variant="caption" color={moreFocused ? 'accent' : 'textMuted'} style={{ fontWeight: moreFocused ? '700' : '500' }}>More</Txt>
      </Pressable>
      <ActionSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        actions={[
          { label: 'Connections', icon: 'link-outline', onPress: () => go('connections') },
          { label: 'Archive', icon: 'archive-outline', onPress: () => go('archive') },
          { label: 'Settings', icon: 'settings-outline', onPress: () => go('settings') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  sidebar: { width: 220, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm, gap: 2 },
  side: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, height: 44, borderRadius: 10 },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  label: type.caption,
});
