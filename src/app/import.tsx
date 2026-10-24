import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Divider, EmptyState, Row, SectionTitle, Tag, Txt } from '@/components/ui';
import { ArchiveFile, ImportPreview, migrationReport, PlannedItem, planImport, runImportBatch, WHATSAPP_NOT_PRESERVED } from '@/domain/import/pipeline';
import { DateOrder, recordTimestamp } from '@/domain/import/whatsapp';
import type { Conversation, ImportJob } from '@/domain/types';
import { INTEGRATIONS, STATUS_COPY } from '@/integrations/catalog';
import {
  analyse, Analysis, buildPreview, existingConversation, existingKeys, ImportError, loadExport, LoadedExport, newJob, persistExport, reloadExport, writeShareFile,
} from '@/services/importer';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { formatDateTime } from '@/utils/time';

type Step = 'source' | 'guide' | 'validating' | 'review' | 'importing' | 'done' | 'error';
const BATCH = 250;
const TZ_NOTE = 'Times are as shown on the exporting phone; the export has no time zone';

export default function ImportScreen() {
  const params = useLocalSearchParams<{ job?: string }>();
  const { state, dispatch, flush, audit } = useStore();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>(params.job ? 'done' : 'source');
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState<LoadedExport | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [order, setOrder] = useState<DateOrder | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(params.job ?? null);
  const pauseRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const job = state.importJobs.find(j => j.id === jobId) ?? null;
  // Preview depends on the chosen file and options, not on every store change (e.g. import batches).
  const built = useMemo(
    () => (loaded && analysis && order && step === 'review' ? buildPreview(stateRef.current, analysis, loaded, order, me) : null),
    [loaded, analysis, order, me, step],
  );

  // Leaving the screen mid-import pauses it; it can be resumed from the history list.
  useEffect(() => () => { pauseRef.current = true; }, []);

  /** Waits for the dispatched batch to render into the store, then writes it. Rejects if saving fails. */
  const persistSoon = () => new Promise<void>(r => setTimeout(r, 60)).then(flush);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'application/zip', 'application/x-zip-compressed', '*/*'], copyToCacheDirectory: true });
    if (res.canceled) return;
    setStep('validating');
    try {
      const l = await loadExport(res.assets[0]);
      const a = analyse(l);
      setLoaded(l);
      setAnalysis(a);
      setOrder(a.parsed.possibleDateOrders.length === 1 ? a.parsed.possibleDateOrders[0] : null);
      setMe(a.parsed.participants.find(p => p.toLowerCase() === state.user!.displayName.toLowerCase()) ?? null);
      setStep('review');
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading this file. Try exporting the chat again.');
      setStep('error');
    }
  };

  /** Runs batches from job.cursor, persisting after each so the import can resume after a crash. */
  const run = async (start: ImportJob, plan: PlannedItem[], keys: Set<string>) => {
    pauseRef.current = false;
    let j: ImportJob = { ...start, status: 'importing' };
    dispatch({ type: 'upsertImportJob', job: j });
    while (j.cursor < plan.length) {
      if (pauseRef.current) {
        j = { ...j, status: 'paused' };
        dispatch({ type: 'upsertImportJob', job: j });
        await persistSoon().catch(() => undefined);
        return;
      }
      const out = runImportBatch(j, plan, keys, BATCH);
      dispatch({ type: 'addMessages', messages: out.newMessages, touch: false });
      j = out.job;
      dispatch({ type: 'upsertImportJob', job: j });
      try {
        await persistSoon();
      } catch {
        // Don't report success on top of data that isn't saved; pause so it can resume later.
        dispatch({ type: 'upsertImportJob', job: { ...j, status: 'paused' } });
        setError('We couldn’t save the imported messages. Free up some space on your phone, then resume the import from Import history.');
        setStep('error');
        return;
      }
    }
    const times = plan.filter(p => p.message).map(p => p.message!.sentAt).sort();
    const conv = stateRef.current.conversations.find(c => c.id === j.conversationId);
    if (conv && times.length && times[times.length - 1] > conv.lastActivityAt) {
      dispatch({ type: 'patchConversation', id: conv.id, patch: { lastActivityAt: times[times.length - 1] } });
    }
    audit('import.completed', `${j.imported} imported, ${j.skipped} skipped, ${j.failed} failed`);
    await persistSoon().catch(() => undefined);
    setStep('done');
  };

  const confirm = async () => {
    if (!loaded || !analysis || !order || !built) return;
    const convId = `imp_${analysis.conversationKey}`;
    const job0 = newJob('whatsapp', loaded.fileName, convId, built.plan.length, order, me);
    setStep('importing');
    setJobId(job0.id);
    let archive: ArchiveFile[] | null = null;
    try {
      archive = await persistExport(job0.id, loaded);
    } catch {
      setError('We couldn’t save the files to this device. Free up some space and try again.');
      setStep('error');
      return;
    }
    const plan = planImport(analysis.parsed, order, analysis.conversationKey, /\.zip$/i.test(loaded.fileName) ? archive : null, me);
    const existing = existingConversation(stateRef.current, analysis.conversationKey);
    const now = new Date().toISOString();
    const conv: Conversation = {
      ...(existing ?? {
        id: convId, kind: analysis.parsed.participants.length > 2 ? 'group' : 'direct', origin: 'imported', source: 'whatsapp',
        title: analysis.title, members: [{ contactId: 'me', role: 'member' }], createdAt: now, lastActivityAt: built.preview.lastAt ?? now,
        pinned: false, muted: true, archived: false, markedUnread: false, retention: 'off', lastReadAt: now,
      }),
      provenance: { platform: 'whatsapp', jobId: job0.id, fileName: loaded.fileName, importedAt: now, timezoneNote: TZ_NOTE },
      importedParticipants: [...new Set([...(existing?.importedParticipants ?? []), ...analysis.parsed.participants])],
    };
    dispatch({ type: 'upsertConversation', conversation: conv });
    audit('import.started', `${loaded.fileName} (${plan.length} records)`);
    await run(job0, plan, existingKeys(stateRef.current, convId));
  };

  /** Resume a paused/interrupted job, or retry its failed items with a different date order. */
  const resume = async (j: ImportJob, retryOrder?: DateOrder) => {
    setJobId(j.id);
    setStep('importing');
    const saved = await reloadExport(j.id, j.fileName);
    if (!saved) {
      setError('The original export is no longer on this device. Choose the file again to continue — anything already imported will be skipped.');
      setStep('error');
      return;
    }
    const a = analyse(saved.loaded);
    const fullPlan = planImport(a.parsed, retryOrder ?? j.dateOrder, a.conversationKey, saved.archive.length ? saved.archive : null, j.me);
    const keys = existingKeys(stateRef.current, j.conversationId);
    if (!retryOrder) return run(j, fullPlan, keys);

    const failedRefs = new Set(j.results.filter(r => r.outcome === 'failed').map(r => r.ref));
    const subset = fullPlan.filter(p => failedRefs.has(p.ref));
    const retryJob: ImportJob = { ...j, cursor: 0, failed: j.failed - subset.length, results: j.results.filter(r => r.outcome !== 'failed'), dateOrder: retryOrder };
    audit('import.retried', `${j.fileName}: ${subset.length} items with ${retryOrder}`);
    await run(retryJob, subset, keys);
    dispatch({ type: 'upsertImportJob', job: { ...stateRef.current.importJobs.find(x => x.id === j.id)!, cursor: j.total, total: j.total } });
  };

  const shareReport = async (j: ImportJob) => {
    const uri = await writeShareFile(`hye-migration-report-${j.id}.json`, migrationReport(j, built?.preview ?? null));
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save migration report' });
  };

  // ---------- Steps ----------
  if (step === 'source') {
    const unfinished = state.importJobs.filter(j => j.status === 'importing' || j.status === 'paused');
    return (
      <Screen title="Import history" back subtitle="Bring your chats into hye">
        {unfinished.map(j => (
          <Banner key={j.id} icon="pause-circle-outline" tone="warning" title={`“${j.fileName}” stopped at ${j.cursor} of ${j.total}`}
            body="Resume where it left off. Nothing will be imported twice."
            action={<View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}><Button label="Resume import" compact onPress={() => resume(j)} /></View>} />
        ))}
        <SectionTitle>Choose where your chat is from</SectionTitle>
        <Card>
          {INTEGRATIONS.filter(i => i.capabilities.some(c => /import/i.test(c.label))).map((i, idx) => {
            const cap = i.capabilities.find(c => /import/i.test(c.label))!;
            const ready = cap.status === 'available';
            return (
              <View key={i.platform}>
                {idx > 0 ? <Divider /> : null}
                <Row label={i.name} detail={ready ? 'Chat export (.txt or .zip)' : cap.note} right={<Tag label={STATUS_COPY[cap.status].label} tone={STATUS_COPY[cap.status].tone} />} onPress={ready ? () => setStep('guide') : undefined} />
              </View>
            );
          })}
        </Card>
        {state.importJobs.length ? (
          <>
            <SectionTitle>Past imports</SectionTitle>
            <Card>
              {state.importJobs.map((j, i) => (
                <View key={j.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row label={j.fileName} detail={`${formatDateTime(j.createdAt)} · ${j.imported} imported · ${j.failed} failed`} onPress={() => { setJobId(j.id); setStep('done'); }} />
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    );
  }

  if (step === 'guide') {
    return (
      <Screen title="Export from WhatsApp" back>
        <Txt color="textMuted">hye can’t reach into WhatsApp, and that’s by design. Instead, WhatsApp lets you export a chat, and you choose what to bring over.</Txt>
        <SectionTitle>On Android</SectionTitle>
        <Card style={styles.steps}>
          {['Open the chat in WhatsApp', 'Tap ⋮ → More → Export chat', 'Choose “Include media” to bring photos and files, or “Without media” for text only', 'Save the file to your phone (e.g. Files or Drive)'].map((s, i) => <StepLine key={s} n={i + 1} text={s} />)}
        </Card>
        <SectionTitle>On iPhone</SectionTitle>
        <Card style={styles.steps}>
          {['Open the chat and tap the name at the top', 'Scroll down and tap Export Chat', 'Choose Attach Media or Without Media', 'Save to Files'].map((s, i) => <StepLine key={s} n={i + 1} text={s} />)}
        </Card>
        <SectionTitle>What the export can’t include</SectionTitle>
        <Card style={styles.steps}>
          {WHATSAPP_NOT_PRESERVED.map(s => <Txt key={s} variant="small">• {s}</Txt>)}
        </Card>
        <Banner icon="lock-closed-outline" title="hye never uploads your file" body="It’s read and stored in hye on this device. Android backups exclude it; on iPhone, your device backup may include app data. Imported history isn’t end-to-end encrypted by hye, and it doesn’t sync back to WhatsApp." />
        <Button label="Choose export file" icon="document-attach-outline" onPress={pick} />
      </Screen>
    );
  }

  if (step === 'validating') {
    return (
      <Screen title="Checking your file" back={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Txt color="textMuted">Reading messages and checking the archive…</Txt>
        </View>
      </Screen>
    );
  }

  if (step === 'error') {
    return (
      <Screen title="Import" back>
        <EmptyState icon="alert-circle-outline" title="We couldn’t import this file" body={error}
          action={<View style={{ gap: space.sm }}><Button label="Choose another file" onPress={pick} /><Button label="See export steps" variant="ghost" onPress={() => setStep('guide')} /></View>} />
      </Screen>
    );
  }

  if (step === 'review' && analysis && loaded) {
    const p = built?.preview;
    const sample = analysis.parsed.records.find(r => r.date[0] <= 12 && r.date[1] <= 12) ?? analysis.parsed.records[0];
    return (
      <Screen title="Review before importing" back>
        <Card style={{ padding: space.lg, gap: space.xs }}>
          <Txt variant="heading">{analysis.title}</Txt>
          <Txt variant="small" color="textMuted">{loaded.fileName} · {analysis.parsed.participants.length} participants</Txt>
        </Card>

        {analysis.parsed.possibleDateOrders.length > 1 ? (
          <>
            <SectionTitle>How are dates written?</SectionTitle>
            <Txt variant="small" color="textMuted">This file doesn’t make it clear. Pick the one that matches your phone, using the date of the first message in the file:</Txt>
            <View style={styles.wrap}>
              {analysis.parsed.possibleDateOrders.map(o => {
                const ts = recordTimestamp(sample, o);
                return <Chip key={o} selected={order === o} onPress={() => setOrder(o)} label={ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : o} />;
              })}
            </View>
          </>
        ) : null}

        <SectionTitle>Which one is you?</SectionTitle>
        <Txt variant="small" color="textMuted">Your messages will appear on the right. This is optional.</Txt>
        <View style={styles.wrap}>
          {analysis.parsed.participants.map(name => <Chip key={name} label={name} selected={me === name} onPress={() => setMe(me === name ? null : name)} />)}
        </View>

        {p ? (
          <>
            <SectionTitle>What we found</SectionTitle>
            <Card>
              <Row label={`${p.messages.toLocaleString()} messages`} detail={p.firstAt && p.lastAt ? `${formatDateTime(p.firstAt)} → ${formatDateTime(p.lastAt)}` : undefined} right={<View />} />
              <Divider />
              <Row label={`${p.attachmentsIncluded} files included`} detail={[p.attachmentsMissingFromArchive && `${p.attachmentsMissingFromArchive} referenced but missing`, p.attachmentsOmittedByExport && `${p.attachmentsOmittedByExport} left out by the export`].filter(Boolean).join(' · ') || undefined} right={<View />} />
              <Divider />
              <Row label={`${p.systemNotices} system notices · ${p.deletedPlaceholders} deleted · ${p.edited} edited`} right={<View />} />
            </Card>
            {p.duplicates ? <Banner icon="copy-outline" title={`${p.duplicates} messages are already in hye`} body="They’ll be skipped, so nothing is duplicated." /> : null}
            {p.invalid ? <Banner icon="alert-circle-outline" tone="warning" title={`${p.invalid} messages have unreadable dates`} body="They’ll be listed as failed in the report. You can retry them with a different date format." /> : null}
            {p.orphanLines || loaded.skippedFiles.length ? (
              <Banner icon="warning-outline" tone="warning" title="Some content can’t be imported"
                body={[p.orphanLines && `${p.orphanLines} lines before the first message weren’t recognised.`, loaded.skippedFiles.length && `${loaded.skippedFiles.length} files were blocked for safety (${loaded.skippedFiles.slice(0, 3).join(', ')}).`].filter(Boolean).join(' ')} />
            ) : null}
            <SectionTitle>Not in WhatsApp exports</SectionTitle>
            <Txt variant="small" color="textMuted">{p.notPreserved.join(' · ')}</Txt>
          </>
        ) : null}
        <Button label={p ? `Import ${(p.messages + p.systemNotices + p.deletedPlaceholders - p.duplicates).toLocaleString()} items` : 'Choose a date format first'} disabled={!p} onPress={confirm} />
        <Button label="Choose a different file" variant="ghost" onPress={pick} />
      </Screen>
    );
  }

  if (step === 'importing') {
    const pct = job && job.total ? Math.round((job.cursor / job.total) * 100) : 0;
    return (
      <Screen title="Importing" back={false}>
        <View style={styles.center}>
          <Txt variant="title">{pct}%</Txt>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${pct}%` }]} />
          </View>
          <Txt color="textMuted">{job ? `${job.cursor.toLocaleString()} of ${job.total.toLocaleString()} · ${job.imported} imported · ${job.skipped} skipped · ${job.failed} failed` : 'Saving files…'}</Txt>
          <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>Leaving this screen pauses the import. Resume it any time from Import history. Nothing is imported twice.</Txt>
          <Button label="Pause and leave" variant="secondary" onPress={() => { pauseRef.current = true; router.back(); }} />
        </View>
      </Screen>
    );
  }

  // done / report
  if (!job) return <Screen title="Import" back><EmptyState icon="help-circle-outline" title="Import not found" /></Screen>;
  const issues = job.results.slice(0, 100);
  const failedDates = job.results.some(r => r.outcome === 'failed' && /date/i.test(r.reason ?? ''));
  const altOrders = (['DMY', 'MDY', 'YMD'] as DateOrder[]).filter(o => o !== job.dateOrder);
  return (
    <Screen title="Import report" back>
      <Banner
        icon={job.failed ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        tone={job.status !== 'completed' ? 'warning' : job.failed ? 'warning' : 'info'}
        title={job.status === 'completed' ? (job.failed ? 'Imported with some problems' : 'Import complete') : job.status === 'paused' ? 'Import paused – resume to finish' : job.status === 'importing' ? 'Import in progress' : 'Import didn’t finish'}
        body={`${job.fileName} · ${formatDateTime(job.createdAt)}`}
      />
      <View style={styles.stats}>
        <Stat n={job.imported} label="Imported" />
        <Stat n={job.skipped} label="Skipped" />
        <Stat n={job.failed} label="Failed" />
      </View>
      {job.status !== 'completed' ? <Button label="Resume import" onPress={() => resume(job)} /> : null}
      <Button label="Open conversation" icon="chatbubbles-outline" onPress={() => router.replace({ pathname: '/conversation/[id]', params: { id: job.conversationId } })} />
      {failedDates ? (
        <Card style={{ padding: space.lg, gap: space.sm }}>
          <Txt variant="subheading">Retry failed messages</Txt>
          <Txt variant="small" color="textMuted">These failed because their dates couldn’t be read as {job.dateOrder}. Try another format:</Txt>
          <View style={styles.wrap}>{altOrders.map(o => <Chip key={o} label={{ DMY: 'Day/Month/Year', MDY: 'Month/Day/Year', YMD: 'Year-Month-Day' }[o]} onPress={() => resume(job, o)} />)}</View>
        </Card>
      ) : null}
      <Button label="Save import report" variant="secondary" icon="share-outline" onPress={() => shareReport(job)} />
      {issues.length ? (
        <>
          <SectionTitle>{`Skipped and failed · ${job.results.length}`}</SectionTitle>
          <Card>
            {issues.map((r, i) => (
              <View key={`${r.ref}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <Row label={r.ref} detail={r.reason} right={<Tag label={r.outcome === 'failed' ? 'Failed' : 'Skipped'} tone={r.outcome === 'failed' ? 'danger' : 'muted'} />} />
              </View>
            ))}
          </Card>
          {job.results.length > issues.length ? <Txt variant="caption" color="textMuted">The saved report lists all {job.results.length} items.</Txt> : null}
        </>
      ) : null}
      <Button label="Import another chat" variant="ghost" onPress={() => { setLoaded(null); setAnalysis(null); setStep('source'); }} />
    </Screen>
  );
}

function StepLine({ n, text }: { n: number; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={[styles.num, { backgroundColor: colors.accentSoft }]}><Txt variant="caption" color="accent" style={{ fontWeight: '700' }}>{n}</Txt></View>
      <Txt variant="small" style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Txt variant="heading">{n.toLocaleString()}</Txt>
      <Txt variant="caption" color="textMuted">{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { padding: space.lg, gap: space.md },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingVertical: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  track: { width: '100%', height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
