# hye: Product

hye is a unified communication app. It does three things: native messaging (1:1 and groups), one inbox for every conversation, and a lawful way to bring old chat history across from other apps.

This document covers what hye is, what the MVP includes, and how the prototype in this repo relates to the full product. Every statement about current behaviour links to the code that implements it. For the system design, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Vision and principles

**Vision:** one place for all your conversations, with your memories kept and no lock-in.

| Principle | What it means in practice | Where it shows in the prototype |
|---|---|---|
| **Honest capability** | We only show what works. If something is planned or not possible, the UI says so. | [`catalog.ts`](../src/integrations/catalog.ts) is the source of truth for every platform claim; the "Connected" inbox tab is empty on purpose ([`selectors.ts`](../src/state/selectors.ts), `inboxRows`) |
| **Official routes only** | We use official APIs and user-initiated exports. We never scrape, collect credentials for other services, or bypass encryption. | Copy in [`integration/[platform].tsx`](../src/app/integration/[platform].tsx) and the import guide in [`import.tsx`](../src/app/import.tsx) |
| **Never invent data** | Imports keep exactly what the source contains. Anything the source can't carry is listed before the user confirms the import. | `WHATSAPP_NOT_PRESERVED` in [`pipeline.ts`](../src/domain/import/pipeline.ts); header comment in [`whatsapp.ts`](../src/domain/import/whatsapp.ts) |
| **Safe to retry** | Imports are idempotent and resumable, so retrying never creates duplicates. | `planImport` / `runImportBatch` in [`pipeline.ts`](../src/domain/import/pipeline.ts) |
| **User owns the data** | Export everything, delete imported history, or delete the account at any time. Sensitive actions are logged for the user to see. | `YourData` and `Activity` in [`settings/[page].tsx`](../src/app/settings/[page].tsx) |
| **Simulation is labelled** | Demo contacts and simulated behaviour are always marked in the UI. | `isDemo` in [`types.ts`](../src/domain/types.ts); "Demo" tags in [`new-chat.tsx`](../src/app/new-chat.tsx) |
| **Calm by default** | Imported chats are muted and never count as unread. Message previews in notifications are off by default. | [`import.tsx`](../src/app/import.tsx) (`muted: true`), `unreadCount` in [`selectors.ts`](../src/state/selectors.ts), `initialState` in [`demo.ts`](../src/state/demo.ts) |

---

## 2. MVP scope

### In scope, in priority order

| # | Capability | MVP definition | Prototype status |
|---|---|---|---|
| 1 | **Auth** | Account with display name, unique handle and email. Passkey (WebAuthn) sign-in, session list, sign out of other devices. | **Simulated.** The account is created locally with no password ([`welcome.tsx`](../src/app/welcome.tsx)). Passkeys and the session list are shown as "coming with the hye server" ([`settings/[page].tsx`](../src/app/settings/[page].tsx), `Devices`). |
| 2 | **Native 1:1 and group messaging** | Text and attachments, plus reply, forward, react, edit, delete for everyone, delivery and read states, and typing. Groups support admins, rename, add or remove members, and leaving. | **Working on device, simulated with others.** All interactions are implemented ([`ConversationView.tsx`](../src/components/ConversationView.tsx), [`details.tsx`](../src/app/conversation/[id]/details.tsx)). The people at the other end are demo contacts. |
| 3 | **Unified inbox** | One list for native and imported conversations. Tabs: All, Unread, Personal, Groups, Connected, Imported, Archived. Filters: platform, person, date range, media type. Actions: pin, mute, mark unread, archive, delete. | **Working** ([`(tabs)/index.tsx`](../src/app/(tabs)/index.tsx), [`ConversationList.tsx`](../src/components/ConversationList.tsx), `inboxRows` in [`selectors.ts`](../src/state/selectors.ts)). |
| 4 | **One import format: WhatsApp "Export chat" (.txt / .zip)** | Parse, preview, confirm, then a batched, resumable, idempotent import. The user gets a migration report. | **Working on device** ([`whatsapp.ts`](../src/domain/import/whatsapp.ts), [`pipeline.ts`](../src/domain/import/pipeline.ts), [`importer.ts`](../src/services/importer.ts), [`import.tsx`](../src/app/import.tsx)). |
| 5 | **Search and archive** | Full-text search across native and imported messages and file names, with scope filters. Archive keeps conversations without deleting them. | **Working.** Substring search, at least 2 characters, capped at 200 results (`searchMessages` in [`selectors.ts`](../src/state/selectors.ts), [`search.tsx`](../src/app/search.tsx)). Archive is a tab ([`(tabs)/archive.tsx`](../src/app/(tabs)/archive.tsx)). |
| 6 | **Privacy controls** | Read receipts, typing indicators, last-seen visibility, per-chat and default message timers, block, report, data export, deletion of imported history, account deletion, security activity log. | **Mostly working on device.** Last seen is stored but has no effect because there is no presence service yet. Reports are only written to the local audit log. |
| 7 | **Integration framework** | A capability matrix for each platform, connected only through official APIs and backed by a server. | **Catalog only.** No account can be connected ([`connections.tsx`](../src/app/(tabs)/connections.tsx), [`catalog.ts`](../src/integrations/catalog.ts)). |

