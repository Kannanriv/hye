<#
.SYNOPSIS
  Run hye's Maestro journeys on a USB-connected Android phone running Expo Go.

.DESCRIPTION
  1. Checks adb and that exactly one authorized device is connected (or -Serial).
  2. Checks Expo Go is installed.
  3. adb reverse tcp:<Port> so the phone reaches Metro on this laptop.
  4. Warns if Metro isn't answering on http://127.0.0.1:<Port>/status.
  5. Pushes the WhatsApp fixture to /sdcard/Download/.
  6. Checks Java 17+ and the maestro CLI (prints install steps if missing).
  7. Runs the suite; results go to e2e/maestro/artifacts/<timestamp>/.

.EXAMPLE
  ./e2e/maestro/run.ps1
  ./e2e/maestro/run.ps1 -Flow 02_chat
  ./e2e/maestro/run.ps1 -UserName "Kannan" -Serial 3B021JEHN12345
#>
[CmdletBinding()]
param(
  [string]$Flow = '',                 # e.g. 02_chat (file name without .yaml); empty = whole suite
  [string]$Serial = $env:ANDROID_SERIAL,
  [int]$Port = 8082,
  [string]$UserName = 'Maestro Tester',
  [string]$Format = 'JUNIT',          # JUNIT | HTML | NOOP
  [switch]$SkipMetroCheck
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$fixture = Join-Path $repo 'e2e\fixtures\WhatsApp Chat with Priya.txt'

function Fail([string]$msg) { Write-Host "`n[x] $msg" -ForegroundColor Red; exit 1 }
function Ok([string]$msg) { Write-Host "[ok] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

# ---------- adb ----------
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $sdkAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
  if (Test-Path $sdkAdb) { $adb = $sdkAdb } else { Fail "adb not found. Install Android SDK platform-tools and add them to PATH." }
}

$lines = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\S' }
$devices = @($lines | ForEach-Object { $p = $_ -split '\s+'; [pscustomobject]@{ Serial = $p[0]; State = $p[1] } })
if ($devices.Count -eq 0) {
  Fail @"
No Android device found.
  - Use a data-capable USB cable and unlock the phone.
  - Set USB mode to 'File transfer'.
  - Developer options > USB debugging: ON.
  - Is the phone on the USB bus at all?  Get-PnpDevice -PresentOnly | ? InstanceId -match 'VID_18D1'
"@
}
if ($Serial) { $devices = @($devices | Where-Object Serial -eq $Serial) ; if (-not $devices) { Fail "Device $Serial not connected." } }
$unauth = @($devices | Where-Object State -eq 'unauthorized')
if ($unauth) { Fail "Device $($unauth[0].Serial) is 'unauthorized': unlock the phone and accept 'Allow USB debugging?' (tick 'Always allow'), then re-run." }
$offline = @($devices | Where-Object State -eq 'offline')
if ($offline) { Fail "Device $($offline[0].Serial) is 'offline': run 'adb kill-server; adb start-server' and replug the cable." }
$ready = @($devices | Where-Object State -eq 'device')
if ($ready.Count -gt 1) { Fail "More than one device connected ($($ready.Serial -join ', ')). Pass -Serial <serial> or set ANDROID_SERIAL." }
$Serial = $ready[0].Serial
Ok "Device $Serial connected and authorized"

# ---------- Expo Go ----------
$pkg = (& $adb -s $Serial shell pm list packages host.exp.exponent) -join ''
if ($pkg -notmatch 'host\.exp\.exponent') {
  Fail @"
Expo Go is not installed on the phone. Install it from the Play Store:
  adb -s $Serial shell am start -a android.intent.action.VIEW -d "market://details?id=host.exp.exponent"
Use the Expo Go version that supports this project's Expo SDK (58).
"@
}
Ok "Expo Go installed"

# ---------- adb reverse + Metro ----------
& $adb -s $Serial reverse "tcp:$Port" "tcp:$Port" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "adb reverse tcp:$Port failed." }
Ok "adb reverse tcp:$Port -> laptop"

