#!/usr/bin/env bash
# Mac-App des Apple-Hosts als Release (CHAOS-118, ADR-019 §7): Archiv mit Developer-ID-Signatur und
# Hardened Runtime, Selbsttest der fertigen App, Notarisierung mit notarytool (App-Store-Connect-API-Key),
# Heften (staple), Gatekeeper-Prüfung, Zip. Vorlage: lichtung/apple/scripts/release-macos.sh.
# Den GitHub-Release legt der Workflow .github/workflows/release-macos.yml an.
#
# Umgebung:
#   VERSION             CFBundleShortVersionString x.y.z, Standard 0.1.0 (CI: <MARKETING_VERSION>.<Laufnummer>)
#   BUILD_NUMBER        CFBundleVersion, Standard UTC-Zeitstempel JJJJMMTT.HHMM
#   RELEASE_DRY_RUN=1   ohne Zertifikat und API-Key: ad hoc signiert (mit Hardened Runtime), keine Notarisierung.
#                       Prüft Bau, Signatur-Flags und Selbsttest; so läuft es in der CI bei jedem PR.
#   SIGN_IDENTITY       Teil des Namens oder SHA-1 der Identität, Standard „Developer ID Application“
#   SIGN_KEYCHAIN       Schlüsselbund mit der Identität (CI: temporär), sonst die Suchliste
#   ASC_KEY_ID, ASC_ISSUER_ID   API-Key für notarytool (Pflicht ohne RELEASE_DRY_RUN)
#   ASC_KEY_PATH        Standard ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
#   SKIP_PREPARE=1      payload/ nicht neu anlegen (CI: nach ./prepare.sh); SKIP_BUILD=1 gilt für prepare.sh
#   SPARKLE_PUBLIC_ED_KEY  öffentlicher EdDSA-Schlüssel für Sparkle (CHAOS-156; CI: Repository-Variable). Ohne ihn
#                       baut die App ohne Updater; ein echtes Release warnt dann, weil es sich nie selbst aktualisiert.
#   SPARKLE_FEED_URL    Adresse der appcast.xml, Standard aus project.yml
#
# Ergebnis: build/release/Chaos-Party-<VERSION>-macOS.zip (ad hoc: …-macOS-adhoc.zip) mit „Chaos Party.app“,
# daneben die .sha256. Lokal mit Zertifikat im Anmelde-Schlüsselbund:
#   ASC_KEY_ID=… ASC_ISSUER_ID=… apps/apple-host/scripts/release-macos.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${VERSION:-0.1.0}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d.%H%M)}"
DRY_RUN="${RELEASE_DRY_RUN:-0}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "VERSION muss x.y.z sein, nicht „$VERSION“" >&2; exit 1; }

OUT=build/release
ARCHIVE="$OUT/ChaosHost.xcarchive"
APP="$OUT/Chaos Party.app"
if [[ "$DRY_RUN" == 1 ]]; then ZIP="$OUT/Chaos-Party-$VERSION-macOS-adhoc.zip"; else ZIP="$OUT/Chaos-Party-$VERSION-macOS.zip"; fi

# --- Signatur -------------------------------------------------------------------------------
KEYCHAIN=()
[[ -n "${SIGN_KEYCHAIN:-}" ]] && KEYCHAIN=("$SIGN_KEYCHAIN")
if [[ "$DRY_RUN" == 1 ]]; then
  IDENTITY="-"
  TEAM=""
  SIGN_FLAGS="--timestamp=none"
  echo "Probelauf: ad hoc signiert, ohne Notarisierung"
