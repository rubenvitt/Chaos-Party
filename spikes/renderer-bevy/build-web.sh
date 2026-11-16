#!/usr/bin/env bash
# Renderer-Spike (CHAOS-75): WebAssembly-Fassungen bauen (WebGPU und WebGL2) nach web/.
# Voraussetzung: rustup target add wasm32-unknown-unknown
#                cargo install wasm-bindgen-cli --version <Version aus Cargo.lock>
# Danach: python3 -m http.server 8090 -d web  →  http://localhost:8090/?variante=webgpu
set -euo pipefail
cd "$(dirname "$0")"
for variant in webgpu webgl2; do
  cargo build --profile wasm-release --target wasm32-unknown-unknown --features "$variant"
  wasm-bindgen --no-typescript --remove-name-section --target web --out-dir "web/pkg-$variant" \
    --out-name chaos-renderer-spike \
    target/wasm32-unknown-unknown/wasm-release/chaos-renderer-spike.wasm
done
# Bevy lädt im Browser `assets/…` relativ zur Seite.
rm -rf web/assets && mkdir -p web/assets && cp -R assets/export web/assets/export
echo "fertig: python3 -m http.server 8090 -d web"
