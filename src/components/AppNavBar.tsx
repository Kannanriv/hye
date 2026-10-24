import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import { ComponentProps, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inboxRows, defaultFilters } from '@/state/selectors';
import { useStore } from '@/state/store';
import { space, type } from '@/theme/tokens';
import { useIsWide, useTheme } from '@/theme/useTheme';
import { IconName, Txt } from './ui';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'],
  posts: ['sparkles-outline', 'sparkles'],
  reels: ['play-circle-outline', 'play-circle'],
  photos: ['images-outline', 'images'],
  you: ['person-circle-outline', 'person-circle'],
  messages: ['chatbubbles-outline', 'chatbubbles'],
  communities: ['people-outline', 'people'],
  feed: ['newspaper-outline', 'newspaper'],
  connections: ['link-outline', 'link'],
  archive: ['archive-outline', 'archive'],
  settings: ['settings-outline', 'settings'],
};

/** Phones show five primary tabs (everything else is reachable from You); tablets/desktop show all in a sidebar. */
const PHONE_PRIMARY = ['index', 'posts', 'reels', 'photos', 'you'];

// expo-router vendors React Navigation, so take the tab bar's props from Tabs itself.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function AppNavBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const wide = useIsWide();
  // Below 1100px an icon-only rail leaves room for the list and the open chat.
  const { width } = useWindowDimensions();
  const rail = wide && width < 1100;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const unread = useMemo(() => inboxRows(store.state, { ...defaultFilters, tab: 'unread' }).length, [store.state]);

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (route) navigateToTab(route.key);
  };
  const current = state.routes[state.index].name;

  const item = (name: string, compact: boolean, dark = false) => {
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
          rail && { justifyContent: 'center', paddingHorizontal: 0 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View>
          <Ionicons name={ICONS[name][focused ? 1 : 0]} size={compact ? 24 : 22} color={dark ? (focused ? '#fff' : '#9AA3B5') : focused ? colors.accent : colors.textMuted} />
          {badge ? <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: colors.surface }]} /> : null}
        </View>
        {rail ? null : (
          <Txt variant={compact ? 'caption' : 'body'} color={focused ? 'accent' : 'textMuted'} style={{ fontWeight: focused ? '700' : '500', ...(dark ? { color: focused ? '#fff' : '#9AA3B5' } : null) }}>
            {label}
          </Txt>
        )}
      </Pressable>
    );
  };

  if (wide) {
    return (
      <View style={[rail ? styles.rail : styles.sidebar, { backgroundColor: colors.surface, borderColor: colors.border, paddingTop: insets.top + space.lg }]}>
        <Txt variant="title" color="accent" style={{ paddingHorizontal: rail ? 0 : space.md, marginBottom: space.lg, textAlign: rail ? 'center' : 'left', fontSize: rail ? 20 : 28 }}>hye</Txt>
        {state.routes.map(r => item(r.name, false))}
      </View>
    );
  }

  // Reels is a full-bleed dark experience; the bar follows it.
  const dark = current === 'reels';
  return (
    <View style={[styles.bar, { backgroundColor: dark ? '#000' : colors.surface, borderColor: dark ? '#222' : colors.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {PHONE_PRIMARY.map(n => item(n, true, dark))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  sidebar: { width: 220, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm, gap: 2 },
  rail: { width: 72, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm, gap: 4, alignItems: 'stretch' },
  side: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, height: 44, borderRadius: 10 },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  label: type.caption,
});
