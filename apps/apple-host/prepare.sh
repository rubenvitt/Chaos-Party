#!/bin/sh
# Legt payload/ für die App an (nicht eingecheckt): JS-Kern (dist/chaos-host.js), Havok-Wasm und den
# Controller-Build, den die App per HTTP ausliefert. Danach `xcodegen generate` und bauen (README).
#   SKIP_BUILD=1  nimmt vorhandene Builds (apps/apple-host/dist, apps/controller/dist), z. B. nach `pnpm build`.
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
echo "payload: $(du -sh "$out" | cut -f1) (JS-Kern, Havok, Controller)"
