import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Screen } from '@/components/Screen';
import {
  Banner, Button, Card, Chip, ConfirmDialog, Divider, EmptyState, Row, SectionTitle, TextField, ToggleRow, Txt,
} from '@/components/ui';
import type { PrivacySettings, RetentionPolicy } from '@/domain/types';
import { deleteImportFiles, writeShareFile } from '@/services/importer';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { auditLabel, RETENTION_LABEL } from '@/utils/labels';
import { formatDateTime } from '@/utils/time';

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  switch (page) {
    case 'privacy': return <Privacy />;
    case 'notifications': return <Notifications />;
    case 'appearance': return <Appearance />;
    case 'devices': return <Devices />;
    case 'blocked': return <Blocked />;
    case 'activity': return <Activity />;
    case 'data': return <YourData />;
    default: return <Screen title="Settings" back><EmptyState icon="help-circle-outline" title="Page not found" /></Screen>;
  }
}

function Privacy() {
  const { state, dispatch, audit } = useStore();
  const p = state.privacy;
  const set = (patch: Partial<PrivacySettings>) => {
    dispatch({ type: 'privacy', patch });
    audit('privacy.changed', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '));
  };
  return (
    <Screen title="Privacy" back>
      <Card>
        <ToggleRow label="Read receipts" detail="When off, others won’t see when you’ve read their messages, and you won’t see when they’ve read yours" value={p.readReceipts} onChange={v => set({ readReceipts: v })} />
        <Divider />
        <ToggleRow label="Typing indicators" detail="Show and see when someone is typing" value={p.typingIndicators} onChange={v => set({ typingIndicators: v })} />
      </Card>
      <SectionTitle>Who can see when you were last online</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {(['everyone', 'contacts', 'nobody'] as const).map(v => (
          <Chip key={v} label={{ everyone: 'Everyone', contacts: 'My contacts', nobody: 'Nobody' }[v]} selected={p.lastSeen === v} onPress={() => set({ lastSeen: v })} />
        ))}
      </View>
      <Txt variant="small" color="textMuted">Saved now. Online status arrives with the hye server; until then nobody can see it.</Txt>
      <SectionTitle>Default message timer for new chats</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {(Object.keys(RETENTION_LABEL) as RetentionPolicy[]).map(r => (
          <Chip key={r} label={RETENTION_LABEL[r]} selected={p.defaultRetention === r} onPress={() => set({ defaultRetention: r })} />
        ))}
      </View>
      <Txt variant="small" color="textMuted">Timers delete messages from this device after the chosen time. Imported history is never deleted automatically.</Txt>
      <Banner
        icon="key-outline"
        title="About encryption"
        body="In this prototype, hye stores messages on this device and never uploads them. Files you choose to export or share do leave the device. End-to-end encryption for hye-to-hye chats is part of the server design. Imported history is a copy of your export and is not end-to-end encrypted by hye."
      />
    </Screen>
  );
}

function Notifications() {
  const { state, dispatch } = useStore();
  const n = state.notifications;
  return (
    <Screen title="Notifications" back>
      <Card>
        <ToggleRow label="Direct messages" value={n.messages} onChange={v => dispatch({ type: 'notifications', patch: { messages: v } })} />
        <Divider />
        <ToggleRow label="Groups" value={n.groups} onChange={v => dispatch({ type: 'notifications', patch: { groups: v } })} />
        <Divider />
        <ToggleRow label="Import finished" value={n.importComplete} onChange={v => dispatch({ type: 'notifications', patch: { importComplete: v } })} />
        <Divider />
        <ToggleRow label="Show message previews" detail="Off keeps message text off your lock screen" value={n.previews} onChange={v => dispatch({ type: 'notifications', patch: { previews: v } })} />
      </Card>
      <Txt variant="small" color="textMuted">These choices are saved now. Push notifications need the hye server, so the prototype doesn’t send them yet.</Txt>
    </Screen>
  );
}

function Appearance() {
  const { state, dispatch } = useStore();
  return (
    <Screen title="Appearance" back>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {(['system', 'light', 'dark'] as const).map(t => (
          <Chip key={t} label={{ system: 'Match system', light: 'Light', dark: 'Dark' }[t]} selected={state.theme === t} onPress={() => dispatch({ type: 'theme', theme: t })} />
        ))}
      </View>
    </Screen>
  );
}

function Devices() {
  const { state } = useStore();
  return (
    <Screen title="Devices and sign-in" back>
      <SectionTitle>Active sessions</SectionTitle>
      <Card>
        <Row icon="phone-portrait-outline" label={`This device (${Platform.OS})`} detail={`Signed in ${formatDateTime(state.user!.createdAt)} · active now`} right={<View />} />
      </Card>
      <SectionTitle>Sign-in methods</SectionTitle>
      <Card>
        <Row icon="person-circle-outline" label="Demo account on this device" detail="No password is stored" right={<View />} />
        <Divider />
        <Row icon="finger-print-outline" label="Passkeys" detail="Coming with the hye server" right={<View />} />
      </Card>
      <Txt variant="small" color="textMuted">With the hye server you’ll see every signed-in device here and can sign any of them out remotely.</Txt>
    </Screen>
  );
}

function Blocked() {
  const { state, dispatch, audit } = useStore();
  const blocked = state.contacts.filter(c => c.blocked);
  return (
    <Screen title="Blocked people" back>
      {blocked.length === 0 ? (
        <EmptyState icon="ban-outline" title="You haven’t blocked anyone" body="Block someone from their chat details. They won’t be told." />
      ) : (
        <Card>
          {blocked.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <Row label={c.displayName} detail={`@${c.handle}`} right={<Button label="Unblock" compact variant="secondary" onPress={() => { dispatch({ type: 'patchContact', id: c.id, patch: { blocked: false } }); audit('contact.unblocked', c.displayName); }} />} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Activity() {
  const { state } = useStore();
  return (
    <Screen title="Security activity" back subtitle="Sensitive changes made on this account">
      {state.audit.length === 0 ? (
        <EmptyState icon="list-outline" title="No activity yet" body="Imports, exports, deletions, blocks and privacy changes appear here." />
      ) : (
        <Card>
          {state.audit.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <Row label={auditLabel(e.action)} detail={`${e.detail} · ${formatDateTime(e.at)}`} right={<View />} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function YourData() {
  const { state, dispatch, audit, wipeAll } = useStore();
  const [confirmImports, setConfirmImports] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<string>();
  const importedConvs = state.conversations.filter(c => c.origin === 'imported');

  const exportAll = async () => {
    const data = { format: 'hye-export/1', exportedAt: new Date().toISOString(), ...state };
    const uri = await writeShareFile(`hye-export-${Date.now()}.json`, data).catch(() => null);
    if (!uri) return setStatus('We couldn’t create the export file. Free up some space and try again.');
    audit('data.exported', `${state.messages.length} messages, ${state.conversations.length} chats`);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save your hye data' });
    else setStatus('Export saved, but this device can’t open the share menu.');
  };

  return (
    <Screen title="Your data" back>
      <SectionTitle>Export</SectionTitle>
      <Card style={{ padding: space.lg, gap: space.md }}>
        <Txt>Download everything hye stores about you as a JSON file: profile, conversations, messages, imports and settings.</Txt>
        <Button label="Export my data" icon="download-outline" onPress={exportAll} />
        {status ? <Txt variant="small" color="textMuted">{status}</Txt> : null}
      </Card>
      <SectionTitle>Imported history</SectionTitle>
      <Card style={{ padding: space.lg, gap: space.md }}>
        <Txt>{importedConvs.length} imported chat{importedConvs.length === 1 ? '' : 's'}. Removing them doesn’t affect the original apps.</Txt>
        <Button label="Delete all imported history" variant="secondary" disabled={!importedConvs.length} onPress={() => setConfirmImports(true)} />
      </Card>
      <SectionTitle>Delete account</SectionTitle>
      <Card style={{ padding: space.lg, gap: space.md }}>
        <Txt>Permanently erase your account and everything on this device. This can’t be undone. Export first if you want a copy.</Txt>
        <Button label="Delete my account" variant="danger" onPress={() => setConfirmAccount(true)} />
      </Card>

      <ConfirmDialog
        visible={confirmImports}
        title="Delete imported history?"
        body={`${importedConvs.length} imported ${importedConvs.length === 1 ? 'chat' : 'chats'} and their files will be deleted from hye. Originals in other apps aren’t affected. This can’t be undone.`}
        confirmLabel="Delete imported history"
        destructive
        onCancel={() => setConfirmImports(false)}
        onConfirm={() => {
          importedConvs.forEach(c => dispatch({ type: 'deleteConversation', id: c.id }));
          deleteImportFiles();
          audit('imports.deleted', `${importedConvs.length} chats`);
          setConfirmImports(false);
          setStatus('Imported history deleted.');
        }}
      />
      <ConfirmDialog
        visible={confirmAccount}
        title="Delete your account?"
        body="All conversations, imported history, saved posts and settings will be erased from this device."
        confirmLabel="Delete forever"
        destructive
        confirmDisabled={typed.trim().toUpperCase() !== 'DELETE'}
        onCancel={() => { setConfirmAccount(false); setTyped(''); }}
        onConfirm={() => {
          wipeAll().catch(() => setStatus('Some data couldn’t be erased. Try again, or uninstall the app to remove everything.'));
        }}
      >
        <TextField label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" />
      </ConfirmDialog>
    </Screen>
  );
}
