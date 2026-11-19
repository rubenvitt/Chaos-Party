#!/usr/bin/env bash
# Signierte appcast.xml für Sparkle (CHAOS-156): lädt Sparkles sign_update (Version und SHA-256 fest), signiert
# den Zip, prüft die Signatur gegen den öffentlichen Schlüssel der App (scripts/appcast.mjs), schreibt den Feed
# und signiert ihn selbst (SURequireSignedFeed). Den Release legt .github/workflows/release-macos.yml an.
# Die CI ruft das Skript bei jedem PR mit einem Wegwerf-Schlüssel auf (ci.yml), damit der Weg vor dem
# ersten echten Release geprüft ist.
#
# Umgebung (alles Pflicht):
#   SPARKLE_ED_PRIVATE_KEY  privater Schlüssel (base64, wie `generate_keys -x` ihn exportiert); geht nur per stdin an sign_update
#   SPARKLE_PUBLIC_ED_KEY   öffentlicher Schlüssel (SUPublicEDKey der App)
#   ZIP                     der fertige Zip
#   VERSION, BUILD_NUMBER   Anzeigeversion x.y.z und CFBundleVersion
#   DOWNLOAD_URL            Adresse, unter der der Zip liegt; RELEASE_URL: Release-Seite
#   APPCAST                 Ausgabedatei
#   PRERELEASE=true         Hinweis „Vorabversion“ im Feed
set -euo pipefail

SPARKLE_VERSION=2.10.1 # wie `packages.Sparkle.exactVersion` in project.yml
SPARKLE_SHA256=1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27

for name in SPARKLE_ED_PRIVATE_KEY SPARKLE_PUBLIC_ED_KEY ZIP VERSION BUILD_NUMBER DOWNLOAD_URL RELEASE_URL APPCAST; do
  [[ -n "${!name:-}" ]] || { echo "$name fehlt" >&2; exit 1; }
done
here="$(cd "$(dirname "$0")" && pwd)"

tools="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sparkle-$SPARKLE_VERSION"
sign_update="$tools/bin/sign_update"
if [[ ! -x "$sign_update" ]]; then
  mkdir -p "$tools"
  curl -fsSL "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE_VERSION/Sparkle-$SPARKLE_VERSION.tar.xz" \
    -o "$tools/sparkle.tar.xz"
  echo "$SPARKLE_SHA256  $tools/sparkle.tar.xz" | shasum -a 256 -c -
  tar -xf "$tools/sparkle.tar.xz" -C "$tools" ./bin/sign_update
fi

sign() { printf '%s' "$SPARKLE_ED_PRIVATE_KEY" | "$sign_update" --ed-key-file - "$@"; }

signature=$(sign -p "$ZIP")
flags=()
[[ "${PRERELEASE:-false}" == true ]] && flags+=(--prerelease)
node "$here/appcast.mjs" --zip "$ZIP" --version "$BUILD_NUMBER" --short-version "$VERSION" --url "$DOWNLOAD_URL" \
  --signature "$signature" --public-key "$SPARKLE_PUBLIC_ED_KEY" --release-url "$RELEASE_URL" --out "$APPCAST" \
  ${flags[@]+"${flags[@]}"}
sign "$APPCAST"
sign --verify "$APPCAST"
cat "$APPCAST"
