import { memo, useMemo } from 'react';
import { Text, TextStyle } from 'react-native';

import { type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const TOKEN = /([#@][\p{L}\p{N}_]+)/gu;

/** Post text with #hashtags and @mentions highlighted. Mentions are tappable when `onMention` is given. */
export const RichText = memo(function RichText({ text, style, numberOfLines, onMention }: {
  text: string; style?: TextStyle; numberOfLines?: number; onMention?: (handle: string) => void;
}) {
  const { colors } = useTheme();
  const parts = useMemo(() => text.split(TOKEN).filter(Boolean), [text]);
  return (
    <Text style={[type.body, { color: colors.text }, style]} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const isTag = /^#[\p{L}\p{N}_]+$/u.test(part);
        const isMention = /^@[\p{L}\p{N}_]+$/u.test(part);
        if (!isTag && !isMention) return part;
        return (
          <Text
            key={i}
            style={{ color: colors.accent, fontWeight: '600' }}
            onPress={isMention && onMention ? () => onMention(part.slice(1)) : undefined}
            accessibilityRole={isMention && onMention ? 'link' : undefined}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
});
