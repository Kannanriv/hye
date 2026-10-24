import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { DemoPill, GradientButton, PhotoAvatar, compact, useHaptics } from '@/components/premium';
import { Button, SheetFrame, Txt } from '@/components/ui';
import { useStore } from '@/state/store';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Author, plural, relativeTimeLong } from './helpers';

/** Bottom sheet with a person's bio, follow toggle and how much they've posted. */
export function ProfilePeek({ author, onClose, onOpenPost }: { author: Author | null; onClose: () => void; onOpenPost: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const { colors } = useTheme();
  const haptic = useHaptics();
  const theirs = useMemo(
    () => (author ? state.posts.filter(p => p.authorId === author.id && p.kind === 'text').sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [state.posts, author],
  );
  const contact = author ? state.contacts.find(c => c.id === author.id) : undefined;
  const following = !!contact?.following;
  const likes = theirs.reduce((n, p) => n + p.likes.length, 0);
  const latest = theirs.find(p => !p.replyToId);
  const now = Date.now();

  const toggle = () => {
    if (!contact) return;
    haptic(following ? 'select' : 'success');
    dispatch({ type: 'toggleFollow', contactId: contact.id });
  };

  return (
    <Modal visible={!!author} transparent animationType="slide" onRequestClose={onClose}>
      {author ? (
        <SheetFrame onClose={onClose}>
          <View style={styles.grabber}><View style={[styles.grab, { backgroundColor: colors.border }]} /></View>
          <View style={styles.body}>
            <View style={styles.top}>
              <PhotoAvatar name={author.name} uri={author.avatarUrl} size={72} ring={following || author.id === 'me'} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.nameRow}>
                  <Txt variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>{author.name}</Txt>
                  {author.isDemo ? <DemoPill /> : null}
                </View>
                <Txt variant="small" color="textMuted">@{author.handle}</Txt>
              </View>
            </View>
            {author.bio ? <Txt>{author.bio}</Txt> : author.id === 'me' ? <Txt color="textMuted" variant="small">Add a bio from the You tab so people know who you are.</Txt> : null}
            <View style={styles.stats}>
              <Text style={[type.small, { color: colors.textMuted }]} accessibilityLabel={plural(theirs.length, 'post')}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{compact(theirs.length)}</Text> {theirs.length === 1 ? 'post' : 'posts'}
              </Text>
              <Text style={[type.small, { color: colors.textMuted }]} accessibilityLabel={plural(likes, 'like') + ' received'}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{compact(likes)}</Text> likes received
              </Text>
            </View>
            {latest ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <Button
                  variant="secondary"
                  icon="chatbubble-ellipses-outline"
                  label={`Latest post · ${relativeTimeLong(latest.createdAt, now)}`}
                  onPress={() => { onClose(); onOpenPost(latest.id); }}
                />
              </Animated.View>
            ) : null}
            {contact ? (
              following ? (
                <Button label="Following" icon="checkmark" variant="secondary" onPress={toggle} accessibilityHint={`Stops showing ${author.name}'s posts in Following`} />
              ) : (
                <GradientButton label={`Follow ${author.name.split(' ')[0]}`} icon="person-add-outline" onPress={toggle} />
              )
            ) : null}
            {author.isDemo ? (
              <View style={styles.note}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Txt variant="caption" color="textMuted" style={{ flex: 1 }}>Demo person. Their posts and likes are simulated so you can try hye.</Txt>
              </View>
            ) : null}
          </View>
        </SheetFrame>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  grabber: { alignItems: 'center', marginTop: -space.sm, marginBottom: space.sm },
  grab: { width: 40, height: 5, borderRadius: 3 },
  body: { paddingHorizontal: space.xl, gap: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stats: { flexDirection: 'row', gap: space.xl },
  note: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
});
