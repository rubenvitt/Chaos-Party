#!/usr/bin/env bash
# Archiviert die Controller-App signiert und lädt sie zu TestFlight hoch (CHAOS-115).
# Vorlage: lichtung/apple/scripts/testflight.sh.
#
# Umgebung:
#   ASC_KEY_ID, ASC_ISSUER_ID   Pflicht (CI); lokal mit XCODE_ACCOUNT=1 nicht nötig
#   XCODE_ACCOUNT=1             mit dem in Xcode angemeldeten Account signieren und hochladen
#   ASC_KEY_PATH                Standard ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
#   BUILD_NUMBER                Standard UTC-Zeitstempel JJJJMMTT.HHMM (steigt mit jedem Lauf)
set -euo pipefail

cd "$(dirname "$0")/.."

XCODE_ACCOUNT="${XCODE_ACCOUNT:-0}"
if [[ "$XCODE_ACCOUNT" != 1 ]]; then
  : "${ASC_KEY_ID:?ASC_KEY_ID fehlt}"
  : "${ASC_ISSUER_ID:?ASC_ISSUER_ID fehlt}"
  ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [[ -f "$ASC_KEY_PATH" ]] || { echo "API-Key nicht gefunden: $ASC_KEY_PATH" >&2; exit 1; }
fi
# Zwei Zahlen statt einer, damit jede Komponente in 32 Bit passt.
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d.%H%M)}"

OUT="build/testflight"
ARCHIVE="$OUT/ChaosController.xcarchive"
rm -rf "$OUT"
mkdir -p "$OUT"

AUTH=(-allowProvisioningUpdates)
if [[ "$XCODE_ACCOUNT" != 1 ]]; then
  AUTH+=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "Build $BUILD_NUMBER"

xcodegen generate

xcodebuild -project ChaosController.xcodeproj -scheme ChaosController -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}" archive

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  "${AUTH[@]}"

echo "Hochgeladen: Build $BUILD_NUMBER"