else
  : "${ASC_KEY_ID:?ASC_KEY_ID fehlt}"
  : "${ASC_ISSUER_ID:?ASC_ISSUER_ID fehlt}"
  ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [[ -f "$ASC_KEY_PATH" ]] || { echo "API-Key nicht gefunden: $ASC_KEY_PATH" >&2; exit 1; }
  # Zeile wie: 1) 0123…CDEF "Developer ID Application: Name (TEAMID1234)"
  line=$(security find-identity -v -p codesigning ${KEYCHAIN[@]+"${KEYCHAIN[@]}"} \
    | grep -F "${SIGN_IDENTITY:-Developer ID Application}" | grep -F '"Developer ID Application' | head -n 1 || true)
  [[ -n "$line" ]] || { echo "Keine „Developer ID Application“-Identität gefunden (Zertifikat importiert?)" >&2; exit 1; }
  IDENTITY=$(sed -E 's/^ *[0-9]+\) ([0-9A-F]{40}) .*/\1/' <<<"$line")
  TEAM=$(sed -E 's/.*\(([A-Z0-9]{10})\)"$/\1/' <<<"$line")
  [[ "$IDENTITY" =~ ^[0-9A-F]{40}$ && "$TEAM" =~ ^[A-Z0-9]{10}$ ]] || { echo "Identität nicht lesbar: $line" >&2; exit 1; }
  SIGN_FLAGS="--timestamp"
  [[ -n "${SIGN_KEYCHAIN:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --keychain $SIGN_KEYCHAIN"
  echo "Signiere mit $(sed -E 's/^[^"]*"(.*)"$/\1/' <<<"$line")"
fi

# --- Bauen ----------------------------------------------------------------------------------
[[ "${SKIP_PREPARE:-0}" == 1 ]] || ./prepare.sh
[[ -f payload/chaos-host.js ]] || { echo "payload/ fehlt: erst ./prepare.sh" >&2; exit 1; }
rm -rf "$OUT"
mkdir -p "$OUT"
xcodegen generate

echo "Version $VERSION ($BUILD_NUMBER)"
SPARKLE_SETTINGS=(SPARKLE_PUBLIC_ED_KEY="${SPARKLE_PUBLIC_ED_KEY:-}")
[[ -n "${SPARKLE_FEED_URL:-}" ]] && SPARKLE_SETTINGS+=(SPARKLE_FEED_URL="$SPARKLE_FEED_URL")
if [[ -z "${SPARKLE_PUBLIC_ED_KEY:-}" && "$DRY_RUN" != 1 ]]; then
  echo "WARNUNG: SPARKLE_PUBLIC_ED_KEY fehlt, diese App sucht nie nach Updates (CHAOS-156)" >&2
fi
# Universal (arm64 + x86_64): Release baut ohne ONLY_ACTIVE_ARCH. Keine Basis-Entitlements, damit kein
# get-task-allow in die Signatur kommt (die Notarisierung lehnt es ab).
xcodebuild -project ChaosHost.xcodeproj -scheme ChaosHost -configuration Release \
  -destination 'generic/platform=macOS' -archivePath "$ARCHIVE" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$IDENTITY" DEVELOPMENT_TEAM="$TEAM" \
  ENABLE_HARDENED_RUNTIME=YES CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO OTHER_CODE_SIGN_FLAGS="$SIGN_FLAGS" \
  "${SPARKLE_SETTINGS[@]}" \
  archive

# Unter dem Anzeigenamen ausliefern; der Ordnername gehört nicht zur Signatur.
ditto "$ARCHIVE/Products/Applications/ChaosHost.app" "$APP"

# --- Sparkle neu signieren (CHAOS-156) ---------------------------------------------------------
# Xcode signiert beim Kopieren nur die äußere Hülle von Sparkle.framework; die Helfer darin (XPC-Dienste,
# Autoupdate, Updater.app) müssen für die Notarisierung ebenfalls Developer ID, Hardened Runtime und Zeitstempel
# tragen. Reihenfolge von innen nach außen, wie in Sparkles Doku („Code Signing“); danach die App selbst.
FRAMEWORK="$APP/Contents/Frameworks/Sparkle.framework"
[[ -d "$FRAMEWORK" ]] || { echo "Sparkle.framework fehlt in der App" >&2; exit 1; }
# shellcheck disable=SC2086 # SIGN_FLAGS enthält bewusst mehrere Wörter
sign() { codesign --force --sign "$IDENTITY" --options runtime $SIGN_FLAGS "$@"; }
for xpc in "$FRAMEWORK"/Versions/B/XPCServices/*.xpc; do
  [[ -e "$xpc" ]] && sign --preserve-metadata=entitlements "$xpc"
done
sign "$FRAMEWORK/Versions/B/Autoupdate"
sign "$FRAMEWORK/Versions/B/Updater.app"
sign "$FRAMEWORK"
sign "$APP"

# Sparkle-Schlüssel im fertigen Info.plist: Feed immer, öffentlicher Schlüssel genau der übergebene.
plist="$APP/Contents/Info.plist"
feed=$(plutil -extract SUFeedURL raw -o - "$plist")
key=$(plutil -extract SUPublicEDKey raw -o - "$plist" 2>/dev/null || true)
[[ "$feed" == https://* ]] || { echo "SUFeedURL fehlt oder ist keine https-Adresse: $feed" >&2; exit 1; }
[[ "$key" == "${SPARKLE_PUBLIC_ED_KEY:-}" ]] || { echo "SUPublicEDKey im Info.plist passt nicht: „$key“" >&2; exit 1; }
echo "Sparkle: Feed $feed, öffentlicher Schlüssel ${key:-(keiner, Updater aus)}"

# --- Prüfen ---------------------------------------------------------------------------------
codesign --verify --deep --strict --verbose=2 "$APP"
details=$(codesign --display --verbose=4 "$APP" 2>&1)
grep -q 'flags=.*runtime' <<<"$details" || { echo "$details"; echo "Hardened Runtime fehlt" >&2; exit 1; }
if codesign --display --entitlements - "$APP" 2>/dev/null | grep -q 'get-task-allow'; then
  echo "get-task-allow in den Entitlements: die Notarisierung würde ablehnen" >&2
  exit 1
fi
lipo -archs "$APP/Contents/MacOS/ChaosHost"
# Lädt den JS-Kern, Havok, lauscht, liefert den Controller aus, ein WebSocket-Client tritt bei (App/SelfTest.swift).
"$APP/Contents/MacOS/ChaosHost" --selftest

# --- Notarisieren und heften -----------------------------------------------------------------
if [[ "$DRY_RUN" != 1 ]]; then
  ditto -c -k --keepParent "$APP" "$OUT/notarize.zip"
  xcrun notarytool submit "$OUT/notarize.zip" --key "$ASC_KEY_PATH" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER_ID" \
    --wait --timeout 1h --output-format json > "$OUT/notary.json" || true
  cat "$OUT/notary.json"; echo
  status=$(plutil -extract status raw -o - "$OUT/notary.json" 2>/dev/null || echo "unbekannt")
  submission=$(plutil -extract id raw -o - "$OUT/notary.json" 2>/dev/null || echo "")
  if [[ "$status" != Accepted ]]; then
    echo "Notarisierung: $status" >&2
    [[ -n "$submission" ]] && xcrun notarytool log "$submission" --key "$ASC_KEY_PATH" --key-id "$ASC_KEY_ID" \
      --issuer "$ASC_ISSUER_ID" >&2 || true
    exit 1
  fi
  rm -f "$OUT/notarize.zip"
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  # Wie Gatekeeper auf einem fremden Mac: muss „source=Notarized Developer ID“ melden.
  assessment=$(spctl --assess --type execute --verbose=4 "$APP" 2>&1) || { echo "$assessment" >&2; exit 1; }
  echo "$assessment"
  grep -q 'source=Notarized Developer ID' <<<"$assessment" || { echo "nicht als notarisiert erkannt" >&2; exit 1; }
fi

# --- Zip ------------------------------------------------------------------------------------
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(cd "$OUT" && shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")
echo "Fertig: $ZIP ($(du -h "$ZIP" | cut -f1))"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "zip=apps/apple-host/$ZIP" >> "$GITHUB_OUTPUT"
  echo "feed=$feed" >> "$GITHUB_OUTPUT"
fi
