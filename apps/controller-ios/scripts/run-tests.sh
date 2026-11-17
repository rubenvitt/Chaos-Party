#!/bin/bash
# Alle Swift-Tests der Controller-App im iOS-Simulator (CHAOS-115).
#
# `xcodebuild test` hängt mit dem iOS-27-Simulator auf diesem Mac (README.md). Darum:
# xcodegen → `xcodebuild build-for-testing` → Test-Bundle ohne App-Host per `simctl spawn … xctest`.
# Für die Integrationstests startet das Skript den echten Server auf einem freien Port.
#
#   scripts/run-tests.sh               alle Suites, Server wird gestartet
#   scripts/run-tests.sh --no-server   ohne Integrationstests
#
# Umgebung: SIMULATOR_UDID (sonst eigener Simulator „ChaosController Tests“),
# CHAOS_SERVER_URL + CHAOS_JOIN_CODE (laufenden Server nutzen statt einen zu starten).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
REPO=$(cd ../.. && pwd)
DERIVED="$ROOT/build/tests"
PRODUCTS="$DERIVED/Build/Products/Debug-iphonesimulator"
XCTEST="$(xcrun --sdk iphonesimulator --show-sdk-platform-path)/Developer/Library/Xcode/Agents/xctest"
START_SERVER=1
[[ "${1:-}" == "--no-server" ]] && START_SERVER=0

# Eigener Simulator, damit parallele Läufe (andere Agenten, Xcode) sich nicht in die Quere kommen.
DEVICE=${SIMULATOR_UDID:-}
if [[ -z "$DEVICE" ]]; then
    DEVICE=$(xcrun simctl list devices available | sed -n 's/.*ChaosController Tests (\([0-9A-F-]*\)).*/\1/p' | head -1)
    [[ -n "$DEVICE" ]] || DEVICE=$(xcrun simctl create "ChaosController Tests" "iPhone 17 Pro")
fi
WAS_BOOTED=0
xcrun simctl list devices | grep -q "$DEVICE) (Booted)" && WAS_BOOTED=1
xcrun simctl bootstatus "$DEVICE" -b > /dev/null

SERVER_PID=""
cleanup() {
    [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2> /dev/null
    [[ $WAS_BOOTED == 1 ]] || xcrun simctl shutdown "$DEVICE" 2> /dev/null
    true
}
trap cleanup EXIT

xcodegen generate --quiet
xcodebuild build-for-testing -project ChaosController.xcodeproj -scheme ChaosController \
    -destination "id=$DEVICE" -derivedDataPath "$DERIVED" -quiet

if [[ -z "${CHAOS_SERVER_URL:-}" && $START_SERVER == 1 ]]; then
    [[ -d "$REPO/node_modules" ]] || { echo "Erst im Repo: pnpm install --frozen-lockfile" >&2; exit 1; }
    PORT=$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
    (cd "$REPO/apps/server" && PORT=$PORT HOST=127.0.0.1 JOIN_CODE=SWIFT1 TERMINAL_QR=0 \
        exec node --import tsx src/main.ts > "$DERIVED/server.log" 2>&1) &
    SERVER_PID=$!
    for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/health" > /dev/null && break; sleep 0.2; done
    curl -sf "http://127.0.0.1:$PORT/health" > /dev/null || { echo "Server startet nicht, siehe $DERIVED/server.log" >&2; exit 1; }
    CHAOS_SERVER_URL="ws://127.0.0.1:$PORT/ws"
    CHAOS_JOIN_CODE=SWIFT1
fi

# `simctl spawn` reicht SIMCTL_CHILD_* ohne Präfix an den Testprozess weiter.
SIMCTL_CHILD_DYLD_FRAMEWORK_PATH="$PRODUCTS" \
    SIMCTL_CHILD_CHAOS_SERVER_URL="${CHAOS_SERVER_URL:-}" \
    SIMCTL_CHILD_CHAOS_JOIN_CODE="${CHAOS_JOIN_CODE:-}" \
    xcrun simctl spawn "$DEVICE" "$XCTEST" "$PRODUCTS/ChaosControllerTests.xctest"
