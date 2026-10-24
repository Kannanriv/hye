#!/usr/bin/env bash
# Run hye's Maestro journeys on a USB-connected Android phone running Expo Go.
# Works in Git Bash (Windows), macOS and Linux.
#
#   e2e/maestro/run.sh                 # whole suite
#   e2e/maestro/run.sh 02_chat         # one flow
#   USER_NAME="Kannan" ANDROID_SERIAL=<serial> PORT=8082 FORMAT=HTML e2e/maestro/run.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
FIXTURE="$REPO/e2e/fixtures/WhatsApp Chat with Priya.txt"
FLOW="${1:-}"
PORT="${PORT:-8082}"
USER_NAME="${USER_NAME:-Maestro Tester}"
FORMAT="${FORMAT:-JUNIT}"           # JUNIT | HTML | NOOP
SERIAL="${ANDROID_SERIAL:-}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
grn() { printf '\033[32m[ok] %s\033[0m\n' "$*"; }
ylw() { printf '\033[33m[!] %s\033[0m\n' "$*"; }
fail() { red "[x] $*"; exit 1; }

# ---------- adb ----------
ADB="$(command -v adb || true)"
if [ -z "$ADB" ] && [ -n "${LOCALAPPDATA:-}" ] && [ -x "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" ]; then
  ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
fi
[ -n "$ADB" ] || fail "adb not found. Install Android SDK platform-tools and add them to PATH."

DEVICES="$("$ADB" devices | tail -n +2 | tr -d '\r' | awk 'NF>=2 {print $1" "$2}')"
[ -n "$DEVICES" ] || fail "No Android device found. Use a data-capable USB cable, unlock the phone, set USB mode to 'File transfer', and enable Developer options > USB debugging."
if [ -n "$SERIAL" ]; then
  DEVICES="$(printf '%s\n' "$DEVICES" | awk -v s="$SERIAL" '$1==s')"
  [ -n "$DEVICES" ] || fail "Device $SERIAL not connected."
fi
if printf '%s\n' "$DEVICES" | grep -q ' unauthorized$'; then
  fail "Device is 'unauthorized': unlock the phone and accept 'Allow USB debugging?' (tick 'Always allow'), then re-run."
fi
if printf '%s\n' "$DEVICES" | grep -q ' offline$'; then
  fail "Device is 'offline': run 'adb kill-server && adb start-server' and replug the cable."
fi
READY="$(printf '%s\n' "$DEVICES" | awk '$2=="device" {print $1}')"
[ -n "$READY" ] || fail "No authorized device (states: $DEVICES)."
[ "$(printf '%s\n' "$READY" | wc -l | tr -d ' ')" -eq 1 ] || fail "More than one device connected ($(echo $READY)). Set ANDROID_SERIAL=<serial>."
SERIAL="$READY"
grn "Device $SERIAL connected and authorized"

# ---------- Expo Go ----------
if ! "$ADB" -s "$SERIAL" shell pm list packages host.exp.exponent | grep -q 'host.exp.exponent'; then
  fail "Expo Go is not installed. Install it from the Play Store:
  $ADB -s $SERIAL shell am start -a android.intent.action.VIEW -d 'market://details?id=host.exp.exponent'"
fi
grn "Expo Go installed"

# ---------- adb reverse + Metro ----------
"$ADB" -s "$SERIAL" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null || fail "adb reverse tcp:$PORT failed."
grn "adb reverse tcp:$PORT -> laptop"
if command -v curl >/dev/null; then
  if curl -fsS -m 5 "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q 'packager-status:running'; then
    grn "Metro is running on port $PORT"
  else
    ylw "Metro isn't answering on port $PORT. In another terminal run: npx expo start --port $PORT  (or: npm run phone)"
  fi
fi

# ---------- fixture ----------
if [ -f "$FIXTURE" ]; then
  # MSYS_NO_PATHCONV stops Git Bash rewriting /sdcard/... into a Windows path.
  if MSYS_NO_PATHCONV=1 "$ADB" -s "$SERIAL" push "$FIXTURE" /sdcard/Download/ >/dev/null; then
    grn "Pushed fixture to /sdcard/Download/"
  else
    ylw "Could not push the fixture; 05_import may fail."
  fi
else
  ylw "Fixture not found at $FIXTURE; 05_import will fail."
fi

# ---------- Java + Maestro ----------
INSTALL_HELP="Maestro CLI is required (https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli).
  Requires Java 17+ (e.g. Temurin: https://adoptium.net/temurin/releases) with JAVA_HOME set; check with: java -version
  macOS/Linux:  curl -fsSL \"https://get.maestro.mobile.dev\" | bash
  Windows:      1) download https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip
                2) extract to C:\\maestro   3) setx PATH \"%PATH%;C:\\maestro\\bin\"   4) open a new terminal
  Verify:       maestro --help"

JAVA="$(command -v java || true)"
[ -z "$JAVA" ] && [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] && JAVA="$JAVA_HOME/bin/java"
[ -n "$JAVA" ] || fail "Java not found.
$INSTALL_HELP"
JV="$("$JAVA" -version 2>&1 | head -1)"
MAJOR="$(printf '%s' "$JV" | sed -nE 's/.*version "([0-9]+)(\.([0-9]+))?.*/\1 \3/p')"
if [ -n "$MAJOR" ]; then
  read -r M1 M2 <<<"$MAJOR"
  [ "$M1" = "1" ] && M1="$M2"
  [ "$M1" -ge 17 ] 2>/dev/null || fail "Java $M1 found; Maestro needs Java 17+.
$INSTALL_HELP"
  grn "Java $M1"
else
  ylw "Couldn't read the Java version ($JV); continuing."
fi

MAESTRO="$(command -v maestro || true)"
[ -z "$MAESTRO" ] && [ -x "$HOME/.maestro/bin/maestro" ] && MAESTRO="$HOME/.maestro/bin/maestro"
[ -z "$MAESTRO" ] && [ -f "/c/maestro/bin/maestro.bat" ] && MAESTRO="/c/maestro/bin/maestro.bat"
[ -n "$MAESTRO" ] || fail "maestro not found on PATH.
$INSTALL_HELP"
grn "Maestro: $MAESTRO"

# ---------- run ----------
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$HERE/artifacts/$STAMP"
mkdir -p "$OUT"
case "$(printf '%s' "$FORMAT" | tr '[:lower:]' '[:upper:]')" in HTML) EXT=html ;; NOOP) EXT=txt ;; *) EXT=xml ;; esac
TARGET="$HERE"
if [ -n "$FLOW" ]; then
  TARGET="$HERE/${FLOW%.yaml}.yaml"
  [ -f "$TARGET" ] || fail "Flow not found: $TARGET"
fi

set -x
"$MAESTRO" --device "$SERIAL" test \
  --config "$HERE/config.yaml" \
  --test-output-dir "$OUT" \
  --debug-output "$OUT" \
  --format "$FORMAT" \
  --output "$OUT/report.$EXT" \
  -e "USER_NAME=$USER_NAME" \
  -e "EXPO_URL=exp://127.0.0.1:$PORT" \
  "$TARGET"
CODE=$?
{ set +x; } 2>/dev/null
printf '\nResults: %s\n' "$OUT"
[ "$CODE" -eq 0 ] && grn "All flows passed" || red "[x] Maestro exited with $CODE"
exit "$CODE"
