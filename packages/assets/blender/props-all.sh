#!/usr/bin/env bash
# Baut alle Requisiten-GLBs der Minispiele (CHAOS-88) nach packages/assets/models/props/ und auf
# Wunsch den Kontaktbogen (docs/screenshots/chaos88-requisiten.jpg). Einmalig vorher:
#   python3 -m venv .venv-blender && .venv-blender/bin/pip install -r packages/assets/blender/requirements.txt
# Danach: Höhen/Budgets im Manifest prüfen mit pnpm check:assets
#   props-all.sh             # alle GLBs
#   props-all.sh --vorschau  # zusätzlich den Kontaktbogen rendern (Cycles, ≈ 30 s)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
python="${BLENDER_PYTHON:-$root/.venv-blender/bin/python}"
"$python" "$here/props.py" all "$root/packages/assets/models/props" | grep -E '^Requisit'
if [[ "${1:-}" == "--vorschau" ]]; then
  "$python" "$here/props.py" --vorschau "$root/docs/screenshots/chaos88-requisiten.jpg" | grep -E '^Kontaktbogen'
fi
