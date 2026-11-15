"""
Erzeugt Figuren-GLBs mit Blender als Python-Modul (CHAOS-58).

    python3 -m venv .venv-blender && .venv-blender/bin/pip install -r packages/assets/blender/requirements.txt
    .venv-blender/bin/python packages/assets/blender/build.py raccoon <ziel.glb>
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import figurkit  # noqa: E402

FIGURES = {"raccoon": "raccoon", "robot": "robot", "cactus": "cactus", "sock": "sock"}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in FIGURES:
        print(f"Aufruf: build.py <{'|'.join(FIGURES)}> <ziel.glb>")
        raise SystemExit(1)
    module = importlib.import_module(FIGURES[sys.argv[1]])
    module.build()
    figurkit.export_glb(str(Path(sys.argv[2]).resolve()))
    print(f"Figur {sys.argv[1]} → {sys.argv[2]}")


if __name__ == "__main__":
    main()
