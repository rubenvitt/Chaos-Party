"""
Feinstruktur der Figuren über kachelbare Normal-Texturen (CHAOS-172, EXP-032).

Strickmaschen, Fell, Lackkratzer und die Haut des Kaktus wären als Geometrie zu teuer
(EXP-027, Variante D). Stattdessen bekommt ein Material eine kleine Normal-Textur, die sich über
eine eigene UV-Map `struktur` in festem Weltmaß wiederholt:

- **Texturen:** prozedural aus numpy (Höhenfeld → Normalen), kachelbar, mit festem Startwert.
  Keine Fremd-Assets, also keine Lizenzfrage; zwei Läufe ergeben dieselben Pixel.
- **UV-Map `struktur`:** Würfelprojektion je Fläche in Metern (`MUSTER[...].kachel` = Kantenlänge
  einer Kachel). Auf allen Seitenflächen zeigt V nach oben (Maschen stehen senkrecht), die
  Tangentenbasis ist überall rechtshändig (keine gespiegelten Normalen an den Projektionsnähten).
- **Material:** UV Map → Bild (Non-Color) → Normal Map (Tangentenraum, Stärke 1) → Principled
  BSDF. Der glTF-Export macht daraus `normalTexture`, der USD-Export einen `UsdUVTexture` am
  Eingang `normal` von `UsdPreviewSurface`. Die Stärke steckt in der Textur selbst (`relief`):
  UsdPreviewSurface kennt keine Stärke, so sehen Babylon und RealityKit gleich aus.

Je Figur höchstens ein Muster (eine Textur je GLB). Die Stärke ist bewusst klein: Aus der
Brettansicht mitteln die Mipmaps das Muster weg, aus der Nähe bleibt es sichtbar.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Callable

import bpy  # zuerst: stellt mathutils bereit
import numpy as np
from mathutils import Vector  # noqa: E402

UV_NAME = "struktur"
"""Name der UV-Map (im USD die Primvar gleichen Namens)."""

SIZE = 256
"""Kantenlänge jeder Muster-Textur in Pixeln (Zweierpotenz, Mipmaps)."""

PROP = "struktur"
"""Eigenschaft am Material: Name des Musters."""

Height = Callable[[np.ndarray, np.ndarray, np.random.Generator], np.ndarray]


@dataclass(frozen=True)
class Muster:
    hoehe: Height
    """Höhenfeld 0…1 aus u, v (je 0…1, kachelbar) und einem Zufallsgenerator."""
    kachel: float
    """Kantenlänge einer Kachel in Metern."""
    relief: float
    """Steilheit beim Umrechnen Höhe → Normale (Pixel-Gradient × relief) = Stärke der Struktur."""
    seed: int


# ---------------------------------------------------------------------------------------------
# Höhenfelder (alle kachelbar: nur ganzzahlige Frequenzen und Abstände modulo 1)
# ---------------------------------------------------------------------------------------------


def _wrap(d: np.ndarray) -> np.ndarray:
    """Kürzester Abstand auf dem Einheitstorus."""
    return d - np.round(d)


def _waves(u: np.ndarray, v: np.ndarray, rng: np.random.Generator, count: int, fu: tuple[int, int], fv: tuple[int, int]) -> np.ndarray:
    """Summe zufälliger Sinuswellen mit ganzzahligen Frequenzen (kachelbares Rauschen)."""
    out = np.zeros_like(u)
    for _ in range(count):
        a = int(rng.integers(fu[0], fu[1] + 1)) * (1 if rng.random() < 0.5 else -1)
        b = int(rng.integers(fv[0], fv[1] + 1))
        phase = rng.random() * 2 * np.pi
        out += np.sin(2 * np.pi * (a * u + b * v) + phase) / max(1.0, np.hypot(a, b)) ** 0.5
    out -= out.min()
    return out / max(out.max(), 1e-9)


def strick(u: np.ndarray, v: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Glatt rechts gestrickt: Spalten aus V-förmigen Maschen (je zwei schräge Schlaufen)."""
    cols, rows = 8, 10
    cu = (u * cols) % 1.0
    cv = (v * rows) % 1.0
    height = np.zeros_like(u)
    for side in (-1.0, 1.0):
        # Schenkel des V: Mitte bei x = 0.5 ± 0.22, oben weiter außen als unten.
        x = cu - (0.5 + side * 0.22)
        y = cv - 0.5
        angle = side * np.radians(28)
        along = x * np.sin(angle) + y * np.cos(angle)
        across = x * np.cos(angle) - y * np.sin(angle)
        r2 = (along / 0.62) ** 2 + (across / 0.21) ** 2
        leg = np.sqrt(np.clip(1.0 - r2, 0.0, 1.0))
        height = np.maximum(height, leg)
    # Feine Faser quer zur Masche.
    fibre = _waves(u, v, rng, 24, (40, 90), (0, 12))
    return np.clip(height * 0.9 + fibre * 0.1, 0.0, 1.0)