### Explicitly out of scope for the MVP

- Live personal-account inboxes for WhatsApp, Instagram, Messenger or Telegram. No approved API exists for these (see §3).
- Any second import format. The Telegram JSON, Meta "Download your information" and X archive importers are planned, not built.
- Syncing back to the source app. Imported history is read-only and never written back.
- Social timelines. The Social Feed holds links the user saves. hye never fetches those pages ([`feed.tsx`](../src/app/(tabs)/feed.tsx), `platformForUrl` in [`labels.ts`](../src/utils/labels.ts)).
- Communities made of several groups, announcement channels and sub-groups. For now a community is a group ([`communities.tsx`](../src/app/(tabs)/communities.tsx)).
- Voice and video calls, stories, payments, bots.
- Finding real people by handle. This needs the server ([`new-chat.tsx`](../src/app/new-chat.tsx)).

### Why WhatsApp "Export chat" is the one import format

1. **The user starts it.** WhatsApp's own "Export chat" feature writes a file the user chooses to share. hye never signs in to WhatsApp, never asks for WhatsApp credentials, and never reads WhatsApp's encrypted local database or backups.
2. **No API or terms-of-service conflict.** WhatsApp offers no API for personal chats, and the Business Platform (Cloud API) is for verified businesses ([`catalog.ts`](../src/integrations/catalog.ts)). A user-held export is the only route that needs neither.
3. **It is technically tractable.** It is plain text in a documented, stable layout with Android and iOS variants. Media can come along inside a `.zip`. The parser handles both line formats, 12-hour and 24-hour clocks, invisible direction marks, multi-line messages, edits, deletions, attachments and omitted media ([`whatsapp.ts`](../src/domain/import/whatsapp.ts)).
4. **It meets the most common need.** Most people who switch want to keep their WhatsApp history.
5. **Its limits are known and shown.** The format has no time zones, reactions, reply links, receipts, phone numbers for named contacts, polls, view-once media or call details. The user sees this list before confirming (`WHATSAPP_NOT_PRESERVED` in [`pipeline.ts`](../src/domain/import/pipeline.ts)).

Imported history is a copy that the user provided. **hye does not end-to-end encrypt it.** The import guide and privacy screen both say so.

---

## 3. Integration feasibility

These entries mirror [`src/integrations/catalog.ts`](../src/integrations/catalog.ts). Provider policies change, so each entry must be re-checked against the provider's current developer terms before any build. Statuses are product statements, not a live connection state. Nothing can be connected in the prototype.

Status legend: **Available** = works in the prototype · **Planned** = feasible through official APIs, needs the backend · **Business only** = an official API exists only for business or professional accounts · **Not available** = no approved route for a third-party app with personal accounts.

| Platform | Capability | Status | Official route / constraint |
|---|---|---|---|
| **WhatsApp** | Import chat history | **Available** | User-initiated "Export chat" (.txt / .zip) |
| | Live inbox, personal accounts | Not available | No API for reading personal chats |
| | Business messaging | Business only | WhatsApp Business Platform (Cloud API), verified businesses |
| **Instagram** | Direct messages | Business only | Instagram Messaging API: professional account and app review |
| | Import message history | Planned | "Download your information" (JSON) |
| | Feed and posts | Not available | No API gives third-party apps a personal home feed |
| **Messenger** | Page inbox | Business only | Messenger Platform, for Pages the user manages |
| | Personal chats | Not available | No API for personal Messenger inboxes |
| | Import message history | Planned | "Download your information" (JSON) |
| **X** | Direct messages | Planned, conditional | Depends on the paid API tier and the OAuth scopes the user grants |
| | Posts the user may see | Planned, conditional | Limited by API tier and rate limits |
| | Import archive | Planned | "Download an archive of your data" |
| **Telegram** | Import chat history | Planned (next importer) | Telegram Desktop → Export Telegram data (JSON) |
| | Live inbox, personal accounts | Not available | Not offered through the Bot API. We will not ask for a Telegram login. |
| | Bots and channels | Planned | Official Bot API, for bots the user owns |
| **Email** | Gmail and Outlook inbox | Planned | OAuth with read scopes the user approves, server-side |
| | Other providers (IMAP) | Not available | Only providers with OAuth sign-in. We won’t store any email password, including app passwords |

