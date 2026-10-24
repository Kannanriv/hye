import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { compact, PhotoAvatar, PressableScale, useHaptics } from '@/components/premium';
import { Screen } from '@/components/Screen';
import { ActionSheet, Card, Divider, IconButton, IconName, SectionTitle, ToggleRow, Txt } from '@/components/ui';
import type { AppState, User } from '@/domain/types';
import { AchievementTile } from '@/features/gamification/AchievementTile';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, Facts, LevelInfo, nextSteps, NextStep } from '@/features/gamification/engine';
import { LevelRing } from '@/features/gamification/LevelRing';
import { useGamification } from '@/features/gamification/useGamification';
import { useReduceMotion } from '@/features/gamification/useAchievementWatcher';
import { keepFile } from '@/services/importer';
import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The profile photo needs `avatarUrl?: string` on User (requested as a shared change).
// Until then it's read and written through this narrow type so nothing else is affected.
type UserWithPhoto = User & { avatarUrl?: string };

const ACHIEVEMENTS_HREF = '/achievements' as Href;

/** Masks every digit except the last four: +91 •••••• 3210 stays recognisable but private. */
function maskPhone(phone: string): string {
  return phone.replace(/\d(?=(?:\D*\d){4})/g, '•');
}

type Field = 'name' | 'handle' | 'bio';

export default function YouScreen() {
  const { state, dispatch, audit } = useStore();
  const { colors } = useTheme();
  const g = useGamification();
  const [editing, setEditing] = useState<Field | null>(null);
  const user = state.user as UserWithPhoto | null;

  const save = useCallback((field: Field, value: string) => {
    const v = value.trim();
    const patch: Partial<User> = field === 'name' ? { displayName: v } : field === 'handle' ? { handle: v || undefined } : { bio: v || undefined };
    dispatch({ type: 'patchUser', patch });
    audit('profile.updated', field === 'name' ? 'display name' : field === 'handle' ? 'username' : 'bio');
    setEditing(null);
  }, [dispatch, audit]);

  if (!user) return <Screen title="You"><View /></Screen>;

  return (
    <Screen
      title="You"
      actions={<IconButton icon="settings-outline" label="Settings" onPress={() => router.navigate('/(tabs)/settings')} />}
    >
      <ProfileHeader user={user} editing={editing} setEditing={setEditing} onSave={save} contacts={state.contacts} />
      {g.enabled ? <LevelCard level={g.level} xp={g.xp} /> : null}
      <StatsRow facts={g.facts} chats={state.conversations.filter(c => !c.archived).length} />
      {g.enabled ? <AchievementsPreview state={state} facts={g.facts} /> : null}
      <NextSteps state={state} ctx={g.ctx} onEditProfile={() => setEditing(!user.handle ? 'handle' : 'bio')} />
      <Shortcuts />
      <DelightCard />
      <Txt variant="caption" color="textMuted" style={{ textAlign: 'center', marginTop: space.sm }}>
        Your progress stays on this device. No leaderboards, no streaks.
      </Txt>
    </Screen>
  );
}

// ---------- Profile header ----------

