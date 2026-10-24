import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoAvatar } from '@/components/premium';
import { Avatar } from '@/components/ui';
import type { Contact, Conversation } from '@/domain/types';
import { useTheme } from '@/theme/useTheme';

/** Photo for a chat: the other person's face, or two stacked faces for a group. */
export const ChatAvatar = memo(function ChatAvatar({ conv, contacts, size = 50 }: {
  conv: Conversation; contacts: Contact[]; size?: number;
}) {
  const { colors } = useTheme();
  if (conv.origin === 'imported') return <Avatar name={conv.title} size={size} group={conv.kind === 'group'} />;
  const others = conv.members
    .filter(m => m.contactId !== 'me')
    .map(m => contacts.find(c => c.id === m.contactId))
    .filter((c): c is Contact => !!c);
  if (conv.kind === 'direct') {
    const c = others[0];
    return <PhotoAvatar name={c?.displayName ?? conv.title} uri={c?.avatarUrl} size={size} />;
  }
  const faces = others.slice(0, 2);
  if (faces.length < 2) return <Avatar name={conv.title} size={size} group />;
  const small = Math.round(size * 0.68);
  const ring = { borderColor: colors.surface, borderRadius: small / 2 + 2 };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.face, ring, { top: 0, right: 0 }]}>
        <PhotoAvatar name={faces[1].displayName} uri={faces[1].avatarUrl} size={small} />
      </View>
      <View style={[styles.face, ring, { bottom: 0, left: 0 }]}>
        <PhotoAvatar name={faces[0].displayName} uri={faces[0].avatarUrl} size={small} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  face: { position: 'absolute', borderWidth: 2, overflow: 'hidden' },
});
