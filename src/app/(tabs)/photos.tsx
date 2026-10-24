import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, PressableScale } from '@/components/premium';
import { EmptyState } from '@/components/ui';
import type { Post } from '@/domain/types';
import { CaughtUpCard, GridTile, StoriesRow, ViewToggle } from '@/features/photos/FeedBits';
import { PhotoPostCard } from '@/features/photos/PhotoPostCard';
import { usePhotosSimulation } from '@/features/photos/simulation';
import { storyContactIds, useSeenStories } from '@/features/photos/stories';
import { usePhotoActions } from '@/features/photos/usePhotoActions';
import { go, likedByLine, usePeople } from '@/features/photos/util';
import { useStore } from '@/state/store';
import { gradients, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const MAX_WIDTH = 640;

export default function PhotosScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useStore();
  const person = usePeople();
  const handlers = usePhotoActions();
  const seen = useSeenStories();
  usePhotosSimulation();
  const [mode, setMode] = useState<'feed' | 'grid'>('feed');
  const [width, setWidth] = useState(0);

  const blocked = useMemo(() => new Set(state.contacts.filter(c => c.blocked).map(c => c.id)), [state.contacts]);
  const posts = useMemo(
    () => state.posts
      .filter(p => p.kind === 'photo' && p.media.length > 0 && !blocked.has(p.authorId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.posts, blocked],
  );
  const storyPeople = useMemo(
    () => storyContactIds.filter(id => state.contacts.some(c => c.id === id && !c.blocked)).map(person),
    [state.contacts, person],
  );
  const storySet = useMemo(() => new Set(storyContactIds), []);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.min(MAX_WIDTH, e.nativeEvent.layout.width)), []);

  const renderPost = useCallback(({ item }: { item: Post }) => {
    const last = item.comments[item.comments.length - 1];
    return (
      <View style={styles.cardWrap}>
        <PhotoPostCard
        post={item}
        author={person(item.authorId)}
        likedBy={likedByLine(item, person)}
        latestComment={last ? { name: person(last.authorId).firstName, text: last.text } : null}
        hasStory={storySet.has(item.authorId)}
        handlers={handlers}
        />
      </View>
    );
  }, [person, handlers, storySet]);

  const tile = Math.floor(width / 3);
  const renderTile = useCallback(({ item }: { item: Post }) => (
    <GridTile post={item} size={tile} authorName={person(item.authorId).name} onOpen={go.photo} />
  ), [tile, person]);

  const header = (
    <View>
      <StoriesRow me={person('me')} people={storyPeople} seen={seen} onAdd={go.newPhoto} onOpen={go.story} />
      {posts.length ? <ViewToggle mode={mode} onChange={setMode} /> : null}
    </View>
  );
  const footer = posts.length ? (
    <View style={styles.footer}>
      <CaughtUpCard onShare={go.newPhoto} />
    </View>
  ) : undefined;
  const empty = (
    <EmptyState
      icon="images-outline"
      title="No photos yet"
      body="Photos you and your contacts share show up here. Only your contacts can see what you post."
      action={<GradientButton label="Share your first photo" onPress={go.newPhoto} />}
    />
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text accessibilityRole="header" style={[styles.wordmark, { color: colors.text }]}>Photos</Text>
        <PressableScale accessibilityRole="button" accessibilityLabel="Share a new photo" haptic="tap" onPress={go.newPhoto} style={styles.plusWrap}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
            <Ionicons name="add" size={24} color="#fff" />
          </LinearGradient>
        </PressableScale>
      </View>
      <View style={styles.flex} onLayout={onLayout}>
        {width > 0 && mode === 'feed' ? (
          <FlatList
            key="feed"
            data={posts}
            keyExtractor={p => p.id}
            renderItem={renderPost}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            ListEmptyComponent={empty}
            ItemSeparatorComponent={Gap}
            style={[styles.list, { maxWidth: MAX_WIDTH }]}
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={7}
            removeClippedSubviews
          />
        ) : null}
        {width > 0 && mode === 'grid' ? (
          <FlatList
            key="grid"
            data={posts}
            keyExtractor={p => p.id}
            renderItem={renderTile}
            numColumns={3}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            style={[styles.list, { maxWidth: MAX_WIDTH }]}
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
            initialNumToRender={18}
            windowSize={9}
          />
        ) : null}
      </View>
    </View>
  );
}

const Gap = () => <View style={{ height: space.lg }} />;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  wordmark: { ...type.title, fontStyle: 'italic', letterSpacing: -0.8 },
  plusWrap: { borderRadius: 22 },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { paddingHorizontal: space.md },
  footer: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.xl },
  list: { width: '100%', alignSelf: 'center' },
});
