import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import {
  ActionSheet, Avatar, Banner, Button, Card, Chip, ConfirmDialog, Divider, EmptyState, platformLabel, Row, SectionTitle, Tag, TextField, ToggleRow, Txt,
} from '@/components/ui';
import type { Conversation, Member, RetentionPolicy } from '@/domain/types';
import { writeShareFile } from '@/services/importer';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { RETENTION_LABEL } from '@/utils/labels';
import { formatDateTime } from '@/utils/time';

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch, audit } = useStore();
  const conv = state.conversations.find(c => c.id === id);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conv?.title ?? '');
  const [memberMenu, setMemberMenu] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<'block' | 'report' | 'leave' | null>(null);
  const [notice, setNotice] = useState<string>();

  if (!conv) return <Screen title="Details" back><EmptyState icon="help-circle-outline" title="Conversation not found" /></Screen>;
  const patch = (p: Partial<Conversation>) => dispatch({ type: 'patchConversation', id: conv.id, patch: p });
  const contact = (cid: string) => state.contacts.find(c => c.id === cid);
  const isAdmin = conv.members.some(m => m.contactId === 'me' && m.role === 'admin');
  const peer = conv.kind === 'direct' ? contact(conv.members.find(m => m.contactId !== 'me')?.contactId ?? '') : undefined;
  const msgs = state.messages.filter(m => m.conversationId === conv.id);
  const media = msgs.flatMap(m => m.attachments);
  const job = conv.provenance ? state.importJobs.find(j => j.id === conv.provenance!.jobId) : undefined;

  const exportConversation = async () => {
    const uri = await writeShareFile(`hye-${conv.title.replace(/\W+/g, '-')}.json`, { conversation: conv, messages: msgs });
    audit('conversation.exported', conv.title);
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri, { mimeType: 'application/json' });
  };

  const systemNote = (text: string) =>
    dispatch({ type: 'addMessages', messages: [{ id: `sys_${Date.now()}`, conversationId: conv.id, senderId: 'system', senderName: 'hye', text, sentAt: new Date().toISOString(), reactions: [], attachments: [], system: true }] });

  const setMembers = (members: Member[], note: string) => {
    patch({ members });
    systemNote(note);
    audit('group.members', `${conv.title}: ${note}`);
  };

  const m = memberMenu;
  const mc = m ? contact(m.contactId) : undefined;
  const addable = state.contacts.filter(c => !c.blocked && !conv.members.some(x => x.contactId === c.id));

  return (
    <Screen title="Details" back>
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
        <Avatar name={conv.title} size={84} group={conv.kind === 'group'} />
        <Txt variant="heading">{conv.title}</Txt>
        <Txt variant="small" color="textMuted">
          {conv.origin === 'imported' ? `Imported from ${platformLabel(conv.source)}` : conv.kind === 'group' ? `Group · ${conv.members.length} members` : peer ? `@${peer.handle}${peer.isDemo ? ' · demo contact' : ''}` : ''}
        </Txt>
        {conv.kind === 'group' && isAdmin && conv.origin === 'native' ? <Button label="Rename group" variant="ghost" compact onPress={() => setRenaming(true)} /> : null}
      </View>

      {conv.origin === 'imported' && conv.provenance ? (
        <>
          <Banner icon="archive-outline" tone="imported" title="Where this came from" body={`File “${conv.provenance.fileName}”, imported ${formatDateTime(conv.provenance.importedAt)}. ${conv.provenance.timezoneNote}.`} />
          {job ? (
            <Card>
              <Row label="Import report" detail={`${job.imported} imported · ${job.skipped} skipped · ${job.failed} failed`} onPress={() => router.push({ pathname: '/import', params: { job: job.id } })} />
            </Card>
          ) : null}
          <SectionTitle>{`Participants in the export · ${conv.importedParticipants?.length ?? 0}`}</SectionTitle>
          <Card style={{ padding: space.lg, gap: space.xs }}>
            {(conv.importedParticipants ?? []).map(p => <Txt key={p}>{p}{job?.me === p ? ' (you)' : ''}</Txt>)}
            <Txt variant="caption" color="textMuted">Names exactly as they appear in the export. They aren’t linked to hye accounts.</Txt>
          </Card>
        </>
      ) : null}

      <Card>
        <ToggleRow icon="pin-outline" label="Pin to top" value={conv.pinned} onChange={v => patch({ pinned: v })} />
        {conv.origin === 'native' ? (<><Divider /><ToggleRow icon="notifications-off-outline" label="Mute notifications" value={conv.muted} onChange={v => patch({ muted: v })} /></>) : null}
        <Divider />
        <ToggleRow icon="archive-outline" label="Archived" value={conv.archived} onChange={v => patch({ archived: v })} />
      </Card>

      {conv.origin === 'native' ? (
        <>
          <SectionTitle>Message timer</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(Object.keys(RETENTION_LABEL) as RetentionPolicy[]).map(r => (
              <Chip key={r} label={RETENTION_LABEL[r]} selected={conv.retention === r} onPress={() => { patch({ retention: r }); systemNote(r === 'off' ? 'Message timer turned off' : `Messages now disappear after ${RETENTION_LABEL[r]}`); dispatch({ type: 'applyRetention' }); }} />
            ))}
          </View>
        </>
      ) : null}

      {conv.kind === 'group' && conv.origin === 'native' ? (
        <>
          <SectionTitle>{`Members · ${conv.members.length}`}</SectionTitle>
          <Card>
            {conv.members.map((mem, i) => {
              const c = contact(mem.contactId);
              const name = mem.contactId === 'me' ? `${state.user!.displayName} (you)` : c?.displayName ?? 'Unknown';
              return (
                <View key={mem.contactId}>
                  {i > 0 ? <Divider /> : null}
                  <Row label={name} right={mem.role === 'admin' ? <Tag label="Admin" tone="accent" /> : <View />} onPress={isAdmin && mem.contactId !== 'me' ? () => setMemberMenu(mem) : undefined} />
                </View>
              );
            })}
            {isAdmin ? (<><Divider /><Row icon="person-add-outline" label="Add people" onPress={() => setAdding(true)} /></>) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle>{`Media and files · ${media.length}`}</SectionTitle>
      <Card style={{ padding: space.lg, gap: space.xs }}>
        {media.length ? media.slice(0, 8).map(a => <Txt key={a.id} variant="small" numberOfLines={1}>{a.uri ? '📎' : '⚠️'} {a.fileName}</Txt>) : <Txt variant="small" color="textMuted">No files shared yet</Txt>}
        {media.length > 8 ? <Txt variant="caption" color="textMuted">and {media.length - 8} more</Txt> : null}
      </Card>

      <Card>
        <Row icon="share-outline" label="Export this conversation" detail="JSON with every message and its source details" onPress={exportConversation} />
        {peer ? (<><Divider /><Row icon="ban-outline" label={peer.blocked ? `Unblock ${peer.displayName}` : `Block ${peer.displayName}`} danger={!peer.blocked} onPress={() => (peer.blocked ? (dispatch({ type: 'patchContact', id: peer.id, patch: { blocked: false } }), audit('contact.unblocked', peer.displayName)) : setConfirm('block'))} /></>) : null}
        {conv.origin === 'native' ? (<><Divider /><Row icon="flag-outline" label="Report" danger onPress={() => setConfirm('report')} /></>) : null}
        {conv.kind === 'group' && conv.origin === 'native' ? (<><Divider /><Row icon="exit-outline" label="Leave group" danger onPress={() => setConfirm('leave')} /></>) : null}
      </Card>
      {notice ? <Banner icon="checkmark-circle-outline" title={notice} /> : null}

      <ConfirmDialog visible={renaming} title="Rename group" body="Everyone in the group will see the new name." confirmLabel="Save" confirmDisabled={!title.trim()} onCancel={() => setRenaming(false)}
        onConfirm={() => { patch({ title: title.trim() }); systemNote(`You renamed the group to “${title.trim()}”`); setRenaming(false); }}>
        <TextField value={title} onChangeText={setTitle} maxLength={60} accessibilityLabel="Group name" />
      </ConfirmDialog>
      <ConfirmDialog visible={confirm === 'block'} title={`Block ${peer?.displayName}?`} body="They won’t be able to message you, and this chat leaves your inbox. They won’t be told." confirmLabel="Block" destructive onCancel={() => setConfirm(null)}
        onConfirm={() => { if (peer) { dispatch({ type: 'patchContact', id: peer.id, patch: { blocked: true } }); audit('contact.blocked', peer.displayName); } setConfirm(null); router.back(); }} />
      <ConfirmDialog visible={confirm === 'report'} title="Report this conversation?" body="The last 20 messages would be sent to hye’s safety team for review. In the prototype, nothing leaves your device; the report is logged in Security activity." confirmLabel="Report" destructive onCancel={() => setConfirm(null)}
        onConfirm={() => { audit('conversation.reported', conv.title); setNotice('Report recorded. Thanks for helping keep hye safe.'); setConfirm(null); }} />
      <ConfirmDialog visible={confirm === 'leave'} title={`Leave “${conv.title}”?`} body="You’ll stop getting messages. Your copy of the history stays in Archive." confirmLabel="Leave" destructive onCancel={() => setConfirm(null)}
        onConfirm={() => { systemNote('You left the group'); patch({ archived: true, members: conv.members.filter(x => x.contactId !== 'me') }); audit('group.left', conv.title); setConfirm(null); router.back(); }} />

      <ActionSheet
        visible={!!m}
        title={mc?.displayName}
        onClose={() => setMemberMenu(null)}
        actions={m && mc ? [
          { label: m.role === 'admin' ? 'Remove as admin' : 'Make admin', icon: 'shield-outline', onPress: () => setMembers(conv.members.map(x => (x.contactId === m.contactId ? { ...x, role: x.role === 'admin' ? 'member' : 'admin' } : x)), `${mc.displayName} is ${m.role === 'admin' ? 'no longer' : 'now'} an admin`) },
          { label: 'Remove from group', icon: 'person-remove-outline', danger: true, onPress: () => setMembers(conv.members.filter(x => x.contactId !== m.contactId), `You removed ${mc.displayName}`) },
        ] : []}
      />
      <ActionSheet
        visible={adding}
        title={addable.length ? 'Add people' : 'Everyone is already here'}
        onClose={() => setAdding(false)}
        actions={addable.map(c => ({ label: c.displayName, icon: 'person-add-outline' as const, onPress: () => setMembers([...conv.members, { contactId: c.id, role: 'member' }], `You added ${c.displayName}`) }))}
      />
    </Screen>
  );
}
