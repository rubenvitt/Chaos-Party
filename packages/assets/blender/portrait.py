"""
Rendert das Porträt einer Figur mit Blender als Python-Modul (CHAOS-61).

    .venv-blender/bin/python packages/assets/blender/portrait.py raccoon <zielordner>

Die Figur entsteht aus demselben Skript wie ihr GLB (`build.py`) und steht in der ersten
Idle-Pose. Gerendert wird Kopf und Schultern im Dreiviertelprofil mit Natur-Licht
(warme Sonne, Himmelslicht, kühles Gegenlicht) in Cycles, Hintergrund transparent.

Zwei Dateien je Figur:
- `<id>.webp`: das Porträt; das Material `akzent` ist darin **weiß** (mit Licht und Schatten),
- `<id>-akzent.webp`: Maske des sichtbaren Akzents (Alpha), verdeckt wie im Bild.

Lobby und Controller legen die Slot-Farbe per CSS-Maske mit `mix-blend-mode: multiply` über
den weißen Akzent. So bleibt der Akzent in Slot-Farbe wie bisher bei `currentColor`.
"""

from __future__ import annotations

import importlib
import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import figurkit as k  # noqa: E402

SIZE = 384
SAMPLES = 128
ACCENT = "akzent"


@dataclass(frozen=True)
class Framing:
    """Bildausschnitt: sichtbarer Bereich von `bottom` bis Oberkante (Anteil der Höhe)."""

    bottom: float
    # Drehung der Kamera um die Hochachse (Grad, positiv = von der linken Seite der Figur).
    turn: float = 24.0
    # Blick leicht von oben (Grad).
    tilt: float = 8.0
    # Waagerechte Verschiebung des Bildmittelpunkts (Meter, positiv = nach rechts im Bild).
    shift: float = 0.0
    # Mindestbildhöhe im Verhältnis zur Breite der Figur.
    fill: float = 1.0


FRAMING: dict[str, Framing] = {
    "robot": Framing(bottom=0.34),
    "cactus": Framing(bottom=0.36),
    "raccoon": Framing(bottom=0.32),
    "sock": Framing(bottom=0.3),
}


def pose_idle() -> None:
    """Nur die Idle-Spur wirkt, Bild 1 (sonst überlagern sich alle NLA-Spuren)."""
    for obj in bpy.data.objects:
        if obj.type != "ARMATURE" or obj.animation_data is None:
            continue
        for track in obj.animation_data.nla_tracks:
            track.mute = track.name != "idle"
    bpy.context.scene.frame_set(1)


def mesh_bounds() -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        for v in mesh.vertices:
            p = evaluated.matrix_world @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        evaluated.to_mesh_clear()
    return lo, hi


def camera(framing: Framing) -> None:
    lo, hi = mesh_bounds()
    height = hi.z - lo.z
    bottom = lo.z + framing.bottom * height
    top = hi.z + 0.06 * height
    # Breite des Kopfbereichs (Ohren, Arme) darf nicht abgeschnitten werden.
    width = max(hi.x - lo.x, hi.y - lo.y) * 0.9
    span = max(top - bottom, width * framing.fill)
    center_z = top - span / 2

    cam_data = bpy.data.cameras.new("kamera")
    cam_data.lens = 85
    cam_data.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("kamera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    # Entfernung so, dass `span` die Bildhöhe füllt.
    fov = 2 * math.atan(cam_data.sensor_height / (2 * cam_data.lens))
    distance = span / 2 / math.tan(fov / 2)
    turn = math.radians(framing.turn)
    tilt = math.radians(framing.tilt)
    target = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, center_z))
    # Figur blickt nach -Y: Kamera davor, um `turn` zur Seite gedreht.
    offset = Vector(
        (
            -math.sin(turn) * math.cos(tilt),
            -math.cos(turn) * math.cos(tilt),
            math.sin(tilt),
        )
    )
    cam.location = target + offset * distance
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.shift_x = framing.shift / span


def lights() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("himmel")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    # Himmelslicht: kühles Blau von oben, warmer Boden über einen Farbverlauf nach Höhe.
    tree = world.node_tree
    coord = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*k.hex_color("#8a7a5c"), 1.0)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*k.hex_color("#cfe3f2"), 1.0)
    map_range = tree.nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = -1.0
    map_range.inputs["From Max"].default_value = 1.0
    tree.links.new(coord.outputs["Generated"], separate.inputs["Vector"])
    tree.links.new(separate.outputs["Z"], map_range.inputs["Value"])
    tree.links.new(map_range.outputs["Result"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], background.inputs["Color"])
    background.inputs["Strength"].default_value = 0.9

    def sun(name: str, color: str, energy: float, rot: tuple[float, float, float], angle: float) -> None:
        data = bpy.data.lights.new(name, "SUN")
        data.color = k.hex_color(color)
        data.energy = energy
        data.angle = math.radians(angle)
        obj = bpy.data.objects.new(name, data)
        obj.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(obj)

    # Warme Sonne von links oben vorn, weiche Schatten.
    sun("sonne", "#fff1d6", 3.2, (52, 0, -38), 8)
    # Kühles Gegenlicht von hinten rechts für eine Kontur.
    sun("kante", "#cfe6ff", 2.2, (-60, 0, 150), 4)


def render_settings(samples: int, denoise: bool) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    scene.cycles.seed = 0
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.filter_size = 1.2
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    settings = scene.render.image_settings
    settings.file_format = "WEBP"
    settings.color_mode = "RGBA"
    settings.quality = 82


def accent_white() -> None:
    mat = bpy.data.materials[ACCENT]
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1.0)


def mask_materials() -> None:
    """Akzent leuchtet weiß, alles andere ist Holdout (verdeckt, aber transparent)."""
    holdout = bpy.data.materials.new("holdout")
    holdout.use_nodes = True
    tree = holdout.node_tree
    tree.nodes.clear()
    node = tree.nodes.new("ShaderNodeHoldout")
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(node.outputs["Holdout"], out.inputs["Surface"])

    accent = bpy.data.materials[ACCENT]
    tree = accent.node_tree
    tree.nodes.clear()
    emit = tree.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material is not None and slot.material.name != ACCENT:
                slot.material = holdout
    bpy.context.scene.world = None


def render(path: Path) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in FRAMING:
        print(f"Aufruf: portrait.py <{'|'.join(FRAMING)}> <zielordner>")
        raise SystemExit(1)
    figure = sys.argv[1]
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    importlib.import_module(figure).build()
    pose_idle()
    camera(FRAMING[figure])
    lights()
    accent_white()
    render_settings(SAMPLES, denoise=True)
    render(out_dir / f"{figure}.webp")

    mask_materials()
    render_settings(16, denoise=False)
    bpy.context.scene.view_settings.view_transform = "Standard"
    bpy.context.scene.view_settings.look = "None"
    bpy.context.scene.render.image_settings.quality = 90
    render(out_dir / f"{figure}-akzent.webp")
    print(f"Porträt {figure} → {out_dir}")


if __name__ == "__main__":
    main()
