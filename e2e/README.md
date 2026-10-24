# hye end-to-end tests

Web journeys run with Python Playwright against the Expo web build. They use the project skill
`.claude/skills/webapp-testing` and its `scripts/with_server.py` helper to start and stop the dev server.

## Setup (once)

```sh
npm install
python -m pip install playwright
python -m playwright install chromium
```

## Run

```sh
npm run e2e:web
```

This starts `npx expo start --web --port 8081`, waits for the port (up to 600 s, because the first Metro
bundle is slow), runs `e2e/web/test_journeys.py`, then stops the server.

If a server is already running:

```sh
python e2e/web/test_journeys.py                      # both passes
python e2e/web/test_journeys.py --only phone         # 412x915 (Pixel 8a) only
python e2e/web/test_journeys.py --only desktop --headed
python e2e/web/test_journeys.py --base-url http://localhost:8082
```

The exit code is non-zero if any journey fails. Each run prints a PASS/FAIL/SKIP summary and `NOTE` lines
for things that work but look wrong. Screenshots for every step, plus a `FAIL-*` shot on failure, go to
`e2e/artifacts/`. That folder is gitignored.

### What runs

Phone pass (412x915, touch, DPR 2.625, one browser context, so state carries from step to step):

| Journey | Checks |
|---|---|
| signup | Lands on `/welcome`. An empty submit shows the name, username and email errors. Invalid values keep the errors and the username is lower-cased. Valid values clear the errors and open the inbox. |
| inbox | Demo conversations are listed. Pinned Ava is first and unread. The archived chat is hidden from All and shown in the Archived tab. The tab badge shows unread. The inline search filters the list. |
| chat | Opens Ava, shows the "Demo contact · simulated replies" subtitle, then sends a message. Ticks go sending → sent → read and a simulated reply arrives (it retries because replies happen about 75% of the time). Long-pressing a message adds a 👍 reaction. |
| group | New conversation → Group. Create stays disabled until people are picked. Creates "E2E Goa trip" with Ava and Leo, checks the system notice and members, sends a message, and checks the Groups tab. |
| search | Needs at least 2 characters. Checks the result count, the hit for a native message, the no-results state, and that tapping a result opens the conversation. |
| import | Import → WhatsApp → choose file (`expect_file_chooser`) → review: counts, no date question, "Which one is you?" → Import 25 items. The report shows 25 imported, 0 skipped, 0 failed. The conversation shows the "Imported from a WhatsApp export" banner, has no composer, and shows Kannan's messages as outgoing. Also checks the Imported tab. |
| reimport-dedupe | Imports the same file again. The review says "25 messages are already in hye" and the report shows 0 imported and 25 skipped. Search finds each message only once. |
| ambiguous-dates | `ambiguous.txt` asks "How are dates written?" and Import stays disabled until you pick a format. Picks day-first, imports 5, and checks that 11/04 shows as 11 April. |
| delete-account | Settings › Your data › Delete my account. "DELET" and other text leave the button disabled. Cancel resets the field. "DELETE" enables it and leads back to the welcome screen. After a reload the user is still signed out and storage is wiped. |

Desktop pass (1280x800, fresh context): signs up, checks that the sidebar shows all 7 sections with no
"More" tab, and checks the split view. Clicking a chat opens it beside the list without changing the URL,
and sending works there.

### Fixtures

- `fixtures/WhatsApp Chat with Priya.txt`: an Android-format export with 25 records (22 messages, 2 system
  notices, 1 deleted). It includes a multi-line message, an `IMG… (file attached)` line with a caption,
  a VID attachment, `<Media omitted>` and `<This message was edited>`. Days go above 12, so the date order
  is DMY with no ambiguity.
- `fixtures/ambiguous.txt`: every day is 12 or less, so the date order can be DMY or MDY.

`src/domain/import/__tests__/e2eFixtures.test.ts` pins these counts. If you edit a fixture, update that
test and the constants at the top of `web/test_journeys.py`.

### Notes on selectors

The suite uses role, label and text selectors only. RN-web renders `accessibilityLabel` as `aria-label`
and `accessibilityRole` as `role`. React Navigation keeps earlier screens mounted, so locators are
filtered with `.filter(visible=True)`. react-native-web 0.21 ignores `accessibilityState`, so selected and
checked states can't be asserted on web. The suite logs a NOTE for these and checks the outcome instead.

