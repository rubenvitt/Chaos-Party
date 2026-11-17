#!/usr/bin/env bash
# Bündelt den JS-Kern für JavaScriptCore (CHAOS-138): dist/chaos-host.js (IIFE, ES2022).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
esbuild="$(ls -d "$root"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | sort -V | tail -1)"
mkdir -p "$here/dist"
"$esbuild" "$here/src/main.ts" \
  --bundle --format=iife --target=es2022 --platform=browser \
  --tsconfig="$here/tsconfig.json" \
  --alias:node:crypto="$here/src/nodeCrypto.ts" \
  --define:import.meta.url=undefined \
  --legal-comments=none --minify-syntax \
  --outfile="$here/dist/chaos-host.js" "$@"
cp "$root/packages/minigame-sdk/node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm" "$here/dist/"
ls -l "$here/dist"
