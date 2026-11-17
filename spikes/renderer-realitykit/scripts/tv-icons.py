#!/usr/bin/env python3
"""tvOS-Icons und Top-Shelf-Bilder für die Apple-TV-App (CHAOS-119).

Erzeugt `app-tv/Assets.xcassets/App Icon & Top Shelf Image.brandassets` aus dem Icon der
Controller-App (apps/controller-ios, CHAOS-115). Die PNGs sind eingecheckt; das Skript ist nur
nötig, wenn sich das Motiv ändert:

    python3 -I spikes/renderer-realitykit/scripts/tv-icons.py [--font=<ttf/otf>]

Braucht Pillow. tvOS verlangt für App-Icons einen Bildstapel mit mindestens zwei Ebenen
(Parallaxe); die hinterste Ebene muss deckend sein:
- Hintergrund: Grün-Verlauf mit dem Controller-Motiv, an den Seiten weich ausgeblendet
- Vordergrund: Konfetti und Schriftzug „TV“, transparent
"""

import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / "apps/controller-ios/Sources/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
CATALOG = HERE.parent / "app-tv/Assets.xcassets"
BRAND = CATALOG / "App Icon & Top Shelf Image.brandassets"
INFO = {"author": "xcode", "version": 1}
FONTS = [
    "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf",
    "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "/System/Library/Fonts/SFNSRounded.ttf",
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
]

# Farben aus dem Controller-Icon (Rand und Mitte des Verlaufs) und dem Konfetti.
EDGE = (104, 184, 64)
CENTER = (214, 232, 120)
CONFETTI = [(244, 112, 96), (250, 204, 60), (72, 176, 236), (120, 190, 50)]


def write_json(path: Path, data: dict) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "Contents.json").write_text(json.dumps(data, indent=2) + "\n")


def gradient(w: int, h: int) -> Image.Image:
    """Radialer Verlauf wie im Controller-Icon: hell in der Mitte, Grün am Rand."""
    small = Image.new("RGB", (160, 96))
    px = small.load()
    for y in range(96):
        for x in range(160):
            d = math.hypot((x - 80) / 80, (y - 48) / 48) / math.sqrt(2)
            t = min(1.0, d * 1.25)
            px[x, y] = tuple(round(c + (e - c) * t) for c, e in zip(CENTER, EDGE))
    return small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))


