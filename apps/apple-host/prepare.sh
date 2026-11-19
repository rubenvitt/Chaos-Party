#!/bin/sh
# Legt payload/ für die App an (nicht eingecheckt): JS-Kern (dist/chaos-host.js), Havok-Wasm und den
# Controller-Build, den die App per HTTP ausliefert. Danach `xcodegen generate` und bauen (README).
#   SKIP_BUILD=1  nimmt vorhandene Builds (apps/apple-host/dist, apps/controller/dist), z. B. nach `pnpm build`.
#   APPLE_ASSETS=<ordner>  USDZ-Assets (CHAOS-140/142), Standard build/apple-assets aus `pnpm build:apple-assets`.
#   OHNE_ASSETS=1  ohne USDZ weiter (die App zeichnet dann Grundkörper); sonst bricht das Skript ab, wenn sie fehlen.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
out="$here/payload"
if [ "${SKIP_BUILD:-0}" != 1 ]; then
  pnpm --dir "$root" --filter @chaos-party/apple-host --filter @chaos-party/controller build
  pnpm --dir "$root" notices
fi
# LICENSE.txt und THIRD-PARTY-NOTICES.txt schreibt `pnpm notices` (ADR-018); die App gibt GPL-Code weiter.
for file in "$here/dist/chaos-host.js" "$here/dist/HavokPhysics.wasm" "$here/dist/LICENSE.txt" \
  "$here/dist/THIRD-PARTY-NOTICES.txt" "$root/apps/controller/dist/index.html"; do
  [ -f "$file" ] || { echo "prepare.sh: $file fehlt (erst bauen oder ohne SKIP_BUILD aufrufen)" >&2; exit 1; }
done
rm -rf "$out"
mkdir -p "$out"
cp "$here/dist/chaos-host.js" "$here/dist/HavokPhysics.wasm" "$here/dist/LICENSE.txt" "$here/dist/THIRD-PARTY-NOTICES.txt" "$out/"
cp -R "$root/apps/controller/dist" "$out/controller"
# Porträts für die Spielerkarten der Lobby (CHAOS-36/142), aus dem Repo.
mkdir -p "$out/portraits"
cp "$root"/packages/assets/textures/portraits/*.webp "$out/portraits/"
# Brett-Kulisse und Figuren als USDZ (CHAOS-140, docs/apple-assets.md), dazu Herkunft und Lizenzen.
assets="${APPLE_ASSETS:-$root/build/apple-assets}"
if [ -f "$assets/brett.usdz" ] && [ -f "$assets/brett.szene.json" ] && [ -f "$assets/figuren/robot.usdz" ]; then
  mkdir -p "$out/szene/figuren"
  cp "$assets/brett.usdz" "$assets/brett.szene.json" "$assets/brett.instanzen.json" "$assets/herkunft.json" "$out/szene/"
  cp "$assets"/figuren/*.usdz "$assets"/figuren/*.clips.json "$out/szene/figuren/"
elif [ "${OHNE_ASSETS:-0}" = 1 ]; then
  echo "prepare.sh: keine USDZ-Assets in $assets – OHNE_ASSETS=1, die App zeichnet Grundkörper" >&2
else
  echo "prepare.sh: USDZ-Assets fehlen in $assets (erst \`pnpm build:apple-assets\`, oder OHNE_ASSETS=1)" >&2
  exit 1
fi
echo "payload: $(du -sh "$out" | cut -f1) (JS-Kern, Havok, Controller, Porträts$([ -d "$out/szene" ] && echo ", Brett und Figuren"))"