**Hard rules for every integration:**

- Official APIs and user-initiated exports only.
- No scraping.
- No collecting passwords for other services.
- No reverse-engineered clients.
- No bypassing end-to-end encryption.

Where a capability is "Not available", hye offers the alternatives listed in the catalog, such as `wa.me` / `t.me` links, saving post links, or exporting and importing later.

> Decision: hye never stores email passwords, including provider-issued app passwords. Providers without OAuth sign-in are out of scope.

---

## 4. Information architecture

### Seven sections

| Section | Route | Purpose |
|---|---|---|
| Inbox | `/` → [`(tabs)/index.tsx`](../src/app/(tabs)/index.tsx) | Every conversation, native and imported, with tabs and filters |
| Messages | `/messages` → [`(tabs)/messages.tsx`](../src/app/(tabs)/messages.tsx) | Native hye conversations only (`nativeOnly`) |
| Communities | `/communities` → [`(tabs)/communities.tsx`](../src/app/(tabs)/communities.tsx) | The native groups you belong to; create a group |
| Social Feed | `/feed` → [`(tabs)/feed.tsx`](../src/app/(tabs)/feed.tsx) | Private saved post links, searchable and filterable by platform |
| Connections | `/connections` → [`(tabs)/connections.tsx`](../src/app/(tabs)/connections.tsx) | The import entry point and the platform capability matrix |
| Archive | `/archive` → [`(tabs)/archive.tsx`](../src/app/(tabs)/archive.tsx) | Archived conversations |
| Settings | `/settings` → [`(tabs)/settings.tsx`](../src/app/(tabs)/settings.tsx) | Profile, privacy, notifications, appearance, devices, blocked, activity, data |

Secondary routes, all in a protected stack and available only when signed in ([`_layout.tsx`](../src/app/_layout.tsx)):

- `/conversation/[id]`
- `/conversation/[id]/details` (modal)
- `/new-chat` (modal, `?mode=group`)
- `/import` (`?job=<id>` opens a report)
- `/search`
- `/integration/[platform]`
- `/settings/[page]` (`privacy`, `notifications`, `appearance`, `devices`, `blocked`, `activity`, `data`)

`/welcome` is the only route available when signed out.

### Responsive layout

| Form factor | Navigation | Conversations |
|---|---|---|
| **Phone** (width < 768) | Bottom bar with 4 tabs (Inbox, Messages, Communities, Social Feed) plus a **More** sheet for Connections, Archive and Settings | Tapping a list row pushes `/conversation/[id]` |
| **Tablet / desktop** (width ≥ 768) | Left sidebar with all 7 sections | Split view: the list on the left (380 px), the open conversation on the right |

Sources:
- `PHONE_PRIMARY` in [`AppNavBar.tsx`](../src/components/AppNavBar.tsx)
- `tabBarPosition` in [`(tabs)/_layout.tsx`](../src/app/(tabs)/_layout.tsx)
- [`SplitInbox.tsx`](../src/components/SplitInbox.tsx)
- `WIDE_BREAKPOINT` in [`tokens.ts`](../src/theme/tokens.ts)

---

## 5. Key user journeys

Each step names the route or component where it happens.

**J1 · Create an account**
1. `/welcome`: read the three promises, then tap **Get started**.
2. Enter a name (at least 2 characters), a handle (3–20 characters from `a-z0-9_`) and an email. A "Demo mode" banner explains that data stays on the device.
3. **Create account** seeds the demo world (`demoWorld` in [`demo.ts`](../src/state/demo.ts)), writes `account.created` to the audit log, and goes to `/`.

**J2 · Start a 1:1 conversation**
1. `/` or `/messages`, then the compose icon, which opens `/new-chat`.
2. Search for and pick a contact. Demo contacts carry a "Demo" tag.
3. If a native direct chat with that contact already exists, it opens (and is unarchived if needed). Otherwise a new chat is created with the default message timer, and `/conversation/[id]` opens.

