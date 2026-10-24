# hye on-device E2E (Maestro)

These are end-to-end journeys that run on a real Android phone (a Pixel 8a) connected over USB. The app runs inside **Expo Go**, so the flows target the package `host.exp.exponent` and open the project with the deep link `exp://127.0.0.1:8082`. Metro runs on the laptop, and `adb reverse` forwards port 8082 to the phone.

| Flow | What it covers |
| --- | --- |
| `00_launch.yaml` | Expo Go opens hye from Metro; shows Welcome or Inbox |
| `01_signup.yaml` | Required-field and format errors, then account creation lands on the seeded Inbox. If an account already exists, it deletes it in the app first. |
| `02_chat.yaml` | Ava Chen chat: send a message, see the typing indicator and simulated reply, see delivered/read ticks, then react, reply, edit and delete for everyone |
| `03_group.yaml` | New conversation → Group → name → pick 2 people → create, then open details to rename the group and make Rahul an admin |
| `04_search_archive.yaml` | Global search (results, scope chip, open a hit, no results), archive via long-press, find it in the Archive tab, then move it back |
| `05_import.yaml` | Import → WhatsApp → Choose export file → Android picker → Downloads → review → "Which one is you?" → import → report counts → the opened conversation shows the "Imported from a WhatsApp export" banner |
| `06_privacy_delete.yaml` | Turn off read receipts (logged in Security activity), export data and cancel the share sheet, then delete the account (only after typing DELETE), which returns to Welcome |

`subflows/` holds reusable steps that the journeys call with `runFlow`: `launch`, `ensure_signed_in`, `create_account`, `open_more_tab` and `delete_account`. Each journey can run by itself because it starts with `ensure_signed_in`. `config.yaml` runs them in the order above, and `06` runs last because it deletes the account.

## Prerequisites

1. **Android phone** with Developer options → **USB debugging** turned on, connected by a cable that carries data. The USB mode should be **File transfer**.
2. **adb** (Android SDK platform-tools) on `PATH`. The scripts also look in `%LOCALAPPDATA%\Android\Sdk\platform-tools`.
3. **Expo Go** installed on the phone, in a version that supports Expo SDK 58.
4. **Java 17 or newer**, with `JAVA_HOME` pointing at it.
5. **Maestro CLI** (install steps below).
6. **Metro on port 8082** running from the repo root:
   ```bash
   npx expo start --port 8082     # or: npm run phone  (adb reverse + start)
   ```
7. The fixture `e2e/fixtures/WhatsApp Chat with Priya.txt`. The run scripts push it to `/sdcard/Download/`.

## Install Maestro

These steps follow the official docs: https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli

**Windows**
1. Install a JDK, version 17 or newer. For example, run `winget install EclipseAdoptium.Temurin.17.JDK`, or download one from https://adoptium.net/temurin/releases. Set `JAVA_HOME` and check with `java -version`.
2. Download https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip.
3. Extract it to a stable folder such as `C:\maestro`.
4. Add the bin folder to `PATH` with `setx PATH "%PATH%;C:\maestro\bin"`, then open a new terminal.
5. Check that it works with `maestro --help`.

**macOS / Linux:** run `curl -fsSL "https://get.maestro.mobile.dev" | bash`.

## Run

From the repo root, with Metro running:

```powershell
./e2e/maestro/run.ps1                       # whole suite
./e2e/maestro/run.ps1 -Flow 02_chat         # one journey
./e2e/maestro/run.ps1 -UserName "Kannan" -Serial <adb-serial> -Format HTML
```

```bash
e2e/maestro/run.sh                          # Git Bash / macOS / Linux
e2e/maestro/run.sh 05_import
USER_NAME="Kannan" ANDROID_SERIAL=<serial> FORMAT=HTML e2e/maestro/run.sh
```

The scripts run these checks before the tests:
- an authorized adb device (exactly one, or the one you pass)
- Expo Go installed
- `adb reverse tcp:8082 tcp:8082`
- Metro answering on `/status`
- the fixture pushed to the phone
- Java 17+ and `maestro`

They then run:

```
maestro --device <serial> test --config e2e/maestro/config.yaml \
  --test-output-dir e2e/maestro/artifacts/<timestamp> --format JUNIT --output .../report.xml \
  -e USER_NAME=... -e EXPO_URL=exp://127.0.0.1:8082 e2e/maestro
```

Results go to `e2e/maestro/artifacts/<timestamp>/`, which is gitignored. Each flow gets its own folder. Screenshots from `takeScreenshot` are in `<flow>/takeScreenshot/`. A failing step adds `screenshots/` and `screen-hierarchy/`, and device logs are in `logs/device-logcat.txt`.

### Parameters (`-e KEY=value`)

