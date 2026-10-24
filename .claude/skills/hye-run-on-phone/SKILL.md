---
name: hye-run-on-phone
description: Run and test the hye Expo app on the user's USB-connected Android phone (Pixel 8a) with adb and Expo Go. Use when asked to run, test, debug or screenshot the app on the phone/device, or when adb shows no device or "unauthorized".
---

# Run hye on the Android phone

The app runs in **Expo Go** (no custom native build needed — only Expo Go–bundled modules are used).
Over USB we use `adb reverse` so the phone reaches Metro on the laptop's localhost; no Wi-Fi setup needed.

## 1. Check the connection

```bash
adb devices -l
```

| Output | Meaning | Fix |
| --- | --- | --- |
| `<serial>  device ...` | Connected and authorized | Continue |
| `<serial>  unauthorized` | Phone hasn't approved this PC | Unlock phone → accept **Allow USB debugging?** (tick *Always allow*) |
| `<serial>  offline` | Stale connection | `adb kill-server && adb start-server`, replug |
| nothing | No USB data link | Data-capable cable; unlock phone; USB mode **File transfer**; Developer options → **USB debugging** on |

On Windows, `Get-PnpDevice -PresentOnly | ? InstanceId -match 'VID_18D1'` shows whether the phone is on the USB bus at all (Google's vendor id). If it isn't listed, it's the cable/port, not a setting.

## 2. Install Expo Go (once)

```bash
adb shell pm list packages host.exp.exponent   # empty = not installed
adb shell am start -a android.intent.action.VIEW -d "market://details?id=host.exp.exponent"
```

## 3. Start Metro and open the app

Port 8081 is often taken by the web e2e server, so the phone uses 8082:

```bash
npx expo start --port 8082                      # leave running (listens on IPv4 + IPv6)
adb reverse tcp:8082 tcp:8082
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8082"
```

`npm run phone` runs the reverse + start on 8082 in one step.

## 4. Drive and inspect the app from the laptop

```bash
adb exec-out screencap -p > shot.png                      # screenshot (read the PNG to look at it)
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml   # accessibility tree with bounds
adb shell input tap X Y                                   # tap centre of a node's bounds
adb shell input text "hello%sworld"                       # type (%s = space)
adb shell input keyevent KEYCODE_BACK                     # back
adb logcat -d -s ReactNativeJS:V | tail -50               # JS logs / errors
```

Every interactive control in hye sets `accessibilityLabel`, so nodes in `ui.xml` are findable by `content-desc`.

## 5. Push a test export to the phone (for the import journey)

```bash
adb push "e2e/fixtures/WhatsApp Chat with Priya.txt" /sdcard/Download/
```

Then in the app: Inbox → Import → WhatsApp → Choose export file → Downloads.

## Reload / reset

- Reload JS: `adb shell input keyevent 82` (dev menu) → Reload, or press `r` in the Metro terminal.
- Reset app data (signs out, wipes demo): `adb shell pm clear host.exp.exponent`.