**J3 · Create and manage a group**
1. `/communities`, then **Create a group**, which opens `/new-chat?mode=group`.
2. Name the group, pick members, then **Create group**. A system message is added and `group.created` is audited.
3. `/conversation/[id]/details`: admins can rename the group, add people, make or remove admins, and remove members. Every change posts a system note. Any member can leave; leaving archives the chat for that user.

**J4 · Converse**
1. `/conversation/[id]`: type and send. Status moves through sending → sent, and for demo contacts on to delivered and read.
2. Attach files through the document picker. Executable file types are filtered out.
3. Long-press a message to react, reply, copy, forward (the recipient sees "Forwarded from …"), edit your own message, or delete it for everyone.
4. Search within the conversation from its header.

**J5 · Triage the unified inbox**
1. `/`: switch tabs (All, Unread, Personal, Groups, Connected, Imported, Archived).
2. Open filters to narrow by platform, person, time range (7, 30 or 365 days) or media type.
3. Long-press a conversation to pin, mute, mark unread, archive or delete it. Imported conversations hide mute and mark-unread.

**J6 · Import a WhatsApp chat**
1. `/` (download icon) or `/connections`, then **Import a WhatsApp chat**, which opens `/import`.
2. **Source:** choose WhatsApp. The other platforms show "Coming soon".
3. **Guide:** steps for exporting on Android and iPhone, the list of things the export can't include, and a note that hye does not E2EE imported history.
4. **Validating:** the app checks the file type (`.txt` or `.zip`), the size (250 MB or less), that the zip contains a chat file, and blocks executable files ([`importer.ts`](../src/services/importer.ts) `loadExport`).
5. **Review:**
   - If the date format is ambiguous, pick it, shown as a real date from the file.
   - Optionally choose "which one is you".
   - See counts for messages, files included, files missing, files omitted by the export, system notices, deleted and edited messages, duplicates, unreadable dates, and blocked files.
6. **Import:** the app shows a progress bar. The import pauses when you leave the screen.
7. **Report:** imported, skipped and failed counts, the list of items, **Open conversation**, and **Save report (JSON)**.

**J7 · Resume or repair an import**
1. `/import` shows a banner for each paused or interrupted job: "stopped at N of M", with a **Resume import** button.
2. Resuming reloads the copy of the export saved on the device and continues from the saved cursor. Already-imported keys are skipped.
3. If items failed on date parsing, the report offers a retry with another date format. Only the failed items are reprocessed.
4. `/conversation/[id]/details` for an imported chat shows where the history came from, a link to the import report, and the participants as named in the export.

**J8 · Search everything**
1. The search icon on `/` or `/archive` opens `/search`.
2. Type at least 2 characters. The search covers message text and attachment file names in native and imported chats. Deleted and system messages are excluded.
3. Narrow the scope to Everything, hye chats or Imported. Tap a result to open its conversation.

**J9 · Understand what other apps allow, and save posts**
1. `/connections` lists the platforms with their best available status. Tap one to open `/integration/[platform]`.
2. That screen shows each capability with its status and note, plus the alternatives.
3. `/feed`: paste a link and an optional note to save a post. The platform is guessed from the host. Saved posts are searchable, filterable, and can be removed.

**J10 · Control privacy and data**
1. `/settings/privacy`: read receipts, typing indicators, last seen, the default message timer, and an explanation of encryption.
2. `/conversation/[id]/details`: per-chat timer, block or unblock, report, export this conversation as JSON.
3. `/settings/blocked`: unblock people. `/settings/activity`: the audit log.
4. `/settings/data`:
   - **Export my data** (JSON, format `hye-export/1`).
   - **Delete all imported history**.
   - **Delete my account**, which requires typing DELETE.

---

## 6. What the prototype simulates

The prototype runs entirely on the device. Everything it fakes is labelled in the UI.