| Key | Default | Used by |
| --- | --- | --- |
| `USER_NAME` | `Maestro Tester` | sign-up name in every flow |
| `USER_HANDLE` / `USER_EMAIL` | `maestro_tester` / `maestro@example.com` | sign-up |
| `EXPO_URL` | `exp://127.0.0.1:8082` | launch |
| `ME_IN_EXPORT` | `Kannan` | 05: the "Which one is you?" chip |
| `GROUP_NAME` / `GROUP_RENAMED` | `Maestro crew` / `Maestro crew renamed` | 03 |

If `USER_NAME` matches a participant in the export (for example `Kannan`), hye pre-selects that chip. Flow 05 then skips tapping it so it doesn't get deselected.

## How elements are found

Every interactive control in hye sets `accessibilityLabel`, which becomes the Android `content-desc`. Maestro's `text` selector matches visible text and `content-desc`, so the flows use plain text selectors such as `tapOn: "Send"`, `tapOn: "Conversation details"` and `tapOn: "React with 👍"`. These rules apply:
- **Selectors are regular expressions that must match the whole string.** `?`, `.`, `(` and similar characters need escaping. Escaped regexes are written in single-quoted YAML, for example `'Booking for 7pm\?'`. Curly quotes in app text are matched with `.`.
- **A text field and its label share the same words** (for example "Your name"). An empty field is targeted by its placeholder. A filled field is targeted with `index: 1`, which is the input. `point: "95%,50%"` puts the cursor at the end before `eraseText`.
- **`inputText` is ASCII-only on Android**, so typed messages contain no emoji.
- **Demo replies are random.** Ava doesn't reply about 25% of the time, so the waits for the typing indicator and the reply are `optional`. Delivered/read ticks always appear and are asserted.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `adb devices` shows `unauthorized` | Unlock the phone and accept **Allow USB debugging?** (tick *Always allow*). If no prompt appears, go to Developer options → *Revoke USB debugging authorizations* and replug. |
| `adb devices` shows `offline` | Run `adb kill-server; adb start-server` and replug. |
| No device at all | Use a data cable (not charge-only), unlock the phone, set USB mode to *File transfer*, and turn on USB debugging. On Windows, `Get-PnpDevice -PresentOnly \| ? InstanceId -match 'VID_18D1'` shows whether the phone is on the USB bus. |
| More than one device | Pass `-Serial <serial>` to `run.ps1`, or set `ANDROID_SERIAL` for `run.sh`. |
| Expo Go not installed | Run `adb shell am start -a android.intent.action.VIEW -d "market://details?id=host.exp.exponent"` and install it from the Play Store. Use the Expo Go version that supports SDK 58. |
| `launch` times out on "hye\|Inbox" | Metro isn't reachable. Check that `npx expo start --port 8082` is running and that `curl http://127.0.0.1:8082/status` prints `packager-status:running`. Re-run `adb reverse tcp:8082 tcp:8082` after every replug, because the reverse is lost when the device disconnects. Check `adb reverse --list`. |
| Port 8082 already in use | Start Metro on another port and pass `-Port 8083` (ps1) or `PORT=8083` (sh). The scripts reverse that port and set `EXPO_URL`. |
| Expo Go shows a red error or "Something went wrong" | Look at the Metro terminal or `adb logcat -d -s ReactNativeJS:V`. Reload with `adb shell input keyevent 82` → Reload. |
| Expo Go's "developer menu" intro sheet | The `launch` subflow dismisses it with Continue/Got it. If your Expo Go version words it differently, dismiss it once by hand. It appears only once. |
| Android asks which app should open `exp://` | `launch` taps *Expo Go* → *Just once*. Uninstalling other Expo dev clients avoids the dialog. |
| 05 can't find the file in the picker | Check the file exists with `adb shell ls /sdcard/Download/`. The picker opens wherever it was last used. The flow tries *Show roots → Downloads*, then scrolls, then uses the picker's search. If your Android build labels these differently, open Downloads in the picker once by hand. Afterwards it reopens there. |
| 05 imports 0 items | The chat was already imported, so duplicates are skipped. This is expected on re-runs. To start clean, delete it with Settings → Your data → Delete all imported history. |
| 06 leaves the "Your data" page after export | Sharing wasn't available, so the app shows "Export created…" instead of a share sheet. The flow handles this. If your share sheet needs two Backs, add a second `back`. |
| Stuck in a weird app state | Run `adb shell pm clear host.exp.exponent`. This wipes hye's data, and also Expo Go's own data such as the signed-in Expo account and recent projects. |
| `Maestro driver` install fails or `Failed to active device` | See https://docs.maestro.dev/extra-materials/troubleshooting/known-issues. Unlock the phone and keep the screen on during the run (Developer options → *Stay awake*). |
