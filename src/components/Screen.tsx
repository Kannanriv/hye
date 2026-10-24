import { router } from 'expo-router';
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { IconButton, Txt } from './ui';

/** Standard scrolling page with a large title, optional back button and a readable max width. */
export function Screen({ title, subtitle, back, actions, children, scroll = true }: {
  title: string; subtitle?: string; back?: boolean; actions?: ReactNode; children: ReactNode; scroll?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const header = (
    <View style={styles.header}>
      {back ? <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant={back ? 'heading' : 'title'} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="small" color="textMuted">{subtitle}</Txt> : null}
      </View>
      {actions}
    </View>
  );
  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.inner]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.md },
});
