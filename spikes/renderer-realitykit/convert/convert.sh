#!/usr/bin/env bash
# CHAOS-78: Testszene des Bevy-Spikes (GLB) → USDZ für RealityKit.
# Voraussetzung: node scripts/spike-export-board.mjs (erzeugt spikes/renderer-bevy/assets/export/).
# bpy 5.3.0 braucht Python 3.13; das System-python3 ist neuer, daher uv.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
src="$root/spikes/renderer-bevy/assets/export"
out="$root/spikes/renderer-realitykit/assets/export"
python="${BLENDER_PYTHON:-$root/.venv-blender/bin/python}"

if [ ! -x "$python" ]; then
  uv venv --python 3.13 "$root/.venv-blender"
  VIRTUAL_ENV="$root/.venv-blender" uv pip install -r "$root/packages/assets/blender/requirements.txt"
fi

mkdir -p "$out/figuren"
"$python" "$here/glb_to_usdz.py" "$src/brett.glb" "$out/brett.usdz" | grep '^USDZ'
for c in robot cactus raccoon sock; do
  "$python" "$here/glb_to_usdz.py" "$src/figuren/$c.glb" "$out/figuren/$c.usdz" --anim=idle | grep '^USDZ'
done
cp "$src/brett.szene.json" "$src/brett.instanzen.json" "$out/"

for f in "$out/brett.usdz" "$out"/figuren/*.usdz; do xcrun usdchecker "$f" | tail -1; done
swift "$here/check.swift" "$out"
