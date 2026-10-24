import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, PressableScale, useHaptics } from '@/components/premium';
import { Banner, Button, Chip, ConfirmDialog, IconButton, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Post, PostMedia } from '@/domain/types';
import { keepFile } from '@/services/importer';
import { clampRatio, MediaCarousel } from '@/features/photos/MediaCarousel';
import { go } from '@/features/photos/util';
import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const MAX_PHOTOS = 5;
const MAX_CAPTION = 2200;

// Preview-only looks (overlay tints on top of the photo).
const FILTERS: { id: string; label: string; tint?: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'warm', label: 'Warm', tint: 'rgba(255,160,60,0.18)' },
  { id: 'cool', label: 'Cool', tint: 'rgba(60,140,255,0.16)' },
  { id: 'rose', label: 'Rose', tint: 'rgba(240,80,140,0.15)' },
  { id: 'fade', label: 'Fade', tint: 'rgba(255,255,255,0.22)' },
  { id: 'dusk', label: 'Dusk', tint: 'rgba(40,20,90,0.22)' },
];

type Notice = { title: string; body: string; settings?: boolean } | null;

function toMedia(a: ImagePicker.ImagePickerAsset): PostMedia {
  return { kind: 'image', uri: a.uri, aspectRatio: a.width && a.height ? clampRatio(a.width / a.height) : 0.8 };
}

