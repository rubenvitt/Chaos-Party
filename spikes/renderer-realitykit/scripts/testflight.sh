#!/usr/bin/env bash
# Archiviert die Apple-TV-App signiert und lädt sie zu TestFlight hoch (CHAOS-119).
# Aufbau wie apps/controller-ios/scripts/testflight.sh (CHAOS-115).
#
# Bis der native Host steht (ADR-019), ist die Apple-TV-App der RealityKit-Spike mit der
# Testszene. Er erscheint als „Chaos Party“ mit der Bundle-ID dev.rubeen.chaosparty.tv; der
# App-Eintrag muss in App Store Connect existieren. Das Projekt selbst signiert nur lokal
# (project.yml); Bundle-ID, Team und Signatur überschreibt dieses Skript auf der Kommandozeile.
#
# Voraussetzung: die Testszene in assets/export/ (README, Abschnitt „Assets“). Ohne sie
# bricht das Skript ab, damit kein leeres Bundle bei TestFlight landet.
#
# Umgebung:
#   ASC_KEY_ID, ASC_ISSUER_ID   Pflicht (CI); lokal mit XCODE_ACCOUNT=1 nicht nötig
#   XCODE_ACCOUNT=1             mit dem in Xcode angemeldeten Account signieren und hochladen
#   ASC_KEY_PATH                Standard ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
#   BUILD_NUMBER                Standard UTC-Zeitstempel JJJJMMTT.HHMM (steigt mit jedem Lauf)
#   UPLOAD=0                    nur archivieren und exportieren (.ipa), nicht hochladen
set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE_ID="dev.rubeen.chaosparty.tv"
TEAM_ID="H95J852PKP"

XCODE_ACCOUNT="${XCODE_ACCOUNT:-0}"
UPLOAD="${UPLOAD:-1}"
if [[ "$XCODE_ACCOUNT" != 1 ]]; then
  : "${ASC_KEY_ID:?ASC_KEY_ID fehlt}"
  : "${ASC_ISSUER_ID:?ASC_ISSUER_ID fehlt}"
  ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [[ -f "$ASC_KEY_PATH" ]] || { echo "API-Key nicht gefunden: $ASC_KEY_PATH" >&2; exit 1; }
fi
# Zwei Zahlen statt einer, damit jede Komponente in 32 Bit passt.
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d.%H%M)}"

missing=0
for f in brett.szene.json brett.instanzen.json brett.usdz \
  figuren/robot.usdz figuren/cactus.usdz figuren/raccoon.usdz figuren/sock.usdz; do
  [[ -s "assets/export/$f" ]] || { echo "Testszene unvollständig: assets/export/$f fehlt" >&2; missing=1; }
done
if [[ "$missing" == 1 ]]; then
  echo "Erzeugen (Repo-Wurzel): node scripts/fetch-lookdev-assets.mjs && node scripts/spike-export-board.mjs && spikes/renderer-realitykit/convert/convert.sh" >&2
  exit 1
fi

OUT="build/testflight"
ARCHIVE="$OUT/ChaosTV.xcarchive"
rm -rf "$OUT"
mkdir -p "$OUT"

AUTH=(-allowProvisioningUpdates)
if [[ "$XCODE_ACCOUNT" != 1 ]]; then
  AUTH+=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

DESTINATION="upload"
[[ "$UPLOAD" == 1 ]] || DESTINATION="export"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DESTINATION</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "Build $BUILD_NUMBER ($BUNDLE_ID)"

xcodegen generate

# Nur für tvOS (Gerät); macOS und iOS bleiben lokal signierte Benchmarks.
xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -configuration Release \
  -destination 'generic/platform=tvOS' -archivePath "$ARCHIVE" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  INFOPLIST_KEY_CFBundleDisplayName="Chaos Party" \
  TARGETED_DEVICE_FAMILY=3 \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}" archive

# Der Export lädt bei destination=upload direkt zu App Store Connect hoch; die Plattform
# (appletvos) kommt aus dem Archiv, ein eigenes `altool --type appletvos` ist nicht nötig.
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  "${AUTH[@]}"

if [[ "$UPLOAD" == 1 ]]; then
  echo "Hochgeladen: Build $BUILD_NUMBER"
else
  echo "Exportiert (nicht hochgeladen): $OUT/export"
fi
