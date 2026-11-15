#!/usr/bin/env bash
# Rendert die Porträts aller Figuren mit Blender als Python-Modul (CHAOS-61) nach
# packages/assets/textures/portraits/ (<id>.webp und <id>-akzent.webp). Einmalig vorher:
#   python3 -m venv .venv-blender && .venv-blender/bin/pip install -r packages/assets/blender/requirements.txt
# Danach: pnpm check:assets
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
python="${BLENDER_PYTHON:-$root/.venv-blender/bin/python}"
for id in robot cactus raccoon sock; do
  "$python" "$here/portrait.py" "$id" "$root/packages/assets/textures/portraits" | grep -E '^Porträt'
done
