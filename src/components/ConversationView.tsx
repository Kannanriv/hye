import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ComponentRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '@/domain/hash';
import { BLOCKED_EXTENSIONS } from '@/services/importer';
import type { Attachment, Conversation, Message } from '@/domain/types';
import { ChatAvatar } from '@/features/chats/ChatAvatar';
import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useIsWide, useTheme } from '@/theme/useTheme';
import { formatDateTime, formatDay, formatTime } from '@/utils/time';
import { PressableScale, useHaptics } from './premium';
import { ActionSheet, Banner, Button, Chip, ConfirmDialog, EmptyState, IconButton, IconName, platformLabel, SheetFrame, SourceBadge, Txt } from './ui';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'];

type Item = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: Message; showName: boolean };

export function ConversationView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { state, dispatch, sendMessage, markRead, typing, audit } = useStore();
  const { colors } = useTheme();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const conv = state.conversations.find(c => c.id === conversationId);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [notice, setNotice] = useState<string>();
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const buzz = useHaptics();
  const reduceMotion = useReducedMotion();
  // Only messages that arrive while the chat is open animate in; history renders instantly.
  const openedAt = useRef(new Date().toISOString()).current;

  const messages = useMemo(
    () => state.messages.filter(m => m.conversationId === conversationId).sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [state.messages, conversationId],
  );
  const byId = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages]);
  const blocked = conv?.kind === 'direct' && conv.members.some(m => state.contacts.find(c => c.id === m.contactId)?.blocked);

  useEffect(() => {
    if (conv && conv.origin === 'native') markRead(conv.id);
  }, [conv?.id, messages.length, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Newest-first list rendered inverted, with day separators.
  const items = useMemo<Item[]>(() => {
    const q = find.trim().toLowerCase();
    const list = q ? messages.filter(m => m.text.toLowerCase().includes(q)) : messages;
    const out: Item[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const prev = list[i - 1];
      out.push({ kind: 'msg', key: m.id, m, showName: conv?.kind === 'group' && m.senderId !== 'me' && (!prev || prev.senderId !== m.senderId) });
      if (!prev || formatDay(prev.sentAt) !== formatDay(m.sentAt)) out.push({ kind: 'day', key: `d_${m.id}`, label: formatDay(m.sentAt) });
    }
    return out;
  }, [messages, find, conv?.kind]);

  const onLongPress = useCallback((m: Message) => setMenu(m), []);
  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === 'day' ? (
        <View style={styles.day}><Txt variant="caption" color="textMuted" style={[styles.dayPill, { backgroundColor: colors.surface }]}>{item.label}</Txt></View>
      ) : (
        <Bubble
          m={item.m}
          showName={item.showName}
          replied={item.m.replyToId ? byId.get(item.m.replyToId) : undefined}
          onLongPress={onLongPress}
          readReceipts={state.privacy.readReceipts}
          animate={!reduceMotion && item.m.sentAt >= openedAt}
        />
      ),
    [byId, onLongPress, colors.surface, state.privacy.readReceipts, reduceMotion, openedAt],
  );

  if (!conv) {
    return <EmptyState icon="chatbubble-ellipses-outline" title="Conversation not found" body="It may have been deleted." action={onBack ? <Button label="Back" variant="secondary" compact onPress={onBack} /> : undefined} />;
  }

  const imported = conv.origin === 'imported';
  const memberNames = conv.kind === 'group'
    ? conv.members.filter(m => m.contactId !== 'me').map(m => state.contacts.find(c => c.id === m.contactId)?.displayName.split(' ')[0]).filter(Boolean).join(', ')
    : '';
  const demoPeer = !imported && conv.members.some(m => state.contacts.find(c => c.id === m.contactId)?.isDemo);
  const typingHere = typing?.conversationId === conv.id && state.privacy.typingIndicators;
  const subtitle = typingHere
    ? `${typing!.name.split(' ')[0]} is typing…`
    : imported
      ? `${conv.importedParticipants?.length ?? 0} participants · history only`
      : conv.kind === 'group'
        ? `You, ${memberNames}${demoPeer ? ' · demo group, simulated replies' : ''}`
        : demoPeer ? 'Demo contact · simulated replies' : '';

  const send = () => {
    const text = draft.trim();
    if (!text && !pending.length) return;
    if (editing) {
      dispatch({ type: 'patchMessage', id: editing.id, patch: { text, editedAt: new Date().toISOString() } });
      setEditing(null);
    } else {
      sendMessage(conv.id, text, { attachments: pending, replyToId: replyTo?.id });
    }
    buzz('tap');
    setDraft('');
    setPending([]);
    setReplyTo(null);
  };

  const attach = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, type: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/*', 'text/*'] });
    if (res.canceled) return;
    const blocked = res.assets.filter(a => BLOCKED_EXTENSIONS.test(a.name)).length;
    setNotice(blocked ? `${blocked} file${blocked > 1 ? 's' : ''} weren’t added. Apps and scripts can’t be shared.` : undefined);
    setPending(p => [
      ...p,
      ...res.assets.filter(a => !BLOCKED_EXTENSIONS.test(a.name)).map(a => ({
        id: newId('att'),
        fileName: a.name,
        uri: a.uri,
        kind: (a.mimeType?.startsWith('image/') ? 'image' : a.mimeType?.startsWith('video/') ? 'video' : a.mimeType?.startsWith('audio/') ? 'audio' : 'document') as Attachment['kind'],
      })),
    ]);
  };

  const m = menu;
  const mine = m?.senderId === 'me';
  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border, paddingTop: insets.top + space.sm }]}>
        {onBack ? <IconButton icon="arrow-back" label="Back" onPress={onBack} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${conv.title}. Conversation details`}
          style={styles.headerTitle}
          onPress={() => router.push({ pathname: '/conversation/[id]/details', params: { id: conv.id } })}
        >
          <ChatAvatar conv={conv} contacts={state.contacts} size={40} />
          <View style={styles.flex}>
            <Txt variant="subheading" numberOfLines={1}>{conv.title}</Txt>
            {subtitle ? <Txt variant="caption" color={typingHere ? 'accent' : 'textMuted'} numberOfLines={1}>{subtitle}</Txt> : null}
          </View>
        </Pressable>
        <IconButton icon="search" label="Search in conversation" onPress={() => setFindOpen(o => !o)} />
        <IconButton icon="information-circle-outline" label="Conversation details" onPress={() => router.push({ pathname: '/conversation/[id]/details', params: { id: conv.id } })} />
      </View>

      {findOpen ? (
        <View style={[styles.find, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput autoFocus value={find} onChangeText={setFind} placeholder="Find in this conversation" placeholderTextColor={colors.textMuted} style={[type.body, styles.flex, { color: colors.text }]} accessibilityLabel="Find in this conversation" />
          <Txt variant="caption" color="textMuted">{find ? `${items.filter(i => i.kind === 'msg').length} found` : ''}</Txt>
        </View>
      ) : null}

      {imported ? (
        <View style={styles.bannerWrap}>
          <Banner
            icon="archive-outline"
            tone="imported"
            title={`Imported from a ${platformLabel(conv.source)} export`}
            body={`History only — not synced, and replies here won’t reach ${platformLabel(conv.source)}. Times are as recorded on the exporting phone (${conv.provenance?.timezoneNote ?? 'time zone unknown'}). Stored on this device, not end-to-end encrypted by hye.`}
          />
        </View>
      ) : null}

      <View style={styles.flex}>
      <Wallpaper />
      <FlatList
        inverted
        data={items}
        keyExtractor={i => i.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<View style={styles.invertFix}><EmptyState icon={find ? 'search' : 'hand-left-outline'} title={find ? 'No matching messages' : 'Say hye 👋'} body={find ? undefined : 'Messages you send appear here.'} /></View>}
        ListHeaderComponent={typingHere ? <TypingDots name={typing!.name} /> : undefined}
        keyboardShouldPersistTaps="handled"
        windowSize={11}
      />
      </View>

      {imported ? null : blocked ? (
        <View style={[styles.composerWrap, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.sm }]}>
          <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>You blocked this contact.</Txt>
          <Button
            label="Unblock"
            compact
            variant="secondary"
            onPress={() => conv.members.forEach(mem => {
              const c = state.contacts.find(x => x.id === mem.contactId);
              if (c?.blocked) { dispatch({ type: 'patchContact', id: c.id, patch: { blocked: false } }); audit('contact.unblocked', c.displayName); }
            })}
          />
        </View>
      ) : (
        <View style={[styles.composerWrap, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: (wide ? 0 : insets.bottom) + space.sm }]}>
          {replyTo || editing ? (
            <View style={[styles.context, { borderColor: colors.accent, backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.flex}>
                <Txt variant="caption" color="accent">{editing ? 'Editing message' : `Replying to ${replyTo!.senderId === 'me' ? 'yourself' : replyTo!.senderName}`}</Txt>
                <Txt variant="small" color="textMuted" numberOfLines={1}>{(editing ?? replyTo)!.text || 'Attachment'}</Txt>
              </View>
              <IconButton icon="close" label="Cancel" size={18} onPress={() => { setReplyTo(null); if (editing) setDraft(''); setEditing(null); }} />
            </View>
          ) : null}
          {notice ? <Txt variant="caption" color="warning">{notice}</Txt> : null}
          {pending.length ? (
            <View style={styles.pending}>
              {pending.map(a => <Chip key={a.id} label={`✕ ${a.fileName}`} onPress={() => setPending(p => p.filter(x => x.id !== a.id))} />)}
            </View>
          ) : null}
          <View style={styles.composer}>
            {!editing ? <IconButton icon="attach" label="Attach files" onPress={attach} color="textMuted" /> : null}
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              multiline
              accessibilityLabel="Message"
              onKeyPress={e => {
                // Desktop/web: Enter sends, Shift+Enter adds a new line.
                const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
                  (e as unknown as { preventDefault: () => void }).preventDefault();
                  send();
                }
              }}
              style={[type.body, styles.input, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            />
            <SendButton active={!!draft.trim() || pending.length > 0} editing={!!editing} onPress={send} />
          </View>
        </View>
      )}

      <ActionSheet
        visible={!!m}
        onClose={() => setMenu(null)}
        header={m && !imported && !m.deletedAt ? (
          <View style={styles.reactRow}>
            {QUICK_REACTIONS.map((e, i) => {
              const on = m.reactions.some(r => r.by === 'me' && r.emoji === e);
              return (
                <Animated.View key={e} entering={reduceMotion ? undefined : ZoomIn.delay(i * 35).springify().damping(11)}>
                  <PressableScale
                    scaleTo={0.8}
                    haptic="select"
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${e}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => { dispatch({ type: 'toggleReaction', id: m.id, emoji: e }); setMenu(null); }}
                    style={[styles.reactBtn, { backgroundColor: on ? colors.accentSoft : colors.surfaceAlt, borderColor: on ? colors.accent : 'transparent' }]}
                  >
                    <Txt variant="heading">{e}</Txt>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        ) : m && imported ? (
          <Txt variant="caption" color="textMuted" style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            {`From ${m.sourceRef ?? 'export'} · ${formatDateTime(m.sentAt)}`}
          </Txt>
        ) : undefined}
        actions={m ? [
          { label: 'Reply', icon: 'arrow-undo-outline', onPress: () => { setReplyTo(m); input.current?.focus(); }, hidden: imported || !!m.deletedAt || !!blocked },
          { label: 'Copy text', icon: 'copy-outline', onPress: () => Clipboard.setStringAsync(m.text), hidden: !m.text },
          { label: 'Forward', icon: 'arrow-redo-outline', onPress: () => setForwarding(m), hidden: !!m.deletedAt || !!m.system },
          { label: 'Edit', icon: 'create-outline', onPress: () => { setEditing(m); setDraft(m.text); input.current?.focus(); }, hidden: imported || !mine || !!m.deletedAt || !m.text },
          { label: 'Delete message', icon: 'trash-outline', danger: true, onPress: () => setDeleting(m), hidden: imported || !mine || !!m.deletedAt },
        ] : []}
      />
      <ForwardSheet message={forwarding} from={conv} onClose={() => setForwarding(null)} />
      <ConfirmDialog
        visible={!!deleting}
        title="Delete this message?"
        body="It’s replaced with “This message was deleted” in this chat. You can’t undo this."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            dispatch({ type: 'patchMessage', id: deleting.id, patch: { deletedAt: new Date().toISOString(), text: '', attachments: [] } });
            audit('message.deleted', `in ${conv.title}`);
          }
          setDeleting(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

// My bubbles use the first two (darkest) brand stops so white text stays above 4.5:1 everywhere on the gradient.
const MY_BUBBLE = [gradients.brand[0], gradients.brand[1]] as const;

const Bubble = memo(function Bubble({ m, showName, replied, onLongPress, readReceipts, animate }: {
  m: Message; showName: boolean; replied?: Message; onLongPress: (m: Message) => void; readReceipts: boolean; animate: boolean;
}) {
  const { colors } = useTheme();
  // Reactions only pop when they change after the bubble is on screen, not while scrolling history.
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  if (m.system) {
    return <View style={styles.day}><Txt variant="caption" color="textMuted" style={[styles.system, { backgroundColor: colors.surfaceAlt }]}>{m.text}</Txt></View>;
  }
  const mine = m.senderId === 'me';
  const fg = mine ? colors.bubbleMeText : colors.text;
  const muted = mine ? colors.bubbleMeMuted : colors.textMuted;
  const status = m.status && mine ? m.status : null;
  const statusIcon = status === 'read' && readReceipts ? 'checkmark-done' : status === 'delivered' || status === 'read' ? 'checkmark-done-outline' : status === 'sent' ? 'checkmark' : status === 'failed' ? 'alert-circle' : 'time-outline';
  const a11y = `${mine ? 'You' : m.senderName}, ${formatTime(m.sentAt)}: ${m.deletedAt ? 'message deleted' : m.text || 'attachment'}${m.editedAt ? ', edited' : ''}${m.reactions.length ? `, reactions ${m.reactions.map(r => r.emoji).join(' ')}` : ''}${status ? `, ${status}` : ''}`;

  return (
    <Animated.View
      entering={animate ? FadeInDown.springify().damping(16).stiffness(180) : undefined}
      style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}
    >
      <Pressable
        accessibilityLabel={a11y}
        accessibilityHint="Long-press for actions"
        accessibilityActions={[{ name: 'longpress', label: 'Message actions' }]}
        onAccessibilityAction={() => onLongPress(m)}
        // Right-click on web/desktop opens the same menu.
        {...(Platform.OS === 'web' ? { onContextMenu: (e: { preventDefault: () => void }) => { e.preventDefault(); onLongPress(m); } } : {})}
        onLongPress={() => onLongPress(m)}
        delayLongPress={300}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, { backgroundColor: mine ? colors.bubbleMe : colors.bubbleThem, borderColor: colors.border }]}
      >
        {mine ? <LinearGradient colors={MY_BUBBLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
        {showName ? <Txt variant="caption" color="accent" style={{ fontWeight: '700' }}>{m.senderName}</Txt> : null}
        {m.forwardedFrom ? (
          <View style={styles.inline}><Ionicons name="arrow-redo" size={12} color={muted} /><Txt variant="caption" style={{ color: muted, fontStyle: 'italic' }}>Forwarded from {m.forwardedFrom}</Txt></View>
        ) : null}
        {replied ? (
          <View style={[styles.quote, { borderColor: mine ? '#fff' : colors.accent, backgroundColor: mine ? 'rgba(255,255,255,0.15)' : colors.surfaceAlt }]}>
            <Txt variant="caption" style={{ color: fg, fontWeight: '700' }}>{replied.senderId === 'me' ? 'You' : replied.senderName}</Txt>
            <Txt variant="caption" style={{ color: muted }} numberOfLines={2}>{replied.deletedAt ? 'Message deleted' : replied.text || 'Attachment'}</Txt>
          </View>
        ) : null}
        {m.deletedAt ? (
          <View style={styles.inline}><Ionicons name="ban-outline" size={14} color={muted} /><Txt variant="small" style={{ color: muted, fontStyle: 'italic' }}>This message was deleted</Txt></View>
        ) : null}
        {m.attachments.map(a => <AttachmentView key={a.id} a={a} mine={mine} />)}
        {m.text ? <Txt style={{ color: fg }}>{m.text}</Txt> : null}
        <View style={[styles.meta, { alignSelf: 'flex-end' }]}>
          {m.editedAt ? <Txt variant="caption" style={{ color: muted }}>edited</Txt> : null}
          <Txt variant="caption" style={{ color: muted }}>{formatTime(m.sentAt)}</Txt>
          {status ? <Ionicons name={statusIcon} size={14} color={status === 'failed' ? colors.danger : muted} /> : null}
        </View>
      </Pressable>
      {m.reactions.length ? (
        // Re-keyed on change so a new reaction pops in.
        <Animated.View
          key={m.reactions.map(r => r.emoji + r.by).join()}
          entering={mounted.current ? ZoomIn.springify().damping(10) : undefined}
          style={[styles.reactions, { backgroundColor: colors.surface, borderColor: colors.border, alignSelf: mine ? 'flex-end' : 'flex-start' }]}
        >
          <Txt variant="caption">{[...new Set(m.reactions.map(r => r.emoji))].join('')}{m.reactions.length > 1 ? ` ${m.reactions.length}` : ''}</Txt>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

/** Soft, theme-aware chat wallpaper: a faint wash plus a sparse doodle pattern. Purely decorative. */
const DOODLES: { icon: IconName; x: number; y: number; r: number }[] = [
  { icon: 'chatbubble-outline', x: 6, y: 4, r: -12 }, { icon: 'heart-outline', x: 58, y: 9, r: 10 },
  { icon: 'star-outline', x: 84, y: 22, r: -6 }, { icon: 'cafe-outline', x: 22, y: 20, r: 8 },
  { icon: 'musical-note-outline', x: 46, y: 33, r: -14 }, { icon: 'happy-outline', x: 8, y: 42, r: 6 },
  { icon: 'airplane-outline', x: 74, y: 44, r: 18 }, { icon: 'leaf-outline', x: 30, y: 56, r: -10 },
  { icon: 'camera-outline', x: 88, y: 63, r: 4 }, { icon: 'sparkles-outline', x: 56, y: 68, r: -4 },
  { icon: 'moon-outline', x: 12, y: 74, r: 12 }, { icon: 'balloon-outline', x: 40, y: 86, r: -8 },
  { icon: 'paw-outline', x: 78, y: 88, r: 10 }, { icon: 'pizza-outline', x: 4, y: 94, r: -16 },
];

const Wallpaper = memo(function Wallpaper() {
  const { colors, mode } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={[colors.bg, colors.accentSoft, colors.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {DOODLES.map(d => (
        <Ionicons
          key={d.icon}
          name={d.icon}
          size={26}
          color={colors.textMuted}
          style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, opacity: mode === 'dark' ? 0.08 : 0.07, transform: [{ rotate: `${d.r}deg` }] }}
        />
      ))}
    </View>
  );
});