export default function NewPhoto() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { dispatch } = useStore();
  const delight = useStore().state.delight;
  const buzz = useHaptics();
  const [photos, setPhotos] = useState<PostMedia[]>([]);
  const [filter, setFilter] = useState('none');
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<Post['audience']>('contacts');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [done, setDone] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  const room = MAX_PHOTOS - photos.length;
  const tint = FILTERS.find(f => f.id === filter)?.tint;

  const add = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotos(prev => [...prev, ...assets.map(toMedia)].slice(0, MAX_PHOTOS));
    setNotice(null);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    if (room <= 0) return;
    setBusy(true);
    try {
      // The system photo picker only shares the photos you choose, so no library-wide permission is needed.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: room > 1,
        selectionLimit: room,
        orderedSelection: true,
        quality: 0.85,
      });
      if (!res.canceled) add(res.assets.slice(0, room));
    } catch {
      setNotice({ title: 'Couldn’t open your photos', body: 'Something went wrong opening the photo picker. Please try again.' });
    } finally {
      setBusy(false);
    }
  }, [room, add]);

  const takePhoto = useCallback(async () => {
    if (room <= 0) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setNotice({
          title: 'Camera access is off',
          body: perm.canAskAgain
            ? 'hye needs the camera only to take the photo you’re about to share. You can still choose photos from your library.'
            : 'To take photos in hye, allow camera access in Settings. You can still choose photos from your library.',
          settings: !perm.canAskAgain,
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!res.canceled) add(res.assets.slice(0, 1));
    } catch {
      setNotice({ title: 'Camera isn’t available', body: 'This device can’t open the camera right now. Try choosing from your library instead.' });
    } finally {
      setBusy(false);
    }
  }, [room, add]);

  const remove = (i: number) => {
    buzz('select');
    setPhotos(prev => prev.filter((_, j) => j !== i));
  };

  const close = () => (photos.length && !done ? setConfirmLeave(true) : go.back());

  const share = () => {
    if (!photos.length || done) return;
    const post: Post = {
      id: newId('post'),
      kind: 'photo',
      authorId: 'me',
      text: caption.trim(),
      // Copy out of the picker cache so photos survive the OS clearing it.
      media: photos.map(m => ({ ...m, uri: keepFile(m.uri, "photos") })),
      createdAt: new Date().toISOString(),
      likes: [],
      reposts: [],
      comments: [],
      saved: false,
      views: 0,
      audience,
    };
    dispatch({ type: 'addPost', post });
    buzz('success');
    if (!delight.celebrations) {
      go.back();
      return;
    }
    setDone(true);
    leaveTimer.current = setTimeout(go.back, 1300);
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="close" label="Close" onPress={close} />
        <Txt variant="heading" style={{ flex: 1 }}>New photo</Txt>
        {photos.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Share photo" onPress={share} hitSlop={6} style={styles.headerShare}>
            <Text style={[type.subheading, { color: colors.accent }]}>Share</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {notice ? (
          <Banner
            icon="information-circle-outline"
            title={notice.title}
            body={notice.body}
            tone="warning"
            action={notice.settings ? <Button label="Open Settings" variant="secondary" compact onPress={() => Linking.openSettings().catch(() => undefined)} /> : undefined}
          />
        ) : null}

        {photos.length === 0 ? (
          <Animated.View entering={FadeIn.duration(250)} style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pickerIcon}>
              <Ionicons name="images" size={34} color="#fff" />
            </LinearGradient>
            <Txt variant="heading" style={{ textAlign: 'center' }}>Share a moment</Txt>
            <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              Choose up to {MAX_PHOTOS} photos. hye only sees the photos you pick, and they’re shared with your contacts unless you choose otherwise.
            </Txt>
            <GradientButton label="Choose from library" icon="images-outline" onPress={pickFromLibrary} disabled={busy} style={{ alignSelf: 'stretch' }} />
            <Button label="Take a photo" icon="camera-outline" variant="secondary" onPress={takePhoto} disabled={busy} />
          </Animated.View>
        ) : (
          <>
            <View style={[styles.preview, { borderColor: colors.border }]}>
              <MediaCarousel key={photos.map(p => p.uri).join('|')} media={photos} label="Preview of your photo" tint={tint} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {photos.map((p, i) => (
                <View key={`${i}:${p.uri}`} style={styles.thumb}>
                  <Image source={{ uri: p.uri }} style={[styles.thumbImg, { backgroundColor: colors.surfaceAlt }]} contentFit="cover" accessibilityIgnoresInvertColors />
                  {tint ? <View pointerEvents="none" style={[styles.thumbImg, StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => remove(i)} hitSlop={10} style={styles.thumbRemove}>
                    <Ionicons name="close-circle" size={22} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {room > 0 ? (
                <>
                  <PressableScale accessibilityRole="button" accessibilityLabel={`Add more photos, ${room} left`} onPress={pickFromLibrary} disabled={busy} style={[styles.thumbAdd, { borderColor: colors.borderStrong }]}>
                    <Ionicons name="add" size={26} color={colors.textMuted} />
                  </PressableScale>
                  <PressableScale accessibilityRole="button" accessibilityLabel="Take another photo" onPress={takePhoto} disabled={busy} style={[styles.thumbAdd, { borderColor: colors.borderStrong }]}>
                    <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
                  </PressableScale>
                </>
              ) : null}
            </ScrollView>
            <Txt variant="caption" color="textMuted">{photos.length} of {MAX_PHOTOS} photos</Txt>

            <View style={{ gap: space.sm }}>
              <Txt variant="small" color="textMuted">Look (preview)</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {FILTERS.map(f => (
                  <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => { buzz('select'); setFilter(f.id); }} />
                ))}
              </ScrollView>
            </View>

            <View style={{ gap: space.xs }}>
              <Txt variant="small" color="textMuted">Caption</Txt>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Write a caption…"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Caption"
                multiline
                maxLength={MAX_CAPTION}
                style={[styles.caption, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
              />
              {caption.length > MAX_CAPTION - 200 ? (
                <Txt variant="caption" color="textMuted" style={{ alignSelf: 'flex-end' }}>{MAX_CAPTION - caption.length} characters left</Txt>
              ) : null}
            </View>

            <View style={{ gap: space.sm }}>
              <Txt variant="small" color="textMuted">Who can see this</Txt>
              <View style={styles.chips}>
                <Chip label="My contacts" selected={audience === 'contacts'} onPress={() => setAudience('contacts')} />
                <Chip label="Everyone" selected={audience === 'everyone'} onPress={() => setAudience('everyone')} />
              </View>
            </View>

            <GradientButton label={audience === 'contacts' ? 'Share with my contacts' : 'Share with everyone'} icon="paper-plane" onPress={share} disabled={done} />
          </>
        )}
      </ScrollView>

      {done ? (
        <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, styles.done, { backgroundColor: colors.overlay }]} accessibilityLiveRegion="polite">
          <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.doneCard, { backgroundColor: colors.surface }]}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doneIcon}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </LinearGradient>
            <Txt variant="heading">Shared</Txt>
            <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              {audience === 'contacts' ? 'Your contacts can see it now.' : 'Everyone on hye can see it now.'}
            </Txt>
          </Animated.View>
        </Animated.View>
      ) : null}

      <ConfirmDialog
        visible={confirmLeave}
        title="Discard this photo?"
        body="The photos you picked and your caption won’t be saved."
        confirmLabel="Discard"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => { setConfirmLeave(false); go.back(); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingBottom: space.xs },
  headerShare: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center' },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  picker: { alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginTop: space.xl },
  pickerIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  preview: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumbs: { gap: space.sm, alignItems: 'center' },
  thumb: { width: 64, height: 64 },
  thumbImg: { width: 64, height: 64, borderRadius: radius.sm },
  thumbRemove: { position: 'absolute', top: 2, right: 2 },
  thumbAdd: { width: 64, height: 64, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.sm },
  caption: { minHeight: 96, borderRadius: radius.md, borderWidth: 1, padding: space.md, fontSize: 16, textAlignVertical: 'top' },
  done: { alignItems: 'center', justifyContent: 'center' },
  doneCard: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xxl, paddingVertical: space.xl, borderRadius: radius.lg, minWidth: 240 },
  doneIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
