import { router } from 'expo-router';
import { ComponentProps, useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useIsWide, useTheme } from '@/theme/useTheme';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { EmptyState } from './ui';

type ListProps = Omit<ComponentProps<typeof ConversationList>, 'onOpen' | 'selectedId'>;

/** Phone: list, tap pushes a conversation screen. Tablet/desktop: list + conversation side by side. */
export function SplitInbox(props: ListProps) {
  const wide = useIsWide();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const open = useCallback(
    (id: string) => (wide ? setSelected(id) : router.push({ pathname: '/conversation/[id]', params: { id } })),
    [wide],
  );

  if (!wide) return <ConversationList {...props} onOpen={open} />;
  return (
    <View style={styles.split}>
      <View style={[styles.list, { borderColor: colors.border, width: Math.min(380, Math.max(300, width * 0.34)) }]}>
        <ConversationList {...props} onOpen={open} selectedId={selected} />
      </View>
      <View style={[styles.detail, { backgroundColor: colors.bg }]}>
        {selected ? (
          <ConversationView key={selected} conversationId={selected} />
        ) : (
          <EmptyState icon="chatbubbles-outline" title="Pick a conversation" body="Your chats and imported history open here." />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  list: { borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
});
