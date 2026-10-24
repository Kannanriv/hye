import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemoPill, PhotoAvatar, PressableScale } from '@/components/premium';
import { IconButton, SheetFrame, Txt } from '@/components/ui';
import type { Comment, Post } from '@/domain/types';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { ReelAuthor, shortAgo } from './people';

/** Bottom sheet with a reel's comments and a composer. */
export function CommentsSheet({ post, personFor, onClose, onSend }: {
  post: Post | null; personFor: (id: string) => ReelAuthor; onClose: () => void; onSend: (postId: string, text: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0;

  const send = useCallback(() => {
    if (!post || !draft.trim()) return;
    onSend(post.id, draft.trim());
    setDraft('');
  }, [draft, onSend, post]);

  const renderItem = useCallback(({ item }: { item: Comment }) => {
    const p = personFor(item.authorId);
    return (
      <View style={styles.comment} accessible accessibilityLabel={`${p.isMe ? 'You' : p.name}, ${shortAgo(item.createdAt)} ago: ${item.text}`}>
        <PhotoAvatar name={p.name} uri={p.avatarUrl} size={34} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Txt variant="small" style={{ fontWeight: '700' }}>{p.isMe ? 'You' : p.name}</Txt>
            {p.isDemo ? <DemoPill /> : null}
            <Txt variant="caption" color="textMuted">{shortAgo(item.createdAt)}</Txt>
          </View>
          <Txt variant="small">{item.text}</Txt>
        </View>
      </View>
    );
  }, [personFor]);

  const count = post?.comments.length ?? 0;
  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetFrame onClose={onClose} style={{ maxHeight: '75%', paddingBottom: Math.max(insets.bottom, space.md) }}>
          <View style={styles.header}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.headerRow}>
              <Txt variant="subheading" style={{ flex: 1 }}>{count ? `Comments · ${count}` : 'Comments'}</Txt>
              <IconButton icon="close" label="Close comments" onPress={onClose} />
            </View>
          </View>
          <FlatList
            data={post?.comments ?? []}
            keyExtractor={c => c.id}
            renderItem={renderItem}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.md }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted} />
                <Txt variant="small" color="textMuted">No comments yet. Say something kind.</Txt>
              </View>
            }
          />
          <View style={[styles.composer, { borderColor: colors.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Add a comment"
              maxLength={500}
              multiline
              onSubmitEditing={send}
              style={[styles.input, type.body, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              haptic="tap"
              onPress={send}
              style={[styles.send, { backgroundColor: canSend ? colors.accent : colors.surfaceAlt }]}
            >
              <Ionicons name="arrow-up" size={20} color={canSend ? colors.onAccent : colors.textMuted} />
            </PressableScale>
          </View>
        </SheetFrame>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  comment: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: 10 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