if (-not $SkipMetroCheck) {
  try {
    $status = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$Port/status").Content
    if ($status -match 'packager-status:running') { Ok "Metro is running on port $Port" }
    else { Warn "Something answered on port $Port but it isn't Metro ('$status')." }
  } catch {
    Warn "Metro isn't answering on port $Port. In another terminal run:  npx expo start --port $Port   (or: npm run phone)"
  }
}

# ---------- fixture ----------
if (Test-Path -LiteralPath $fixture) {
  & $adb -s $Serial push "$fixture" "/sdcard/Download/" | Out-Null
  if ($LASTEXITCODE -eq 0) { Ok "Pushed fixture to /sdcard/Download/" } else { Warn "Could not push the fixture; 05_import may fail." }
} else {
  Warn "Fixture not found at $fixture; 05_import will fail."
}

# ---------- Java + Maestro ----------
$installHelp = @"
Maestro CLI is required (https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli).
Windows install:
  1. Install Java 17 or newer (e.g. Temurin: https://adoptium.net/temurin/releases), and set JAVA_HOME to it.
       winget install EclipseAdoptium.Temurin.17.JDK
     Check with:  java -version
  2. Download https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip
  3. Extract it to a stable folder, e.g. C:\maestro (so C:\maestro\bin\maestro.bat exists).
  4. Add the bin folder to PATH, then open a new terminal:
       setx PATH "%PATH%;C:\maestro\bin"
  5. Verify:  maestro --help
"@

$java = (Get-Command java -ErrorAction SilentlyContinue).Source
if (-not $java -and $env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { $java = Join-Path $env:JAVA_HOME 'bin\java.exe' }
if (-not $java) { Fail "Java not found.`n$installHelp" }
$jv = (cmd /c "`"$java`" -version 2>&1") -join ' '
if ($jv -match 'version "(\d+)(\.(\d+))?') {
  $major = [int]$Matches[1]; if ($major -eq 1) { $major = [int]$Matches[3] }
  if ($major -lt 17) { Fail "Java $major found; Maestro needs Java 17+.`n$installHelp" }
  Ok "Java $major"
} else { Warn "Couldn't read the Java version ($jv); continuing." }

$maestro = (Get-Command maestro -ErrorAction SilentlyContinue).Source
if (-not $maestro -and (Test-Path 'C:\maestro\bin\maestro.bat')) { $maestro = 'C:\maestro\bin\maestro.bat' }
if (-not $maestro) { Fail "maestro not found on PATH.`n$installHelp" }
Ok "Maestro: $maestro"

# ---------- run ----------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $here "artifacts\$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$ext = @{ JUNIT = 'xml'; HTML = 'html'; NOOP = 'txt' }[$Format.ToUpper()]
$target = if ($Flow) { Join-Path $here (($Flow -replace '\.yaml$', '') + '.yaml') } else { $here }
if ($Flow -and -not (Test-Path $target)) { Fail "Flow not found: $target" }

$maestroArgs = @(
  '--device', $Serial, 'test',
  '--config', (Join-Path $here 'config.yaml'),
  '--test-output-dir', $out,
  '--debug-output', $out,
  '--format', $Format,
  '--output', (Join-Path $out "report.$ext"),
  '-e', "USER_NAME=$UserName",
  '-e', "EXPO_URL=exp://127.0.0.1:$Port",
  $target
)
Write-Host "`n> maestro $($maestroArgs -join ' ')`n"
& $maestro @maestroArgs
$code = $LASTEXITCODE
Write-Host "`nResults: $out" -ForegroundColor Cyan
if ($code -eq 0) { Ok 'All flows passed' } else { Write-Host "[x] Maestro exited with $code" -ForegroundColor Red }
exit $code