| Area | Prototype behaviour | Label in UI | Real product |
|---|---|---|---|
| **Server** | None. State is one JSON blob in AsyncStorage (`hye/state/v1`), saved with a 300 ms debounce. Imports flush it explicitly ([`store.tsx`](../src/state/store.tsx)). | Settings → "About this prototype" | NestJS + Postgres ([ARCHITECTURE.md](./ARCHITECTURE.md)) |
| **Account / auth** | Local account, no password, no passkey, one "session" | "Demo mode" banner; Devices page | Passkeys (WebAuthn), server sessions |
| **Contacts** | 5 bundled demo contacts (`DEMO_CONTACTS` in [`demo.ts`](../src/state/demo.ts)) with seeded chats | "Demo" tag, "Demo contact · simulated replies" | Handle lookup, contact requests |
| **Delivery / read** | Timers: sent after 250 ms, delivered after 500 ms, read after 1.4 s. The last two apply only when a demo contact is in the chat (`simulateDemo` in [`store.tsx`](../src/state/store.tsx)) | Demo subtitle in the chat header | Server acks plus recipient device receipts |
| **Typing / replies** | A random demo member "types" from 1.8 s to 3.6 s and then sends a canned reply. Roughly 25% of the time there is no reply. | Same | WebSocket typing events |
| **Push notifications** | Preferences are saved but nothing is sent | Notifications page footnote | APNs / FCM through the Notifications module |
| **Presence / last seen** | The setting is stored and has no effect | None | Redis presence |
| **Report** | Only recorded in the local audit log | Report dialog text | Moderation queue |
| **Integrations** | Catalog only. The Connected tab is always empty. | "No accounts connected" banner | Integrations module |
| **Encryption** | None. Data is on-device only. | Privacy → "About encryption" | E2EE for native chats (see ARCHITECTURE §8) |
| **Import resume on web** | Not supported: the export is not saved on web, so `reloadExport` returns `null` | Error: "original export is no longer on this device" | Server-side job with stored upload |

---

## 7. Success metrics

The prototype collects **no analytics**. The definitions below are for the server product. Events go to the Analytics module (ARCHITECTURE §3). They carry IDs, counts and enums, **never message content**, and users can opt out.

| Metric | Precise definition | Instrumentation | Target (initial) |
|---|---|---|---|
| **Time to first conversation (TTFC)** | Median of `t(first message sent or received in any conversation, native or imported) − t(account.created)` for new accounts, per weekly cohort | Server events: `account.created` and the first of `message.sent` / `message.received` / `import.completed`. Computed in the warehouse. | p50 < 3 min |
| **Migration success rate** | Import jobs reaching `completed` with `failed = 0` ÷ jobs that left `validating`. Reported separately: validation rejection rate (files rejected ÷ files picked), by `ImportError` reason. | `import_jobs.status` transitions; `import.validation_failed{reason}` | ≥ 95% of started jobs |
| **% imported messages with preserved metadata** | For completed jobs: messages with a valid `sent_at`, the correct sender attribution (sender name present, or `me` mapped when chosen), and, for each referenced attachment, either a stored file or a `missing_reason` ÷ total records in the export. Items the format cannot carry (see `WHATSAPP_NOT_PRESERVED`) are excluded from the denominator. | Derived from `import_items` outcomes and the `messages` / `attachments` rows joined on `source_key` | ≥ 99% |
| **Import failure / retry rate** | Failure rate: `Σ failed ÷ Σ total` items. Retry rate: jobs with at least one resume or date-order retry ÷ jobs started. Retry recovery: items moved from failed to imported by a retry ÷ items retried. | `import.resumed`, `import.retried{order}`, job counters | Failure < 0.5% of items |
| **Delivery reliability** | Native messages acked `delivered` to at least one recipient device within 5 s of the server accepting them ÷ messages accepted. Also: messages that end `failed` ÷ messages sent. | Server timestamps `accepted_at` / `delivered_at` per recipient; client `message.failed` | ≥ 99.9% within 5 s |
| **Search success** | Search sessions in which the user opens a result within 60 s of the last keystroke ÷ search sessions with a query of at least 2 characters. Zero-result rate tracked separately. | Client `search.performed{scope, result_count}` and `search.result_opened{rank}`, no query text | ≥ 70% success; < 10% zero-result |
| **WAU** | Distinct accounts that **send** at least one native message **or** open at least one conversation in a rolling 7-day window. App opens alone do not count. | `conversation.opened`, `message.sent` | Growth KPI |
| **Trust / retention** | D7 / D30 retention by cohort, split by "imported at least one chat" versus not. Trust proxies: share of users who disable read receipts, users who delete imported history within 7 days, account deletions within 30 days, and a periodic opt-in survey ("I trust hye with my history", 1–5). | Cohort tables plus `privacy.changed`, `imports.deleted`, `account.deleted` | D30 ≥ 35% |
| **Integration reliability** | For each connected integration: successful sync runs ÷ scheduled runs, p95 lag from provider event to inbox, and token-refresh failure rate. A "Not available" capability never counts as a failure. | Integrations worker metrics (ARCHITECTURE §9) | ≥ 99.5% runs succeed |
