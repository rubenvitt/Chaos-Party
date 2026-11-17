#!/bin/sh
# CHAOS-138: Legt payload/ für die App an (nicht eingecheckt): Havok-Wasm, Controller-Build und das JS-Bündel
# (jscore/dist/chaos-host.js, sonst app/StubHost.js). Danach `xcodegen generate` und bauen.
# SKIP_CONTROLLER_BUILD=1 nimmt den vorhandenen apps/controller/dist.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
out="$here/payload"
rm -rf "$out"
mkdir -p "$out"
cp "$(ls "$root"/node_modules/.pnpm/@babylonjs+havok@*/node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm | head -1)" "$out/"
[ "${SKIP_CONTROLLER_BUILD:-0}" = 1 ] || pnpm --dir "$root" --filter @chaos-party/controller build
cp -R "$root/apps/controller/dist" "$out/controller"
if [ -f "$here/jscore/dist/chaos-host.js" ]; then
  cp "$here/jscore/dist/chaos-host.js" "$out/chaos-host.js"
  echo "payload: echtes Bündel jscore/dist/chaos-host.js"
else
  cp "$here/app/StubHost.js" "$out/chaos-host.js"
  echo "payload: StubHost.js (jscore/dist/chaos-host.js fehlt)"
fi