/** Send button that morphs from a quiet circle into the brand gradient when there's something to send. */
function SendButton({ active, editing, onPress }: { active: boolean; editing: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = reduceMotion ? (active ? 1 : 0) : withSpring(active ? 1 : 0, { damping: 13, stiffness: 220 });
  }, [active, reduceMotion, on]);
  const fill = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.6 + on.value * 0.4 }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${(1 - on.value) * -90}deg` }, { scale: 0.85 + on.value * 0.15 }] }));
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={editing ? 'Save edit' : 'Send'}
      accessibilityState={{ disabled: !active }}
      disabled={!active}
      scaleTo={0.88}
      onPress={onPress}
      style={[styles.send, { backgroundColor: colors.surfaceAlt }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.sendFill, fill]}>
        <LinearGradient colors={MY_BUBBLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={icon}>
        <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={22} color={active ? '#FFFFFF' : colors.textMuted} />
      </Animated.View>
    </PressableScale>
  );
}

function AttachmentView({ a, mine }: { a: Attachment; mine: boolean }) {
  const { colors } = useTheme();
  const muted = mine ? colors.bubbleMeMuted : colors.textMuted;
  if (a.kind === 'image' && a.uri) {
    return <Image source={{ uri: a.uri }} style={styles.image} contentFit="cover" accessibilityLabel={`Photo ${a.fileName}`} />;
  }
  const icon = { image: 'image-outline', video: 'videocam-outline', audio: 'musical-notes-outline', document: 'document-text-outline', other: 'attach-outline' }[a.kind] as 'image-outline';
  return (
    <View style={[styles.file, { backgroundColor: mine ? 'rgba(255,255,255,0.15)' : colors.surfaceAlt }]}>
      <Ionicons name={a.uri ? icon : 'cloud-offline-outline'} size={20} color={muted} />
      <View style={styles.flex}>
        <Txt variant="small" style={{ color: mine ? '#fff' : colors.text }} numberOfLines={1}>{a.fileName}</Txt>
        {a.missingReason ? <Txt variant="caption" style={{ color: muted }}>{a.missingReason}</Txt> : null}
      </View>
    </View>
  );
}

function TypingDots({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]} accessibilityLiveRegion="polite" accessibilityLabel={`${name} is typing`}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing, { backgroundColor: colors.bubbleThem, borderColor: colors.border }]}>
        {[0, 1, 2].map(i => <Dot key={i} index={i} />)}
      </View>
    </View>
  );
}

function Dot({ index }: { index: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.value = withDelay(index * 140, withRepeat(withSequence(withTiming(-5, { duration: 260 }), withTiming(0, { duration: 260 }), withTiming(0, { duration: 320 })), -1));
  }, [index, reduceMotion, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.5 + (-y.value / 5) * 0.5 }));
  return <Animated.View style={[styles.dot, { backgroundColor: colors.textMuted }, style]} />;
}

function ForwardSheet({ message, from, onClose }: { message: Message | null; from: Conversation; onClose: () => void }) {
  const { state, sendMessage } = useStore();
  const { colors } = useTheme();
  const targets = state.conversations.filter(c => c.origin === 'native' && !c.archived);
  const [picked, setPicked] = useState<string[]>([]);
  if (!message) return null;
  const source = from.origin === 'imported' ? `${from.title} (${platformLabel(from.source)} import)` : message.senderId === 'me' ? from.title : message.senderName;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SheetFrame onClose={onClose}>
          <Txt variant="heading" style={{ paddingHorizontal: space.lg }}>Forward to…</Txt>
          <Txt variant="caption" color="textMuted" style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>Recipients will see “Forwarded from {source}”.</Txt>
          <FlatList
            data={targets}
            keyExtractor={c => c.id}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => {
              const on = picked.includes(item.id);
              return (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked(p => (on ? p.filter(x => x !== item.id) : [...p, item.id]))} style={styles.pickRow}>
                  <ChatAvatar conv={item} contacts={state.contacts} size={36} />
                  <Txt style={styles.flex}>{item.title}</Txt>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.accent : colors.textMuted} />
                </Pressable>
              );
            }}
          />
          <View style={{ padding: space.lg }}>
            <Button
              label={picked.length ? `Forward to ${picked.length}` : 'Choose conversations'}
              disabled={!picked.length}
              onPress={() => {
                picked.forEach(id => sendMessage(id, message.text, { attachments: message.attachments.filter(a => a.uri), forwardedFrom: source }));
                setPicked([]);
                onClose();
              }}
            />
          </View>
      </SheetFrame>
    </Modal>
  );
}

export function SourceLine({ conv }: { conv: Conversation }) {
  return <SourceBadge source={conv.source} imported={conv.origin === 'imported'} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: space.xs },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xs },
  find: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, height: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  bannerWrap: { padding: space.md },
  list: { paddingHorizontal: space.md, paddingVertical: space.md, flexGrow: 1 },
  invertFix: { transform: [{ scaleY: -1 }], flex: 1 },
  day: { alignItems: 'center', marginVertical: space.sm },
  dayPill: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  system: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, overflow: 'hidden', textAlign: 'center', maxWidth: 520 },
  bubbleRow: { marginVertical: 2 },
  bubble: { maxWidth: '82%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, gap: 4 },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 6, overflow: 'hidden' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quote: { borderLeftWidth: 3, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: 6 },
  reactions: { marginTop: -6, marginHorizontal: space.sm, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  image: { width: 220, height: 220, borderRadius: radius.md },
  file: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.sm, minWidth: 200 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, paddingHorizontal: space.sm, gap: space.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: space.lg, paddingTop: 11, paddingBottom: 11 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendFill: { borderRadius: 22, overflow: 'hidden' },
  context: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, borderRadius: radius.sm, paddingLeft: space.md },
  pending: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  reactRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: space.lg, paddingBottom: space.md },
  reactBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 52 },
});
