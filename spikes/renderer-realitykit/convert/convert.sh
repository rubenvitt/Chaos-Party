#!/usr/bin/env bash
# CHAOS-78 → CHAOS-140: Testszene für den RealityKit-Spike. Erzeugt seit CHAOS-140 der
# Build-Schritt `scripts/build-apple-assets.mjs` (Brett aus dem Web-Host, Figuren direkt aus den
# bpy-Skripten, Prüfung mit usd-core und auf dem Mac mit RealityKit), hier mit dem Spike-Ordner
# als Ziel. Umgebung: RK_CHECK=0 lässt die Prüfung mit RealityKit weg.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
node "$root/scripts/build-apple-assets.mjs" --out="$root/spikes/renderer-realitykit/assets/export" "$@"
