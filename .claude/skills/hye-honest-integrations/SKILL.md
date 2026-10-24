---
name: hye-honest-integrations
description: hye's integration honesty policy — official APIs only, the capability matrix in src/integrations/catalog.ts, status meanings, copy rules (never claim sync, live inbox or end-to-end encryption that doesn't exist), and import/migration principles (no invented metadata, provenance, idempotency). Use when adding or changing an integration, connector, importer or "connect your WhatsApp/Instagram/Telegram/X/email" flow, writing copy about sync, privacy or encryption, or reviewing anything that touches third-party platforms or imported history.
---

# Honest integrations in hye

hye is a unified inbox that **only does what the platforms officially allow** and says so plainly.
Trust is the product: one overstated claim ("synced with WhatsApp") undoes it.

## Policy

1. **Official APIs and user-provided exports only.** No scraping, no reverse-engineered/private APIs, no
   browser automation, no bypassing encryption, no asking for another service's password (including
   app passwords). OAuth with scopes the user approves, or files the user exports themselves.
2. **Personal-account reality:** WhatsApp, Instagram and Messenger have no API for personal inboxes;
   Instagram/Messenger messaging APIs are for professional accounts/Pages; Telegram's Bot API covers bots you own;
   X depends on paid API tiers. Don't design around wishful access.
3. **Re-verify provider terms before building** — they change. Update `catalog.ts` when they do.

## Capability matrix (`src/integrations/catalog.ts`)

- `CapabilityStatus`: `'available'` (works in this prototype today) · `'planned'` (feasible via official APIs, needs the backend) · `'business-only'` (API exists only for business/professional accounts) · `'unavailable'` (no approved way for personal accounts).
- `STATUS_COPY` maps each to the user-facing label/tone: "Available now", "Planned", "Business accounts only", "Not available". Render statuses with `<Tag label={STATUS_COPY[s].label} tone={STATUS_COPY[s].tone} />` — don't invent new wording.
- `INTEGRATIONS: IntegrationInfo[]` (`platform`, `name`, `summary`, `capabilities: Capability[]`, `alternatives`), looked up with `integrationFor(platform)`.
- Consumers: `src/app/(tabs)/connections.tsx`, `src/app/integration/[platform].tsx`, `src/app/import.tsx`.
- Platforms are the `SourcePlatform` union in `src/domain/types.ts`. Adding one means: extend the union, add an `IntegrationInfo`, add `PLATFORM_LABEL`/`SourceBadge` support in `src/components/ui.tsx`.
- Only mark `'available'` when the code path ships and works end-to-end on device. Every capability needs a `note` saying *how* (or why not), and every platform needs honest `alternatives`.

## Copy rules

| Never say | Say instead |
| --- | --- |
| "Connect your WhatsApp" / "Sync WhatsApp" | "Import a chat you exported from WhatsApp" |
| "Your Instagram DMs, here" | "Instagram messaging is available for professional accounts only" |
| "End-to-end encrypted" (for anything in this prototype) | "Stored on this device. Not end-to-end encrypted by hye." |
| "Reply from hye" on imported chats | "History only — not synced, and replies here won't reach WhatsApp" |
| "Exact timestamps" for exports | "Times are as recorded on the exporting phone" |
| "Coming soon!" without basis | "Planned" + what it depends on (backend, API tier, app review) |

- E2EE for hye-to-hye chats is part of the *server design*, not the prototype (see the "About encryption" banner in `src/app/settings/[page].tsx`). Don't claim it in UI until it ships.
- Imported conversations always show their origin (`origin: 'imported'`, `SourceBadge imported`, `Banner tone="imported"` as in `src/components/ConversationView.tsx`).
- Data movement statements must be literal: what leaves the device, what doesn't (see the import banner in `src/app/import.tsx`: "hye never uploads your file…").
- Apply `ux-writing`: plain, specific, no hype.

## Import / migration principles

Reference implementation: `src/domain/import/whatsapp.ts` (`parseWhatsAppExport`, `recordTimestamp`),
`src/domain/import/pipeline.ts` (`planImport`, `previewImport`, `runImportBatch`, `migrationReport`,
`WHATSAPP_NOT_PRESERVED`), `src/services/importer.ts` (`loadExport`, `analyse`, `buildPreview`, `persistExport`, `newJob`).

1. **No invented metadata.** If the source doesn't carry it, leave it empty: no fake reactions, read receipts,
   delivery status, reply links or time zones. Missing media becomes an `Attachment` with `missingReason`, not a placeholder image. Edits are marked but `editedAt` is only what the export implies.
2. **Tell users what's lost before they import.** A per-source "not preserved" list (like `WHATSAPP_NOT_PRESERVED`) shown in the preview and included in the report.
3. **Provenance on everything.** `Conversation.provenance: ImportProvenance` (`platform`, `jobId`, `fileName`, `importedAt`, `timezoneNote`); messages keep `sourceRef` (original line numbers) for audit.
4. **Idempotent.** Each record gets a stable `sourceKey` (hash of source fields + occurrence index); re-importing the same export skips existing keys instead of duplicating. Genuine repeats survive via the occurrence suffix.
5. **Resumable and transparent.** `ImportJob` persists `cursor` and per-item `results` (`imported`/`skipped`/`failed` + reason) after each batch (`await flush()`); users can pause/resume/retry and save a `migrationReport` (`format: 'hye-migration-report/1'`).
6. **Ambiguity is surfaced, not guessed.** Date order (`DMY`/`MDY`/`YMD`) and "which participant is you" are asked or detected with a visible choice.
7. **Safe file handling.** Size cap (`MAX_EXPORT_BYTES`), `BLOCKED_EXTENSIONS`, files stay on device, deletable (`deleteImportFiles`, `clearAppFiles`).
8. **Read-only.** Imported history never sends back to the source platform.
9. Tests with fixtures live in `src/domain/import/__tests__/` (`whatsapp.test.ts`, `pipeline.test.ts`, `e2eFixtures.test.ts`) and `e2e/fixtures/`. New importers ship with parser + idempotency tests.

## Review checklist

- [ ] Uses only official APIs or user-exported files; no credential collection for other services
- [ ] `catalog.ts` status matches what actually ships; `note` and `alternatives` are accurate
- [ ] No copy claims sync, live inbox, two-way replies, or E2EE that doesn't exist
- [ ] Imported content visibly labelled; data-location statement is literal
- [ ] No fabricated fields; lost data listed up front and in the report
- [ ] Provenance + `sourceKey` + `sourceRef` set; re-import is a no-op
- [ ] Job resumable, results per item, report exportable
- [ ] Parser/pipeline tests cover malformed lines, duplicates and date-order ambiguity
- [ ] Provider terms re-checked and dated in the PR description

Related: `hye-feature-module` (state/persistence), `ux-writing`, `ux-heuristics`.
