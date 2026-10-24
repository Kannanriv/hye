# hye

**One place. All your conversations. Your memories kept.**

hye is a unified communication app: native one-to-one and group messaging, a single inbox, and a guided **Migration Center** that brings your chat history over from user-made exports, with no scraping, no borrowed passwords and no fake integrations.

This repository contains:

| Path | What |
| --- | --- |
| `src/` | Expo (SDK 58) + expo-router + TypeScript app for Android, iOS and web |
| `backend/` | NestJS modular monolith, PostgreSQL migrations, docker-compose for Postgres/Redis/MinIO/ClamAV |
| `docs/` | [Product](docs/PRODUCT.md) (MVP scope, integration feasibility, IA, journeys, metrics) and [Architecture](docs/ARCHITECTURE.md) |
| `e2e/` | Playwright web journeys + Android on-device checklist, plus WhatsApp export fixtures |
| `.claude/skills/` | Agent skills used to design, write, review and test the app |

## What works in this prototype

- **Accounts**: local demo account created on the device (passkeys come with the server).
- **Messaging**: 1:1 and groups, text, photos and files, replies, reactions, edit, delete for everyone, forward with source attribution, delivery and read ticks, typing indicator, per-chat search, message timers, block and report, group admin (rename, add/remove, admins, leave).
- **Unified inbox**: All, Unread, Personal, Groups, Connected, Imported and Archived tabs; filters by platform, person, date and media; pin, mute, archive, mark unread; global search across native and imported messages.
- **Migration Center**: WhatsApp "Export chat" `.txt` or `.zip` (Android and iOS formats). Validates the file, previews counts, date range, attachments, duplicates and what the format can't carry, asks for the date format when it's ambiguous, then imports in resumable batches. Re-importing never duplicates. Ends with a report that you can retry and save as JSON.
- **Social Feed**: save posts by link, with source labels, search and filters. No live feeds: no platform offers personal timelines to third-party apps.
- **Connections**: an honest capability matrix per platform (available, planned, business-only or not available).
- **Privacy**: read receipts, typing, last seen, default timers, security activity log, full data export (JSON), delete imported history, delete account.
- **UX**: light and dark mode; phone layout with bottom tabs and a "More" sheet; tablet and desktop layout with sidebar, list and conversation side by side; accessibility labels on every control.

### Clearly simulated

- **Demo contacts** (Ava, Rahul, Maya, Leo, Sara) are tagged "Demo". Their delivery, read, typing and replies are simulated on the device.
- **No server is connected**: data lives on the device (AsyncStorage plus app files), and there are no push notifications or real contact discovery.
- **No external account can be connected.** The Connections screen says so.

## Run it

Prerequisites: Node 20+ (22 recommended) and npm. For the phone, Android platform-tools (`adb`) and the **Expo Go** app.

```bash
npm install
npm test            # unit tests (parser, import pipeline, selectors, reducer)
npm run typecheck
```

### On your Android phone over USB (recommended)

```bash
adb devices                      # must show "<serial>  device"
npm run phone                    # adb reverse tcp:8082 + Metro on 8082
# then open Expo Go → "Enter URL manually" → exp://127.0.0.1:8082
# or: adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8082"
```

If `adb devices` shows `unauthorized`, unlock the phone and accept **Allow USB debugging**. If it shows nothing, use a data cable, set USB mode to **File transfer**, and check that Developer options → **USB debugging** is on. See [.claude/skills/hye-run-on-phone/SKILL.md](.claude/skills/hye-run-on-phone/SKILL.md) for the full workflow, including screenshots and UI automation over adb.

To try the import on the phone:

```bash
adb push "e2e/fixtures/WhatsApp Chat with Priya.txt" /sdcard/Download/
```

### Web

```bash
npm run web
```

### Backend

See [backend/README.md](backend/README.md): `docker compose up -d`, `npm run migrate`, `npm run start:dev`.

## Environment variables

The app needs none in demo mode. The server's are documented in [backend/.env.example](backend/.env.example). When the app is wired to the server it will read `EXPO_PUBLIC_API_URL` (public, non-secret).

## Tests

| Suite | Command |
| --- | --- |
| Unit (jest) | `npm test` |
| Web end-to-end (Playwright, Python) | `npm run e2e:web` (see [e2e/README.md](e2e/README.md)) |
| Android on-device | checklist in [e2e/README.md](e2e/README.md); driven over adb |
| Backend | `cd backend && npm test` |

## Deploy

- **App**: build with EAS (`npx eas-cli@latest build -p android --profile preview` for an installable APK) and ship JS updates with `eas update`. iOS needs an Apple developer account.
- **Server**: containers on any platform with managed Postgres, Redis and S3. Run migrations in CI before rollout. Scale the WebSocket gateway horizontally with the Redis adapter. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Principles we hold the code to

Official APIs and user-made exports only. Never invent metadata a source didn't provide. Imported history is always labelled, never shown as live, and never called end-to-end encrypted. Users can export or delete everything. No engagement traps.