def fell(u: np.ndarray, v: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Fell: viele kurze Strähnen, überwiegend nach unten gekämmt (fein quer, lang entlang V)."""
    strands = _waves(u, v, rng, 60, (18, 46), (0, 5))
    clumps = _waves(u, v, rng, 10, (3, 8), (1, 4))
    return np.clip(strands * 0.75 + clumps * 0.25, 0.0, 1.0)


def lack(u: np.ndarray, v: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Lack: leichte Orangenhaut und ein paar feine Kratzer (Rillen)."""
    peel = _waves(u, v, rng, 40, (4, 14), (4, 14))
    height = 0.6 + peel * 0.4
    for _ in range(9):
        p = rng.random(2)
        direction = rng.random() * np.pi
        length = 0.15 + rng.random() * 0.3
        dx = _wrap(u - p[0])
        dy = _wrap(v - p[1])
        along = dx * np.cos(direction) + dy * np.sin(direction)
        across = -dx * np.sin(direction) + dy * np.cos(direction)
        inside = np.clip(1.0 - np.abs(along) / (length / 2), 0.0, 1.0)
        groove = np.exp(-((across / 0.0022) ** 2)) * np.minimum(1.0, inside * 4)
        height -= groove * (0.25 + rng.random() * 0.25)
    return np.clip(height, 0.0, 1.0)


def haut(u: np.ndarray, v: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Kaktushaut: feine Tüpfel (Spaltöffnungen) auf leicht welliger Fläche."""
    height = _waves(u, v, rng, 16, (3, 9), (3, 9)) * 0.35
    for _ in range(220):
        p = rng.random(2)
        r = 0.006 + rng.random() * 0.008
        d2 = _wrap(u - p[0]) ** 2 + _wrap(v - p[1]) ** 2
        height += np.exp(-d2 / (r * r)) * 0.5
    return np.clip(height, 0.0, 1.0)


MUSTER: dict[str, Muster] = {
    "strick": Muster(strick, kachel=0.12, relief=5.4, seed=172),
    "fell": Muster(fell, kachel=0.10, relief=6.3, seed=173),
    "lack": Muster(lack, kachel=0.30, relief=1.4, seed=174),
    "haut": Muster(haut, kachel=0.09, relief=2.5, seed=175),
}


# ---------------------------------------------------------------------------------------------
# Textur
# ---------------------------------------------------------------------------------------------


def normal_pixels(name: str, size: int = SIZE) -> np.ndarray:
    """RGBA-Pixel (float, Zeile 0 unten wie in Blender) der Normal-Textur eines Musters.

    Tangentenraum nach OpenGL/glTF-Konvention: R = +U, G = +V, B = Normale.
    """
    m = MUSTER[name]
    rng = np.random.default_rng(m.seed)
    coords = (np.arange(size) + 0.5) / size
    u, v = np.meshgrid(coords, coords)  # Zeile = v (unten nach oben), Spalte = u
    h = m.hoehe(u, v, rng)
    du = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * m.relief
    dv = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * m.relief
    n = np.stack([-du, -dv, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones((size, size, 1))], axis=-1)
    return rgba.astype(np.float32)


_images: dict[str, bpy.types.Image] = {}
_dir: str | None = None


def image(name: str) -> bpy.types.Image:
    """Normal-Textur als Blender-Bild (PNG in einem Temp-Ordner, damit beide Exporte sie finden)."""
    global _dir
    hit = _images.get(name)
    if hit is not None and hit.name in bpy.data.images:
        return hit
    if _dir is None:
        _dir = tempfile.mkdtemp(prefix="struktur-")
    img = bpy.data.images.new(f"struktur_{name}", SIZE, SIZE, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(normal_pixels(name).ravel())
    img.filepath_raw = os.path.join(_dir, f"struktur_{name}.png")
    img.file_format = "PNG"
    img.save()
    img.source = "FILE"
    img.reload()
    img.colorspace_settings.name = "Non-Color"
    _images[name] = img
    return img


# ---------------------------------------------------------------------------------------------
# UV-Map und Material
# ---------------------------------------------------------------------------------------------

# Rechtshändige Tangentenbasis (T, B) je Hauptachse der Flächennormale, T × B = Normale.
# Auf Seitenflächen ist B = +Z (oben), auf Deckel und Boden B = +Y.
_BASIS: dict[tuple[int, int], tuple[Vector, Vector]] = {
    (0, 1): (Vector((0, 1, 0)), Vector((0, 0, 1))),
    (0, -1): (Vector((0, -1, 0)), Vector((0, 0, 1))),
    (1, 1): (Vector((-1, 0, 0)), Vector((0, 0, 1))),
    (1, -1): (Vector((1, 0, 0)), Vector((0, 0, 1))),
    (2, 1): (Vector((1, 0, 0)), Vector((0, 1, 0))),
    (2, -1): (Vector((-1, 0, 0)), Vector((0, 1, 0))),
}


STICKY = 0.6
"""Eine Fläche behält die Projektionsachse ihres Nachbarn, solange |n · Achse| ≥ STICKY (≈ 53°).
Weniger Nähte heißt weniger getrennte Eckpunkte im Export; der Preis ist bis zu 1,7× Dehnung."""


def _axis_key(n: Vector, axis: int) -> tuple[int, int]:
    return (axis, 1 if n[axis] >= 0 else -1)


def project_uv(obj: bpy.types.Object, tile: float) -> None:
    """UV-Map `struktur`: Würfelprojektion in Weltmaß (Ruhepose), 1 UV = `tile` Meter.

    Die Achse wächst flächenweise über Nachbarn (Breitensuche in fester Reihenfolge) und wechselt
    erst, wenn die Fläche zu schräg zur Achse steht (`STICKY`). Reine Projektion je Fläche nach
    der Hauptachse brachte bei der Socke 35 % mehr Eckpunkte durch Nähte.
    """
    mesh = obj.data
    layer = mesh.uv_layers.get(UV_NAME) or mesh.uv_layers.new(name=UV_NAME)
    world = obj.matrix_world
    rot = world.to_3x3()
    coords = [world @ v.co for v in mesh.vertices]
    normals = [(rot @ poly.normal).normalized() for poly in mesh.polygons]
    # Nachbarn über gemeinsame Kanten.
    by_edge: dict[tuple[int, int], list[int]] = {}
    for poly in mesh.polygons:
        for key in poly.edge_keys:
            by_edge.setdefault(key, []).append(poly.index)
    neighbours: list[list[int]] = [[] for _ in mesh.polygons]
    for faces in by_edge.values():
        for f in faces:
            neighbours[f].extend(g for g in faces if g != f)
    choice: list[tuple[int, int] | None] = [None] * len(mesh.polygons)
    for seed in range(len(mesh.polygons)):
        if choice[seed] is not None:
            continue
        n = normals[seed]
        choice[seed] = _axis_key(n, max(range(3), key=lambda i: abs(n[i])))
        queue = [seed]
        while queue:
            f = queue.pop(0)
            axis, sign = choice[f]  # type: ignore[misc]
            for g in neighbours[f]:
                if choice[g] is not None:
                    continue
                ng = normals[g]
                if ng[axis] * sign >= STICKY:
                    choice[g] = (axis, sign)
                else:
                    choice[g] = _axis_key(ng, max(range(3), key=lambda i: abs(ng[i])))
                queue.append(g)
    for poly in mesh.polygons:
        t, b = _BASIS[choice[poly.index]]  # type: ignore[index]
        for li in poly.loop_indices:
            p = coords[mesh.loops[li].vertex_index]
            layer.data[li].uv = (p.dot(t) / tile, p.dot(b) / tile)


def _pattern(mat: bpy.types.Material | None) -> str | None:
    if mat is None:
        return None
    name = mat.get(PROP)
    return str(name) if name else None


def mark(mat: bpy.types.Material, name: str) -> None:
    """Material für ein Muster vormerken (Knoten erst in `apply`, nach dem Bau der Figur)."""
    if name not in MUSTER:
        raise ValueError(f"unbekanntes Muster „{name}“ (bekannt: {', '.join(MUSTER)})")
    mat[PROP] = name


def apply() -> list[str]:
    """UV-Map und Normal-Knoten für alle vorgemerkten Materialien; gibt die Muster zurück.

    Idempotent: ein zweiter Aufruf ändert nichts mehr.
    """
    used: set[str] = set()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        names = {_pattern(m) for m in obj.data.materials} - {None}
        if not names:
            continue
        if len(names) > 1:
            raise ValueError(f"{obj.name}: mehrere Muster an einem Mesh ({', '.join(sorted(names))})")
        name = names.pop()
        assert name is not None
        if UV_NAME not in obj.data.uv_layers:
            project_uv(obj, MUSTER[name].kachel)
        used.add(name)
    if len(used) > 1:
        raise ValueError(f"mehrere Muster in einer Figur ({', '.join(sorted(used))}); erlaubt ist eins")
    for mat in bpy.data.materials:
        name = _pattern(mat)
        if not name or not mat.node_tree or "struktur_normal" in mat.node_tree.nodes:
            continue
        tree = mat.node_tree
        bsdf = tree.nodes.get("Principled BSDF")
        assert bsdf is not None
        uv = tree.nodes.new("ShaderNodeUVMap")
        uv.name = "struktur_uv"
        uv.uv_map = UV_NAME
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.name = "struktur_bild"
        tex.image = image(name)
        tex.interpolation = "Linear"
        tex.extension = "REPEAT"
        nm = tree.nodes.new("ShaderNodeNormalMap")
        nm.name = "struktur_normal"
        nm.space = "TANGENT"
        nm.uv_map = UV_NAME
        nm.inputs["Strength"].default_value = 1.0
        tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
        tree.links.new(tex.outputs["Color"], nm.inputs["Color"])
        tree.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return sorted(used)
