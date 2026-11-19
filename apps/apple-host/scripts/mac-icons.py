#!/usr/bin/env python3
"""Mac-App-Icon für die App-Store-Variante des Apple-Hosts (CHAOS-200).

Erzeugt `app-mac/Assets.xcassets/AppIcon.appiconset` aus dem Icon der Controller-App
(apps/controller-ios, CHAOS-115) im Mac-Raster: abgerundetes Quadrat mit Rand auf transparentem
Grund, alle Größen von 16 bis 1024 px. Die PNGs sind eingecheckt; das Skript ist nur nötig, wenn sich
das Motiv ändert:

    python3 -I apps/apple-host/scripts/mac-icons.py

Braucht Pillow. Die Developer-ID-App (release-macos.sh) bleibt ohne dieses Icon-Set; der Mac App Store
verlangt eins.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / "apps/controller-ios/Sources/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
CATALOG = HERE.parent / "app-mac/Assets.xcassets"
ICONSET = CATALOG / "AppIcon.appiconset"
INFO = {"author": "xcode", "version": 1}

# Mac-Raster (Apple Design Resources): 824 px Fläche in 1024 px, Eckradius etwa 185 px.
CANVAS = 1024
BODY = 824
RADIUS = 185
SIZES = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]


def master() -> Image.Image:
    art = Image.open(SOURCE).convert("RGBA").resize((BODY, BODY), Image.Resampling.LANCZOS)
    mask = Image.new("L", (BODY * 4, BODY * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, BODY * 4 - 1, BODY * 4 - 1), radius=RADIUS * 4, fill=255)
    art.putalpha(mask.resize((BODY, BODY), Image.Resampling.LANCZOS))
    icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    offset = (CANVAS - BODY) // 2
    icon.alpha_composite(art, (offset, offset))
    return icon


def main() -> None:
    ICONSET.mkdir(parents=True, exist_ok=True)
    icon = master()
    images = []
    for size, scale in SIZES:
        px = size * scale
        name = f"icon-{size}{'@2x' if scale == 2 else ''}.png"
        icon.resize((px, px), Image.Resampling.LANCZOS).save(ICONSET / name, optimize=True)
        images.append({"filename": name, "idiom": "mac", "scale": f"{scale}x", "size": f"{size}x{size}"})
    (ICONSET / "Contents.json").write_text(json.dumps({"images": images, "info": INFO}, indent=2) + "\n")
    (CATALOG / "Contents.json").write_text(json.dumps({"info": INFO}, indent=2) + "\n")
    print(f"{len(images)} Icons in {ICONSET}")


if __name__ == "__main__":
    main()