const ProfileHeader = memo(function ProfileHeader({ user, editing, setEditing, onSave, contacts }: {
  user: UserWithPhoto; editing: Field | null; setEditing: (f: Field | null) => void; onSave: (f: Field, v: string) => void; contacts: AppState['contacts'];
}) {
  const { dispatch, audit } = useStore();
  const buzz = useHaptics();
  const [photoMenu, setPhotoMenu] = useState(false);

  const setPhoto = useCallback((uri: string | undefined) => {
    const patch: Partial<User> & { avatarUrl?: string } = { avatarUrl: uri };
    dispatch({ type: 'patchUser', patch });
    audit('profile.updated', uri ? 'profile photo' : 'profile photo removed');
    buzz('success');
  }, [dispatch, audit, buzz]);

  const pickPhoto = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled && res.assets[0]) setPhoto(keepFile(res.assets[0].uri, "profile"));
  }, [setPhoto]);

  const handleError = useCallback((v: string) => {
    const h = v.trim();
    if (!h) return null;
    if (!/^[a-z0-9_]{3,20}$/.test(h)) return 'Use 3–20 lowercase letters, numbers or _';
    if (contacts.some(c => c.handle.toLowerCase() === h)) return 'That username is taken';
    return null;
  }, [contacts]);

  return (
    <Animated.View entering={FadeInDown.duration(320)} style={styles.headerShadow}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.headerTop}>
          <PressableScale
            onPress={() => (user.avatarUrl ? setPhotoMenu(true) : pickPhoto())}
            accessibilityRole="button"
            accessibilityLabel={user.avatarUrl ? 'Change or remove profile photo' : 'Add a profile photo'}
            haptic="tap"
            style={styles.avatarWrap}
          >
            <View style={styles.avatarRing}>
              <PhotoAvatar name={user.displayName} uri={user.avatarUrl} size={76} />
            </View>
            <View style={styles.cameraDot}>
              <Ionicons name="camera" size={14} color="#4F46E5" />
            </View>
          </PressableScale>
          <View style={{ flex: 1, gap: space.xs }}>
            {editing === 'name' ? (
              <InlineEditor initial={user.displayName} label="Display name" maxLength={40} validate={v => (v.trim() ? null : 'Your name can’t be empty')} onSave={v => onSave('name', v)} onCancel={() => setEditing(null)} />
            ) : (
              <Pressable onPress={() => setEditing('name')} accessibilityRole="button" accessibilityLabel={`Display name, ${user.displayName}`} accessibilityHint="Edit your display name" hitSlop={6}>
                <Text style={[type.heading, styles.onGradient]} numberOfLines={1}>{user.displayName}</Text>
              </Pressable>
            )}
            {editing === 'handle' ? (
              <InlineEditor initial={user.handle ?? ''} label="Username" prefix="@" maxLength={20} autoCapitalize="none" validate={handleError} onSave={v => onSave('handle', v.toLowerCase())} onCancel={() => setEditing(null)} />
            ) : user.handle ? (
              <Pressable onPress={() => setEditing('handle')} accessibilityRole="button" accessibilityLabel={`Username, @${user.handle}`} accessibilityHint="Edit your username" hitSlop={6}>
                <Text style={[type.small, styles.onGradientMuted]}>@{user.handle}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setEditing('handle')} accessibilityRole="button" accessibilityLabel="Add a username" style={styles.ghostChip}>
                <Ionicons name="at" size={14} color="#fff" />
                <Text style={[type.caption, { color: '#fff', fontWeight: '700' }]}>Add a username</Text>
              </Pressable>
            )}
            {user.phone ? (
              <View style={styles.phone} accessible accessibilityLabel={`Phone number ending in ${user.phone.replace(/\D/g, '').slice(-4)}`}>
                <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.85)" />
                <Text style={[type.caption, styles.onGradientMuted]}>{maskPhone(user.phone)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {editing === 'bio' ? (
          <InlineEditor initial={user.bio ?? ''} label="Bio" multiline maxLength={160} onSave={v => onSave('bio', v)} onCancel={() => setEditing(null)} />
        ) : (
          <Pressable
            onPress={() => setEditing('bio')}
            accessibilityRole="button"
            accessibilityLabel={user.bio ? `Bio, ${user.bio}` : 'Add a short bio'}
            accessibilityHint="Edit your bio"
            style={styles.bio}
          >
            <Text style={[type.small, user.bio ? styles.onGradient : styles.onGradientMuted]} numberOfLines={4}>
              {user.bio || 'Add a short bio so friends know it’s you'}
            </Text>
            <Ionicons name="pencil" size={13} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
      </LinearGradient>
      <ActionSheet
        visible={photoMenu}
        title="Profile photo"
        onClose={() => setPhotoMenu(false)}
        actions={[
          { label: 'Choose a new photo', icon: 'image-outline', onPress: pickPhoto },
          { label: 'Remove photo', icon: 'trash-outline', danger: true, onPress: () => setPhoto(undefined) },
        ]}
      />
    </Animated.View>
  );
});

function InlineEditor({ initial, label, onSave, onCancel, multiline, maxLength, prefix, autoCapitalize, validate }: {
  initial: string; label: string; onSave: (v: string) => void; onCancel: () => void; multiline?: boolean; maxLength: number;
  prefix?: string; autoCapitalize?: 'none' | 'sentences'; validate?: (v: string) => string | null;
}) {
  const [value, setValue] = useState(initial);
  const error = validate?.(value) ?? null;
  return (
    <View style={{ gap: space.xs }}>
      <View style={[styles.editor, multiline && { minHeight: 76, alignItems: 'flex-start' }]}>
        {prefix ? <Text style={[type.body, styles.onGradient]}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoCorrect={!prefix}
          accessibilityLabel={label}
          placeholder={label}
          placeholderTextColor="rgba(255,255,255,0.6)"
          returnKeyType={multiline ? 'default' : 'done'}
          onSubmitEditing={multiline || error ? undefined : () => onSave(value)}
          style={[type.body, styles.onGradient, styles.editorInput]}
        />
      </View>
      <View style={styles.editorActions}>
        <Text style={[type.caption, error ? styles.errorText : styles.onGradientMuted, { flex: 1 }]} accessibilityLiveRegion="polite">
          {error ?? `${value.length}/${maxLength}`}
        </Text>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={`Cancel editing ${label.toLowerCase()}`} style={styles.editorBtn}>
          <Text style={[type.small, styles.onGradient, { fontWeight: '600' }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onSave(value)}
          disabled={!!error}
          accessibilityRole="button"
          accessibilityLabel={`Save ${label.toLowerCase()}`}
          accessibilityState={{ disabled: !!error }}
          style={[styles.editorBtn, styles.saveBtn, error ? { opacity: 0.5 } : null]}
        >
          <Text style={[type.small, { color: '#4F46E5', fontWeight: '700' }]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Level ----------

const LevelCard = memo(function LevelCard({ level, xp }: { level: LevelInfo; xp: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const toNext = level.next === null ? 0 : level.next - xp;
  const summary = level.next === null
    ? `Level ${level.level}, ${level.title}. ${xp} XP. Top level reached.`
    : `Level ${level.level}, ${level.title}. ${xp} XP. ${toNext} XP to ${level.nextTitle}.`;
  return (
    <PressableScale
      onPress={() => router.push(ACHIEVEMENTS_HREF)}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Opens your achievements"
      style={[styles.card, styles.levelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <LevelRing pct={level.pct} size={96} thickness={8} color={colors.accent} track={colors.surfaceAlt} reduceMotion={reduce}>
        <Text style={[type.caption, { color: colors.textMuted, fontWeight: '600' }]}>LEVEL</Text>
        <Text style={[type.title, { color: colors.text, lineHeight: 32 }]}>{level.level}</Text>
      </LevelRing>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="heading" numberOfLines={1}>{level.title}</Txt>
        <Txt variant="small" color="textMuted">
          {level.next === null ? 'Top level reached. Everything from here is a bonus.' : `${toNext} XP to ${level.nextTitle}`}
        </Txt>
        <Txt variant="caption" color="textMuted" style={{ marginTop: space.xs }}>
          {compact(xp)} XP from things you’ve done, never from time spent.
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
});

// ---------- Stats ----------

const StatsRow = memo(function StatsRow({ facts, chats }: { facts: Facts; chats: number }) {
  const items: { label: string; value: number; href: Href }[] = [
    { label: 'Posts', value: facts.textPosts, href: '/(tabs)/posts' },
    { label: 'Photos', value: facts.photos, href: '/(tabs)/photos' },
    { label: 'Reels', value: facts.reels, href: '/(tabs)/reels' },
    { label: 'Chats', value: chats, href: '/(tabs)' },
  ];
  const { colors } = useTheme();
  return (
    <View style={[styles.card, styles.stats, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {items.map((it, i) => (
        <PressableScale
          key={it.label}
          onPress={() => router.navigate(it.href)}
          accessibilityRole="button"
          accessibilityLabel={`${it.value} ${it.value === 1 ? it.label.toLowerCase().replace(/s$/, '') : it.label.toLowerCase()}. Open ${it.label}`}
          haptic="select"
          style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
        >
          <Text style={[type.heading, { color: colors.text }]}>{compact(it.value)}</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>{it.label}</Text>
        </PressableScale>
      ))}
    </View>
  );
});

// ---------- Achievements preview ----------

const AchievementsPreview = memo(function AchievementsPreview({ state, facts }: { state: AppState; facts: Facts }) {
  const { colors } = useTheme();
  const unlocked = new Map(state.progress.achievements.map(a => [a.id, a.unlockedAt]));
  const recent = [...state.progress.achievements].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt)).map(a => ACHIEVEMENT_BY_ID.get(a.id)).filter(x => !!x);
  const locked = ACHIEVEMENTS.filter(a => !unlocked.has(a.id));
  const shown = [...recent, ...locked].slice(0, 6);
  return (
    <View>
      <View style={styles.sectionHead}>
        <SectionTitle>Achievements · {unlocked.size} of {ACHIEVEMENTS.length}</SectionTitle>
        <Pressable onPress={() => router.push(ACHIEVEMENTS_HREF)} accessibilityRole="button" accessibilityLabel="See all achievements" hitSlop={10} style={styles.seeAll}>
          <Text style={[type.small, { color: colors.accent, fontWeight: '600' }]}>See all</Text>
        </Pressable>
      </View>
      <View style={[styles.card, styles.badgeGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {shown.map(def => (
          <View key={def.id} style={styles.badgeCell}>
            <AchievementTile def={def} facts={facts} unlockedAt={unlocked.get(def.id)} size={52} compact />
          </View>
        ))}
      </View>
    </View>
  );
});

// ---------- Next steps ----------

const NextSteps = memo(function NextSteps({ state, ctx, onEditProfile }: { state: AppState; ctx: ReturnType<typeof useGamification>['ctx']; onEditProfile: () => void }) {
  const { colors } = useTheme();
  const { steps, done, total } = useMemo(() => nextSteps(state, ctx), [state, ctx]);
  const open = (s: NextStep) => {
    if (s.id === 'profile') onEditProfile();
    else router.push(s.href as Href);
  };
  return (
    <View>
      <SectionTitle>Next steps</SectionTitle>
      <Card>
        <View style={styles.stepsHead} accessible accessibilityLabel={`${done} of ${total} essentials done`}>
          <Txt variant="small" color="textMuted">{done} of {total} essentials done</Txt>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={{ width: `${(done / total) * 100}%`, height: '100%', backgroundColor: colors.success, borderRadius: 4 }} />
          </View>
        </View>
        {steps.length ? steps.map(s => (
          <View key={s.id}>
            <Divider />
            <Pressable
              onPress={() => open(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}. ${s.detail}`}
              style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={[styles.stepIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={s.icon as IconName} size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="subheading">{s.label}</Txt>
                <Txt variant="caption" color="textMuted">{s.detail}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )) : (
          <>
            <Divider />
            <View style={styles.step}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Txt variant="small" style={{ flex: 1 }}>You’ve done all the essentials. Enjoy hye your way.</Txt>
            </View>
          </>
        )}
      </Card>
    </View>
  );
});

// ---------- Shortcuts ----------

const SHORTCUTS: { label: string; icon: IconName; href: Href; push?: boolean }[] = [
  { label: 'Messages', icon: 'chatbubbles-outline', href: '/(tabs)/messages' },
  { label: 'Communities', icon: 'people-outline', href: '/(tabs)/communities' },
  { label: 'Saved links', icon: 'bookmark-outline', href: '/(tabs)/feed' },
  { label: 'Connections', icon: 'git-network-outline', href: '/(tabs)/connections' },
  { label: 'Archive', icon: 'archive-outline', href: '/(tabs)/archive' },
  { label: 'Import', icon: 'download-outline', href: '/import', push: true },
  { label: 'Search', icon: 'search-outline', href: '/search', push: true },
  { label: 'Settings', icon: 'settings-outline', href: '/(tabs)/settings' },
];

const Shortcuts = memo(function Shortcuts() {
  const { colors } = useTheme();
  return (
    <View>
      <SectionTitle>Shortcuts</SectionTitle>
      <View style={[styles.card, styles.grid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {SHORTCUTS.map(s => (
          <PressableScale
            key={s.label}
            onPress={() => (s.push ? router.push(s.href) : router.navigate(s.href))}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            haptic="tap"
            style={styles.gridCell}
          >
            <View style={[styles.gridIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={s.icon} size={22} color={colors.accent} />
            </View>
            <Text style={[type.caption, { color: colors.text, fontWeight: '600', textAlign: 'center' }]} numberOfLines={1}>{s.label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
});

// ---------- Delight ----------

const DelightCard = memo(function DelightCard() {
  const { state, dispatch } = useStore();
  const d = state.delight;
  const set = (patch: Partial<AppState['delight']>) => dispatch({ type: 'delight', patch });
  return (
    <View>
      <SectionTitle>Delight</SectionTitle>
      <Card>
        <View style={{ padding: space.lg, paddingBottom: space.xs }}>
          <Txt variant="small" color="textMuted">All optional. hye works exactly the same with these off.</Txt>
        </View>
        <ToggleRow icon="pulse-outline" label="Haptics" detail="Gentle taps when you like, send or save" value={d.haptics} onChange={v => set({ haptics: v })} />
        <Divider />
        <ToggleRow icon="sparkles-outline" label="Celebrations" detail="A short, skippable moment when you unlock something" value={d.celebrations} onChange={v => set({ celebrations: v })} />
        <Divider />
        <ToggleRow icon="trophy-outline" label="Game elements" detail="XP, levels and achievements. Turning this off hides them and pauses tracking" value={d.gamification} onChange={v => set({ gamification: v })} />
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  headerShadow: { borderRadius: radius.lg, shadowColor: '#4F46E5', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  header: { borderRadius: radius.lg, padding: space.lg, gap: space.md, overflow: 'hidden' },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 3, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.35)' },
  cameraDot: { position: 'absolute', right: 0, bottom: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  onGradient: { color: '#fff' },
  onGradientMuted: { color: 'rgba(255,255,255,0.85)' },
  errorText: { color: '#FFE4E6', fontWeight: '700' },
  ghostChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: space.md, minHeight: 32, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bio: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, minHeight: 44, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.14)' },
  editor: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: space.md, minHeight: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  editorInput: { flex: 1, paddingVertical: space.sm },
  editorActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editorBtn: { minHeight: 36, minWidth: 64, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: '#fff' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg },
  stats: { flexDirection: 'row', paddingVertical: space.sm },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  seeAll: { minHeight: 44, justifyContent: 'flex-end', paddingBottom: space.xs, paddingHorizontal: space.xs },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: space.sm, paddingHorizontal: space.xs },
  badgeCell: { width: '33.333%', paddingHorizontal: space.xs },
  stepsHead: { padding: space.lg, gap: space.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: space.sm },
  gridCell: { width: '25%', alignItems: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: 2, minHeight: 76 },
  gridIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
