#!/bin/sh
# Baut den Swift-Harness (main.swift + app/RenderState.swift) und spielt eine Bot-Partie im JSContext.
#   apps/apple-host/harness/run.sh          bis zum ersten angenommenen Minispiel
#   apps/apple-host/harness/run.sh full     ganze Partie (alle Runden, alle Minispiele der Rotation)
# Vorher `pnpm --filter @chaos-party/apple-host build` (dist/chaos-host.js, dist/HavokPhysics.wasm). Nur macOS.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$here/../build"
xcrun swiftc -O -swift-version 5 -o "$here/../build/harness" "$here/main.swift" "$here/../app/RenderState.swift"
exec "$here/../build/harness" "$@"
