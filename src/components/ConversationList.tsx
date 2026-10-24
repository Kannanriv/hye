import { Ionicons } from '@expo/vector-icons';
import { memo, ReactNode, useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Conversation, SourcePlatform } from '@/domain/types';
import { deleteImportFiles } from '@/services/importer';
import { defaultFilters, InboxFilters, InboxRow, InboxTab, inboxRows, messagesByConversation, previewText } from '@/state/selectors';
import { useStore } from '@/state/store';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { formatListTime } from '@/utils/time';
import { ActionSheet, Avatar, Button, Chip, ConfirmDialog, EmptyState, IconName, platformLabel, SheetFrame, SourceBadge, Tag, Txt } from './ui';

const TAB_LABELS: Record<InboxTab, string> = {
  all: 'All', unread: 'Unread', personal: 'Personal', groups: 'Groups', connected: 'Connected', imported: 'Imported', archived: 'Archived',
};

export function ConversationList({ title, tabs, nativeOnly, initialTab = 'all', selectedId, onOpen, headerActions, emptyAction }: {
  title: string;
  tabs: InboxTab[];
  nativeOnly?: boolean;
  initialTab?: InboxTab;
  selectedId?: string | null;
  onOpen: (id: string) => void;
  headerActions?: ReactNode;
  emptyAction?: ReactNode;
}) {
  const { state, dispatch, audit } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<InboxFilters>({ ...defaultFilters, tab: initialTab, nativeOnly });
  const [showFilters, setShowFilters] = useState(false);
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);

  const byConv = useMemo(() => messagesByConversation(state.messages), [state.messages]);
  const rows = useMemo(() => inboxRows(state, filters, byConv), [state, filters, byConv]);
  const unreadTotal = useMemo(
    () => inboxRows(state, { ...defaultFilters, tab: 'unread', nativeOnly }, byConv).length,
    [state, nativeOnly, byConv],
  );
  const activeFilterCount = filters.platforms.length + (filters.person ? 1 : 0) + (filters.since !== 'any' ? 1 : 0) + (filters.media !== 'any' ? 1 : 0);

  const patch = useCallback((id: string, p: Partial<Conversation>) => dispatch({ type: 'patchConversation', id, patch: p }), [dispatch]);
  const demoIds = useMemo(() => new Set(state.contacts.filter(c => c.isDemo).map(c => c.id)), [state.contacts]);
  const renderItem = useCallback(
    ({ item }: { item: InboxRow }) => (
      <ConversationRow
        row={item}
        demo={item.conversation.origin === 'native' && item.conversation.members.some(m => demoIds.has(m.contactId))}
        selected={item.conversation.id === selectedId}
        onPress={onOpen}
        onLongPress={setMenuFor}
      />
    ),
    [selectedId, onOpen, demoIds],
  );

  const empty = filters.query || activeFilterCount
    ? <EmptyState icon="search" title="No matches" body="Try a different word or clear your filters." action={<Button label="Clear filters" variant="secondary" compact onPress={() => setFilters({ ...defaultFilters, tab: filters.tab, nativeOnly })} />} />
    : filters.tab === 'connected'
      ? <EmptyState icon="link-outline" title="No connected accounts yet" body="Live integrations need the hye server, which this prototype doesn’t include. See what each platform supports in Connections." />
      : filters.tab === 'archived'
        ? <EmptyState icon="archive-outline" title="Nothing archived" body="Long-press a conversation and choose Archive to tidy your inbox without deleting anything." />
        : filters.tab === 'imported'
          ? <EmptyState icon="download-outline" title="No imported history" body="Bring over a chat you exported from WhatsApp. Your original stays untouched." action={emptyAction} />
          : filters.tab === 'unread'
            ? <EmptyState icon="checkmark-done-outline" title="You’re all caught up" />
            : <EmptyState icon="chatbubbles-outline" title="No conversations yet" body="Start a chat with someone or import your history." action={emptyAction} />;

  const c = menuFor;
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Txt variant="title" style={{ flex: 1 }}>{title}</Txt>
        {headerActions}
      </View>
      <View style={[styles.search, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={filters.query}
          onChangeText={q => setFilters(f => ({ ...f, query: q }))}
          placeholder="Search names and messages"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search conversations"
          style={[type.body, styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`} hitSlop={8} onPress={() => setShowFilters(true)}>
          <Ionicons name="options-outline" size={20} color={activeFilterCount ? colors.accent : colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {tabs.map(t => (
          <Chip key={t} label={TAB_LABELS[t]} count={t === 'unread' ? unreadTotal : undefined} selected={filters.tab === t} onPress={() => setFilters(f => ({ ...f, tab: t }))} />
        ))}
      </ScrollView>
      <FlatList
        data={rows}
        keyExtractor={r => r.conversation.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        contentContainerStyle={rows.length ? undefined : { flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      />

      <ActionSheet
        visible={!!c}
        title={c?.title}
        onClose={() => setMenuFor(null)}
        actions={c ? [
          { label: c.pinned ? 'Unpin' : 'Pin to top', icon: 'pin-outline', onPress: () => patch(c.id, { pinned: !c.pinned }) },
          { label: c.muted ? 'Unmute' : 'Mute notifications', icon: c.muted ? 'notifications-outline' : 'notifications-off-outline', onPress: () => patch(c.id, { muted: !c.muted }), hidden: c.origin === 'imported' },
          { label: 'Mark as unread', icon: 'mail-unread-outline', onPress: () => patch(c.id, { markedUnread: true }), hidden: c.origin === 'imported' },
          { label: c.archived ? 'Move to inbox' : 'Archive', icon: 'archive-outline', onPress: () => patch(c.id, { archived: !c.archived }) },
          { label: c.origin === 'imported' ? 'Delete imported history' : 'Delete chat', icon: 'trash-outline', danger: true, onPress: () => setConfirmDelete(c) },
        ] : []}
      />
      <ConfirmDialog
        visible={!!confirmDelete}
        title={confirmDelete?.origin === 'imported' ? 'Delete imported history?' : 'Delete this chat?'}
        body={confirmDelete?.origin === 'imported'
          ? 'This removes the imported copy from hye. Your original chat in WhatsApp is not affected. You can import it again later.'
          : 'Messages will be removed from this device. Other people keep their copy.'}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            state.importJobs.filter(j => j.conversationId === confirmDelete.id).forEach(j => deleteImportFiles(j.id));
            dispatch({ type: 'deleteConversation', id: confirmDelete.id });
            audit('conversation.deleted', `${confirmDelete.title} (${confirmDelete.origin})`);
          }
          setConfirmDelete(null);
        }}
      />
      <FilterSheet visible={showFilters} filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
    </View>
  );
}

const ConversationRow = memo(function ConversationRow({ row, demo, selected, onPress, onLongPress }: {
  row: InboxRow; demo: boolean; selected: boolean; onPress: (id: string) => void; onLongPress: (c: Conversation) => void;
}) {
  const { colors } = useTheme();
  const { conversation: c, last, unread } = row;
  const imported = c.origin === 'imported';
  const sender = last && c.kind === 'group' && !last.system ? `${last.senderId === 'me' ? 'You' : last.senderName.split(' ')[0]}: ` : last?.senderId === 'me' ? 'You: ' : '';
  const label = `${c.title}${demo ? ', demo chat' : ''}${imported ? ', imported from ' + platformLabel(c.source) : ''}${unread ? `, ${unread} unread` : ''}. ${sender}${previewText(last)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the chat. Long-press for more options."
      accessibilityState={{ selected }}
      accessibilityActions={[{ name: "longpress", label: "More options" }]}
      onAccessibilityAction={() => onLongPress(c)}
      onPress={() => onPress(c.id)}
      onLongPress={() => onLongPress(c)}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, { backgroundColor: selected ? colors.accentSoft : pressed ? colors.surfaceAlt : 'transparent', borderLeftWidth: 3, borderLeftColor: selected ? colors.accent : 'transparent' }]}
    >
      <Avatar name={c.title} group={c.kind === 'group'} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Txt variant="subheading" numberOfLines={1} style={{ flex: 1 }}>{c.title}</Txt>
          <Txt variant="caption" color={unread ? 'accent' : 'textMuted'}>{formatListTime(c.lastActivityAt)}</Txt>
        </View>
        <View style={styles.rowTop}>
          <Txt variant="small" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
            {sender}{previewText(last)}
          </Txt>
          {c.muted ? <Ionicons name="notifications-off" size={14} color={colors.textMuted} /> : null}
          {c.pinned ? <Ionicons name="pin" size={14} color={colors.textMuted} /> : null}
          {unread ? (
            <View style={[styles.unread, { backgroundColor: c.muted ? colors.textMuted : colors.accent }]}>
              <Txt variant="caption" style={{ color: colors.onAccent, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Txt>
            </View>
          ) : null}
        </View>
        {demo ? <Tag label="Demo" /> : <SourceBadge source={c.source} imported={imported} />}
      </View>
    </Pressable>
  );
});

function FilterSheet({ visible, filters, onChange, onClose }: {
  visible: boolean; filters: InboxFilters; onChange: (f: InboxFilters) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const { state } = useStore();
  const platforms = useMemo(() => [...new Set<SourcePlatform>(['hye', ...state.conversations.map(c => c.source)])], [state.conversations]);
  const people = useMemo(() => {
    const list = state.contacts.map(c => ({ id: c.id, name: c.displayName }));
    const imported = new Set(state.conversations.flatMap(c => c.importedParticipants ?? []));
    return [...list, ...[...imported].map(n => ({ id: n, name: `${n} (imported)` }))];
  }, [state.contacts, state.conversations]);
  const set = (p: Partial<InboxFilters>) => onChange({ ...filters, ...p });
  const media: { key: InboxFilters['media']; label: string; icon: IconName }[] = [
    { key: 'any', label: 'Any', icon: 'apps-outline' }, { key: 'image', label: 'Photos', icon: 'image-outline' },
    { key: 'video', label: 'Videos', icon: 'videocam-outline' }, { key: 'document', label: 'Documents', icon: 'document-outline' },
    { key: 'audio', label: 'Audio', icon: 'mic-outline' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetFrame onClose={onClose} style={{ maxHeight: "85%" }}>
          <View style={styles.header}>
            <Txt variant="heading" style={{ flex: 1 }}>Filters</Txt>
            <Button label="Reset" variant="ghost" compact onPress={() => onChange({ ...defaultFilters, tab: filters.tab, query: filters.query, nativeOnly: filters.nativeOnly })} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
            <Txt variant="small" color="textMuted">Platform</Txt>
            <View style={styles.wrap}>
              {platforms.map(p => (
                <Chip key={p} label={platformLabel(p)} selected={filters.platforms.includes(p)}
                  onPress={() => set({ platforms: filters.platforms.includes(p) ? filters.platforms.filter(x => x !== p) : [...filters.platforms, p] })} />
              ))}
            </View>
            <Txt variant="small" color="textMuted">Date</Txt>
            <View style={styles.wrap}>
              {(['any', '7d', '30d', '365d'] as const).map(d => (
                <Chip key={d} label={{ any: 'Any time', '7d': 'Last 7 days', '30d': 'Last 30 days', '365d': 'Last year' }[d]} selected={filters.since === d} onPress={() => set({ since: d })} />
              ))}
            </View>
            <Txt variant="small" color="textMuted">Media</Txt>
            <View style={styles.wrap}>
              {media.map(m => <Chip key={m.key} label={m.label} selected={filters.media === m.key} onPress={() => set({ media: m.key })} />)}
            </View>
            <Txt variant="small" color="textMuted">Person</Txt>
            <View style={styles.wrap}>
              <Chip label="Anyone" selected={!filters.person} onPress={() => set({ person: null })} />
              {people.map(p => <Chip key={p.id} label={p.name} selected={filters.person === p.id} onPress={() => set({ person: p.id })} />)}
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: space.lg }}>
            <Button label="Show results" onPress={onClose} />
          </View>
      </SheetFrame>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.xs },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, paddingHorizontal: space.md, borderRadius: radius.md, height: 44 },
  searchInput: { flex: 1, paddingVertical: 0 },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'flex-start' },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 560, alignSelf: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
});
