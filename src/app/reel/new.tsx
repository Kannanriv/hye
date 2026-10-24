import { Ionicons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { GradientButton, PressableScale, useHaptics } from '@/components/premium';
import { Screen } from '@/components/Screen';
import { Banner, Chip, TextField, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import type { Post } from '@/domain/types';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const MAX_SECONDS = 60;
const MAX_CAPTION = 300;

interface Picked { uri: string; aspectRatio?: number; seconds?: number }

/** The picker's copy lives in the cache, which the OS may clear; keep our own copy with the app's documents. */
function keepCopy(uri: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'reels');
    if (!dir.exists) dir.create({ intermediates: true });
    const ext = uri.match(/\.(\w{2,4})(?:\?|$)/)?.[1] ?? 'mp4';
    const dest = new File(dir, `${newId('reel')}.${ext}`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

export default function NewReelScreen() {
  const { dispatch } = useStore();
  const { colors } = useTheme();
  const buzz = useHaptics();
  const [video, setVideo] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<Post['audience']>('everyone');
  const [error, setError] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [posting, setPosting] = useState(false);

  const player = useVideoPlayer(null, p => { p.loop = true; });
  useEffect(() => {
    if (!video) return;
    player.replaceAsync({ uri: video.uri }).then(() => player.play()).catch(() => setError('We couldn’t preview that video. Try a different one.'));
  }, [player, video]);
  useEffect(() => { player.muted = previewMuted; }, [player, previewMuted]);

  const pick = async () => {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: MAX_SECONDS,
        allowsEditing: Platform.OS === 'ios', // iOS offers trimming
        quality: 1,
      });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const seconds = a.duration ? a.duration / 1000 : undefined;
      if (seconds && seconds > MAX_SECONDS + 0.5) {
        setError(`That video is ${Math.round(seconds)} seconds long. Reels can be up to ${MAX_SECONDS} seconds — trim it in your gallery app, then pick it again.`);
        return;
      }
      buzz('select');
      setVideo({ uri: a.uri, aspectRatio: a.width && a.height ? a.width / a.height : undefined, seconds });
    } catch {
      setError('We couldn’t open your library. Check that hye is allowed to access your videos in Settings.');
    }
  };

  const post = () => {
    if (!video || posting) return;
    setPosting(true);
    player.pause();
    const reel: Post = {
      id: newId('post'),
      kind: 'reel',
      authorId: 'me',
      text: caption.trim(),
      media: [{ kind: 'video', uri: keepCopy(video.uri), aspectRatio: video.aspectRatio }],
      createdAt: new Date().toISOString(),
      likes: [],
      reposts: [],
      comments: [],
      saved: false,
      views: 0,
      audience,
    };
    dispatch({ type: 'addPost', post: reel });
    buzz('success');
    if (router.canGoBack()) router.back();
    else router.replace('/reels');
  };

  return (
    <Screen title="New reel" back>
      {video ? (
        <View style={styles.previewWrap}>
          <View style={[styles.preview, { backgroundColor: '#000' }]}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} accessibilityLabel="Preview of your reel" />
            <View style={styles.previewActions}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={previewMuted ? 'Unmute preview' : 'Mute preview'}
                onPress={() => setPreviewMuted(m => !m)}
                style={styles.roundBtn}
              >
                <Ionicons name={previewMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
              </PressableScale>
              <PressableScale accessibilityRole="button" accessibilityLabel="Choose a different video" haptic="tap" onPress={pick} style={styles.roundBtn}>
                <Ionicons name="swap-horizontal" size={20} color="#fff" />
              </PressableScale>
            </View>
            {video.seconds ? (
              <View style={styles.duration}><Txt variant="caption" style={{ color: '#fff', fontWeight: '700' }}>{`0:${String(Math.round(video.seconds)).padStart(2, '0')}`}</Txt></View>
            ) : null}
          </View>
        </View>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Choose a video from your library"
          accessibilityHint={`Videos up to ${MAX_SECONDS} seconds`}
          haptic="tap"
          onPress={pick}
          style={[styles.picker, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
        >
          <View style={[styles.pickIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="videocam" size={30} color={colors.accent} />
          </View>
          <Txt variant="subheading">Choose a video</Txt>
          <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>Pick a clip from your library, up to {MAX_SECONDS} seconds. Vertical videos look best.</Txt>
        </PressableScale>
      )}

      {error ? <Banner icon="alert-circle-outline" tone="danger" title="That didn’t work" body={error} /> : null}

      <TextField
        label="Caption"
        placeholder="What’s happening in this clip? Add #hashtags"
        value={caption}
        onChangeText={setCaption}
        maxLength={MAX_CAPTION}
        multiline
        style={{ minHeight: 88, textAlignVertical: 'top' }}
      />
      <Txt variant="caption" color="textMuted" style={{ alignSelf: 'flex-end', marginTop: -space.sm }}>{`${caption.length}/${MAX_CAPTION}`}</Txt>

      <Txt variant="small" color="textMuted">Who can see it</Txt>
      <View style={styles.chips}>
        <Chip label="Everyone" selected={audience === 'everyone'} onPress={() => setAudience('everyone')} />
        <Chip label="Contacts only" selected={audience === 'contacts'} onPress={() => setAudience('contacts')} />
      </View>

      <GradientButton label={posting ? 'Sharing…' : 'Share reel'} icon="paper-plane" onPress={post} disabled={!video || posting} style={{ marginTop: space.md }} />
      {!video ? <Txt variant="caption" color="textMuted" style={{ textAlign: 'center' }}>Choose a video to share your reel.</Txt> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: 'center' },
  preview: { width: '100%', maxWidth: 320, aspectRatio: 9 / 16, borderRadius: radius.lg, overflow: 'hidden' },
  previewActions: { position: 'absolute', right: space.sm, top: space.sm, gap: space.sm },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', left: space.sm, bottom: space.sm, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.55)' },
  picker: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed' },
  pickIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  chips: { flexDirection: 'row', gap: space.sm },
});
