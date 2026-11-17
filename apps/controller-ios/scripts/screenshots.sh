#!/bin/bash
# Screenshots von Beispielzuständen der Controller-App im iOS-Simulator (CHAOS-127).
#
# Baut die App für den Simulator, startet sie je Zustand mit `-sample <name>` (siehe
# `ControllerState.samples` in `Sources/UI/RootView.swift`) und speichert ein JPEG je Zustand.
# Ohne Server, ohne Signatur; läuft lokal auf dem Mac und in CI („Native Apps“).
#
#   scripts/screenshots.sh                         minigameConsolation nach build/screenshots
#   scripts/screenshots.sh minigameResults lobby   diese Zustände
#
# Umgebung: OUT_DIR (Zielordner), SIMULATOR_UDID (sonst eigener Simulator
# „ChaosController Screens“, iPhone 17 Pro), PREFIX (Dateiname, Standard `chaos127-iphone-`).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
DERIVED="$ROOT/build/screens"
OUT_DIR=${OUT_DIR:-$ROOT/build/screenshots}
PREFIX=${PREFIX:-chaos127-iphone-}
BUNDLE_ID=dev.rubeen.chaosparty.controller
SAMPLES=("$@")
[[ ${#SAMPLES[@]} -gt 0 ]] || SAMPLES=(minigameConsolation)

DEVICE=${SIMULATOR_UDID:-}
if [[ -z "$DEVICE" ]]; then
    DEVICE=$(xcrun simctl list devices available | sed -n 's/.*ChaosController Screens (\([0-9A-F-]*\)).*/\1/p' | head -1)
    [[ -n "$DEVICE" ]] || DEVICE=$(xcrun simctl create "ChaosController Screens" "iPhone 17 Pro")
fi
WAS_BOOTED=0
xcrun simctl list devices | grep -q "$DEVICE) (Booted)" && WAS_BOOTED=1
xcrun simctl bootstatus "$DEVICE" -b > /dev/null
cleanup() {
    xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" 2> /dev/null || true
    [[ $WAS_BOOTED == 1 ]] || xcrun simctl shutdown "$DEVICE" 2> /dev/null || true
}
trap cleanup EXIT

xcodegen generate --quiet
xcodebuild build -project ChaosController.xcodeproj -scheme ChaosController \
    -destination "id=$DEVICE" -derivedDataPath "$DERIVED" -quiet
xcrun simctl install "$DEVICE" "$DERIVED/Build/Products/Debug-iphonesimulator/ChaosController.app"

# Ruhige Statusleiste wie auf Store-Bildern.
xcrun simctl status_bar "$DEVICE" override --time 9:41 --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3 2> /dev/null || true

mkdir -p "$OUT_DIR"
for sample in "${SAMPLES[@]}"; do
    xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" 2> /dev/null || true
    xcrun simctl launch "$DEVICE" "$BUNDLE_ID" -sample "$sample" > /dev/null
    sleep 4 # Start, Einblendungen und Glas-Effekte ausrollen lassen
    png="$OUT_DIR/$PREFIX$sample.png"
    xcrun simctl io "$DEVICE" screenshot --type=png "$png" > /dev/null
    # Wie die übrigen Belege: JPEG, 1000 px hoch (`docs/screenshots/chaos115-*.jpg`).
    sips -s format jpeg -s formatOptions 80 --resampleHeight 1000 "$png" \
        --out "${png%.png}.jpg" > /dev/null
    rm "$png"
    echo "${png%.png}.jpg"
done
