#!/usr/bin/env bash
# Baut alle Figuren-GLBs mit Blender als Python-Modul (CHAOS-58) nach
# packages/assets/models/characters/. Einmalig vorher:
#   python3 -m venv .venv-blender && .venv-blender/bin/pip install -r packages/assets/blender/requirements.txt
# Danach: pnpm check:assets
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
python="${BLENDER_PYTHON:-$root/.venv-blender/bin/python}"
for id in robot cactus raccoon sock; do
  "$python" "$here/build.py" "$id" "$root/packages/assets/models/characters/$id.glb" | grep -E '^Figur'
done
