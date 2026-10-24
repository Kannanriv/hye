import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Avatar, Button, Card, Chip, Divider, Tag, TextField, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Conversation } from '@/domain/types';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function NewChat() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { state, dispatch, audit } = useStore();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'direct' | 'group'>(params.mode === 'group' ? 'group' : 'direct');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const contacts = state.contacts.filter(c => !c.blocked && `${c.displayName} ${c.handle}`.toLowerCase().includes(q.toLowerCase()));

  const open = (id: string) => router.replace({ pathname: '/conversation/[id]', params: { id } });

  const startDirect = (contactId: string) => {
    const existing = state.conversations.find(c => c.kind === 'direct' && c.origin === 'native' && c.members.some(m => m.contactId === contactId));
    if (existing) {
      if (existing.archived) dispatch({ type: 'patchConversation', id: existing.id, patch: { archived: false } });
      return open(existing.id);
    }
    const contact = state.contacts.find(c => c.id === contactId)!;
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: newId('cv'), kind: 'direct', origin: 'native', source: 'hye', title: contact.displayName,
      members: [{ contactId: 'me', role: 'admin' }, { contactId, role: 'member' }], createdAt: now, lastActivityAt: now, lastReadAt: now,
      pinned: false, muted: false, archived: false, markedUnread: false, retention: state.privacy.defaultRetention,
    };
    dispatch({ type: 'upsertConversation', conversation: conv });
    open(conv.id);
  };

  const createGroup = () => {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: newId('cv'), kind: 'group', origin: 'native', source: 'hye', title: title.trim(),
      members: [{ contactId: 'me', role: 'admin' }, ...picked.map(c => ({ contactId: c, role: 'member' as const }))],
      createdAt: now, lastActivityAt: now, lastReadAt: now, pinned: false, muted: false, archived: false, markedUnread: false,
      retention: state.privacy.defaultRetention,
    };
    dispatch({ type: 'upsertConversation', conversation: conv });
    dispatch({
      type: 'addMessages',
      messages: [{ id: newId('msg'), conversationId: conv.id, senderId: 'system', senderName: 'hye', text: `You created “${conv.title}”`, sentAt: now, reactions: [], attachments: [], system: true }],
    });
    audit('group.created', `${conv.title} (${picked.length + 1} members)`);
    open(conv.id);
  };

  return (
    <Screen title={mode === 'group' ? 'New group' : 'New conversation'} back>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Person" selected={mode === 'direct'} onPress={() => setMode('direct')} />
        <Chip label="Group" selected={mode === 'group'} onPress={() => setMode('group')} />
      </View>
      {mode === 'group' ? <TextField label="Group name" value={title} onChangeText={setTitle} placeholder="e.g. Family" maxLength={60} /> : null}
      <TextField value={q} onChangeText={setQ} placeholder="Search people" accessibilityLabel="Search people" />
      <Card>
        {contacts.map((c, i) => {
          const on = picked.includes(c.id);
          return (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole={mode === 'group' ? 'checkbox' : 'button'}
                accessibilityState={mode === 'group' ? { checked: on } : undefined}
                accessibilityLabel={`${c.displayName}${c.isDemo ? ', demo contact' : ''}`}
                onPress={() => (mode === 'group' ? setPicked(p => (on ? p.filter(x => x !== c.id) : [...p, c.id])) : startDirect(c.id))}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Avatar name={c.displayName} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt>{c.displayName}</Txt>
                  <Txt variant="caption" color="textMuted">@{c.handle}</Txt>
                </View>
                {c.isDemo ? <Tag label="Demo" /> : null}
                {mode === 'group' ? <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.accent : colors.textMuted} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Card>
      <Txt variant="small" color="textMuted">The prototype includes simulated demo contacts so you can try chats. Finding real people by username needs the hye server.</Txt>
      {mode === 'group' ? (
        <Button label={picked.length ? `Create group with ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` : 'Pick at least one person'} disabled={!picked.length || !title.trim()} onPress={createGroup} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 },
});
