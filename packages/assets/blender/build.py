"""
Erzeugt Figuren mit Blender als Python-Modul (CHAOS-58; USDZ: CHAOS-140).

    python3 -m venv .venv-blender && .venv-blender/bin/pip install -r packages/assets/blender/requirements.txt
    .venv-blender/bin/python packages/assets/blender/build.py raccoon <ziel.glb>
    .venv-blender/bin/python packages/assets/blender/build.py raccoon <ziel.usdz>

Bei `.usdz` entsteht daneben `<name>.clips.json` mit der Lage der Clips auf der Zeitleiste
(siehe `figurkit.timeline`).
"""

from __future__ import annotations

import importlib
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import figurkit  # noqa: E402

FIGURES = {"raccoon": "raccoon", "robot": "robot", "cactus": "cactus", "sock": "sock"}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in FIGURES or Path(sys.argv[2]).suffix not in (".glb", ".usdz"):
        print(f"Aufruf: build.py <{'|'.join(FIGURES)}> <ziel.glb|ziel.usdz>")
        raise SystemExit(1)
    figure, target = sys.argv[1], Path(sys.argv[2]).resolve()
    module = importlib.import_module(FIGURES[figure])
    module.build()
    if target.suffix == ".glb":
        figurkit.export_glb(str(target))
    else:
        with tempfile.TemporaryDirectory() as tmp:
            table = figurkit.export_usdz(str(target), tmp)
        clips = target.with_suffix(".clips.json")
        doc = {
            "$comment": "CHAOS-140: Clips auf der USD-Zeitleiste; start/end in Sekunden ab Beginn.",
            "figure": figure,
            "fps": figurkit.FPS,
            "clips": table,
        }
        clips.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"Figur {figure} → {target}")


if __name__ == "__main__":
    main()