## Android device (manual/adb) checklist

Setup: connect the phone (e.g. Pixel 8a) with USB debugging on, then run `npm run phone`, or
`adb reverse tcp:8081 tcp:8081` and then `npx expo start --android`. Copy both fixtures to the phone:
`adb push "e2e/fixtures/WhatsApp Chat with Priya.txt" /sdcard/Download/` and
`adb push e2e/fixtures/ambiguous.txt /sdcard/Download/`. For a real-world check, also export a real chat
from WhatsApp (⋮ → More → Export chat), once without media and once with media (.zip).
Screenshots: `adb exec-out screencap -p > step.png`.

Run with TalkBack off first, then repeat steps 1–4 with TalkBack on.

1. **Sign up**
   - [ ] On a fresh install, the Welcome screen appears.
   - [ ] Tap Get started, then Create account with empty fields. Three inline errors appear.
   - [ ] Enter name "K", username "Ab" and email "x". The errors stay and the username shows as "ab".
   - [ ] Enter valid values (name Kannan). The inbox opens.
   - [ ] The keyboard doesn't cover the fields.
2. **Inbox**
   - [ ] Ava Chen (pinned, unread badge), Weekend hikers, Rahul Menon and Design crit are shown.
   - [ ] Sara is only in the Archived tab.
   - [ ] Demo chats are labelled as demo.
   - [ ] The Inbox tab shows an unread dot.
   - [ ] Long-press a row and the menu opens (Pin, Mute, Mark as unread, Archive, Delete).
3. **Chat**
   - [ ] Open Ava. The subtitle says "Demo contact · simulated replies".
   - [ ] Send a message. The clock icon changes to one tick, then double ticks, then filled double ticks.
   - [ ] "Ava is typing…" appears, then a reply arrives. Resend if no reply comes, since replies happen about 75% of the time.
   - [ ] Long-press a message and react with 👍. Reply, edit and delete-for-everyone work.
   - [ ] The Android back gesture returns to the inbox.
4. **Group**
   - [ ] New conversation shows Demo tags on contacts.
   - [ ] Switch to Group. Create is disabled until you enter a name and pick a person.
   - [ ] Create a group with Ava and Leo. It shows "You created …" and the subtitle "You, Ava, Leo".
5. **Search**
   - [ ] Search all messages finds nothing with 1 character.
   - [ ] "trail" returns 1 result (Weekend hikers). Tapping it opens the chat.
6. **Import**
   - [ ] Import → WhatsApp → Choose export file opens the system picker. Pick `WhatsApp Chat with Priya.txt`.
   - [ ] The review shows Priya, 2 participants, 22 messages, "2 system notices · 1 deleted · 1 edited", and "Which one is you?" with Kannan preselected.
   - [ ] Tap Import 25 items. The report shows Imported 25, Skipped 0 and Failed 0.
   - [ ] Open conversation shows the "Imported from a WhatsApp export" banner and no composer. Kannan's messages are on the right.
   - [ ] The multi-line plan shows as one bubble.
7. **Re-import**
   - [ ] Import the same file again. The review says "25 messages are already in hye".
   - [ ] The report shows Imported 0 and Skipped 25.
   - [ ] Searching "marmalade" still gives 1 result.
8. **Ambiguous dates**
   - [ ] Import `ambiguous.txt`. The review asks "How are dates written?".
   - [ ] The Import button is disabled until you pick "3 April 2025".
   - [ ] After importing 5, 11/04 shows as 11 April.
9. **Media export (.zip)**
   - [ ] Import a real "Include media" export. Photos render in the chat and blocked file types are reported.
   - [ ] Leaving the screen mid-import pauses it. Resume continues with no duplicates.
10. **Delete account**
    - [ ] Go to More → Settings → Your data → Delete my account.
    - [ ] "Delete forever" stays disabled until DELETE is typed. Cancel clears the field.
    - [ ] Confirming returns to Welcome.
    - [ ] Kill and relaunch the app. It's still signed out and no imported files remain.
11. **Device-only extras**
    - [ ] Change the system dark mode and check the theme follows it.
    - [ ] Rotate the phone and use split screen. The layout holds up.
    - [ ] Set font scale to 200% and check that nothing is clipped.
    - [ ] Kill the app mid-chat and relaunch. The state persists.