def back_layer(w: int, h: int, art_h: float = 1.0, art_x: float = 0.5) -> Image.Image:
    """Deckender Hintergrund mit dem Controller-Motiv, quadratisch, Ränder weich ausgeblendet."""
    img = gradient(w, h)
    side = round(h * art_h)
    art = Image.open(SOURCE).convert("RGB").resize((side, side), Image.LANCZOS)
    mask = Image.new("L", (side, side), 0)
    feather = side // 7
    ImageDraw.Draw(mask).rounded_rectangle(
        (feather, feather // 3, side - feather, side - feather // 3), radius=feather, fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(feather / 2.2))
    img.paste(art, (round(w * art_x - side / 2), (h - side) // 2), mask)
    return img


def front_layer(w: int, h: int, seed: int, font: ImageFont.FreeTypeFont | None, label: str) -> Image.Image:
    """Transparente Vordergrund-Ebene: Konfetti am Rand, Schriftzug unten rechts."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rng = random.Random(seed)
    unit = h / 768
    for _ in range(14):
        # nur in den äußeren Streifen, damit das Motiv frei bleibt
        x = rng.choice([rng.uniform(0.03, 0.2), rng.uniform(0.8, 0.97)]) * w
        y = rng.uniform(0.08, 0.92) * h
        size = rng.uniform(18, 34) * unit
        piece = Image.new("RGBA", (round(size * 2.4), round(size * 2.4)), (0, 0, 0, 0))
        ImageDraw.Draw(piece).rounded_rectangle(
            (size * 0.7, size * 0.95, size * 1.7, size * 1.45), radius=size * 0.18, fill=rng.choice(CONFETTI)
        )
        piece = piece.rotate(rng.uniform(0, 180), resample=Image.BICUBIC)
        img.alpha_composite(piece, (round(x - piece.width / 2), round(y - piece.height / 2)))
    if font and label:
        size = round(118 * unit)
        f = font.font_variant(size=size)
        box = draw.textbbox((0, 0), label, font=f)
        tw, th = box[2] - box[0], box[3] - box[1]
        pad_x, pad_y = 30 * unit, 18 * unit
        # innerhalb der sicheren Zone: tvOS schneidet beim Fokus-Effekt die Ränder an
        x1 = w * 0.915
        y1 = h * 0.89
        x0 = x1 - tw - 2 * pad_x
        y0 = y1 - th - 2 * pad_y
        shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (x0, y0 + 8 * unit, x1, y1 + 8 * unit), radius=34 * unit, fill=(30, 60, 20, 110)
        )
        img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10 * unit)))
        draw.rounded_rectangle((x0, y0, x1, y1), radius=34 * unit, fill=(252, 236, 210, 255))
        draw.text((x0 + pad_x - box[0], y0 + pad_y - box[1]), label, font=f, fill=(244, 112, 96, 255))
    return img


def image_stack(name: str, sizes: list[tuple[str, int, int]], font) -> None:
    """Bildstapel mit Vorder- und Hintergrund; sizes = [(scale, w, h), …]."""
    stack = BRAND / f"{name}.imagestack"
    layers = ["Front", "Back"]
    write_json(stack, {"info": INFO, "layers": [{"filename": f"{l}.imagestacklayer"} for l in layers]})
    for layer in layers:
        lpath = stack / f"{layer}.imagestacklayer"
        write_json(lpath, {"info": INFO})
        images = []
        for scale, w, h in sizes:
            file = f"{layer.lower()}-{w}x{h}.png"
            img = back_layer(w, h) if layer == "Back" else front_layer(w, h, 119, font, "TV")
            iset = lpath / "Content.imageset"
            iset.mkdir(parents=True, exist_ok=True)
            img.save(iset / file, optimize=True)
            images.append({"filename": file, "idiom": "tv", "scale": scale})
        write_json(lpath / "Content.imageset", {"images": images, "info": INFO})


def top_shelf(name: str, sizes: list[tuple[str, int, int]], font) -> None:
    iset = BRAND / f"{name}.imageset"
    iset.mkdir(parents=True, exist_ok=True)
    images = []
    for scale, w, h in sizes:
        file = f"topshelf-{w}x{h}.png"
        img = back_layer(w, h, art_h=1.0, art_x=0.5).convert("RGBA")
        img.alpha_composite(front_layer(w, h, 120, font, "Chaos Party"))
        img.convert("RGB").save(iset / file, optimize=True)
        images.append({"filename": file, "idiom": "tv", "scale": scale})
    write_json(iset, {"images": images, "info": INFO})


def main() -> None:
    font_path = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--font=")), None)
    candidates = [font_path] if font_path else FONTS
    font = next((ImageFont.truetype(p, 100) for p in candidates if p and Path(p).exists()), None)
    if font is None:
        print("Keine Schrift gefunden, Icons ohne Schriftzug.", file=sys.stderr)

    write_json(CATALOG, {"info": INFO})
    write_json(
        BRAND,
        {
            "assets": [
                {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
                {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
                {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
                {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
            ],
            "info": INFO,
        },
    )
    image_stack("App Icon - App Store", [("1x", 1280, 768)], font)
    image_stack("App Icon", [("1x", 400, 240), ("2x", 800, 480)], font)
    top_shelf("Top Shelf Image", [("1x", 1920, 720), ("2x", 3840, 1440)], font)
    top_shelf("Top Shelf Image Wide", [("1x", 2320, 720), ("2x", 4640, 1440)], font)
    print(f"Geschrieben: {BRAND.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
