"""
Figuren-Baukasten für Blender als Python-Modul (bpy 5.3, CHAOS-58).

Figuren entstehen als reproduzierbare Skripte statt aus starren Grundkörpern:
- Körper, Glieder und Schwanz aus Skin-Modifier + Subdivision (weiche, organische Formen),
- Kopf aus einer verformten Kugel (Schnauze, Wangen), Augen als glänzende Kugeln,
- Farben als Vertexfarben (keine Texturen), Fell über Sheen im PBR-Material,
- Skelett (Armature) mit den Vertrags-Gelenken `huepfer` und `abzeichen`,
- Animationen mit den Namen aus `CHARACTER_ANIMATIONS`, Export als GLB.

Koordinaten in Blender: Z oben, Figur blickt nach -Y (der glTF-Export macht daraus +Z vorn,
Y oben). Füße bei z = 0.

Blender ist hier nur Werkzeug: Nichts davon wird mit dem Spiel ausgeliefert, die erzeugten
Modelle sind Eigenwerk.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Iterable, Sequence

import bpy  # zuerst: stellt bmesh und mathutils bereit
import bmesh  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

Vec = tuple[float, float, float]
Color = tuple[float, float, float]


def hex_color(value: str) -> Color:
    """sRGB-Hex → linear (Blender rechnet Vertexfarben linear)."""
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(srgb[0]), lin(srgb[1]), lin(srgb[2]))


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------------------------------------
# Materialien
# ---------------------------------------------------------------------------------------------


def material(
    name: str,
    *,
    color: Color | None = None,
    vertex_colors: bool = False,
    roughness: float = 0.6,
    sheen: float = 0.0,
    coat: float = 0.0,
    emission: float = 0.0,
    subsurface: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    assert bsdf is not None
    bsdf.inputs["Roughness"].default_value = roughness
    if color is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if vertex_colors:
        attr = tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Farbe"
        tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    if sheen > 0:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.4
    if coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    if emission > 0 and color is not None:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    if subsurface > 0:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    return mat


# ---------------------------------------------------------------------------------------------
# Geometrie
# ---------------------------------------------------------------------------------------------


def _link(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _apply_modifiers(obj: bpy.types.Object) -> None:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


@dataclass
class SkinNode:
    """Knoten eines Skin-Skeletts: Position und Radius (x, y)."""

    at: Vec
    radius: float | tuple[float, float]
    parent: int | None = None


def skin_mesh(
    name: str,
    nodes: Sequence[SkinNode],
    *,
    subdivisions: int = 2,
    root: int = 0,
) -> bpy.types.Object:
    """Weicher Körper aus einem Skin-Skelett (Skin-Modifier + Subdivision, angewendet)."""
    mesh = bpy.data.meshes.new(name)
    verts = [Vector(n.at) for n in nodes]
    edges = [(n.parent, i) for i, n in enumerate(nodes) if n.parent is not None]
    mesh.from_pydata(verts, edges, [])
    obj = _link(bpy.data.objects.new(name, mesh))
    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.6
    for i, node in enumerate(nodes):
        r = node.radius if isinstance(node.radius, tuple) else (node.radius, node.radius)
        obj.data.skin_vertices[0].data[i].radius = r
    obj.data.skin_vertices[0].data[root].use_root = True
    sub = obj.modifiers.new("weich", "SUBSURF")
    sub.levels = subdivisions
    sub.render_levels = subdivisions
    _apply_modifiers(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def sphere(
    name: str,
    at: Vec,
    radius: float,
    *,
    scale: Vec = (1, 1, 1),
    segments: int = 32,
    rings: int = 16,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    bm.to_mesh(mesh)
    bm.free()
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = at
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def torus(
    name: str, at: Vec, major: float, minor: float, *, segments: int = 48, sides: int = 16
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    verts: list[Vector] = []
    faces: list[tuple[int, int, int, int]] = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            verts.append(Vector((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
    for i in range(segments):
        for j in range(sides):
            a = i * sides + j
            b = ((i + 1) % segments) * sides + j
            c = ((i + 1) % segments) * sides + (j + 1) % sides
            d = i * sides + (j + 1) % sides
            faces.append((a, b, c, d))
    mesh.from_pydata(verts, [], faces)
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = at
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def deform(obj: bpy.types.Object, fn: Callable[[Vector], Vector]) -> None:
    """Verformt alle Eckpunkte (lokale Koordinaten)."""
    for v in obj.data.vertices:
        v.co = fn(v.co.copy())
    obj.data.update()


def bump(center: Vector, direction: Vector, amount: float, width: float) -> Callable[[Vector], Vector]:
    """Weiche Ausbeulung: verschiebt Punkte nahe `center` entlang `direction`."""
    direction = direction.normalized()

    def fn(p: Vector) -> Vector:
        d = (p - center).length
        w = math.exp(-((d / width) ** 2))
        return p + direction * amount * w

    return fn


def paint(obj: bpy.types.Object, color_of: Callable[[Vector, Vector], Color]) -> None:
    """Vertexfarben je Ecke aus Position und Normale (Objekt-lokal)."""
    mesh = obj.data
    layer = mesh.color_attributes.new("Farbe", "BYTE_COLOR", "CORNER")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vi = mesh.loops[loop_index].vertex_index
            v = mesh.vertices[vi]
            c = color_of(v.co, v.normal)
            layer.data[loop_index].color = (*c, 1.0)


def assign(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def join(objects: Iterable[bpy.types.Object], name: str) -> bpy.types.Object:
    objects = list(objects)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


# ---------------------------------------------------------------------------------------------
# Skelett und Animation
# ---------------------------------------------------------------------------------------------


@dataclass
class Bone:
    name: str
    head: Vec
    tail: Vec
    parent: str | None = None
    deform: bool = True


def armature(name: str, bones: Sequence[Bone]) -> bpy.types.Object:
    data = bpy.data.armatures.new(name)
    obj = _link(bpy.data.objects.new(name, data))
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    created: dict[str, bpy.types.EditBone] = {}
    for b in bones:
        eb = data.edit_bones.new(b.name)
        eb.head = b.head
        eb.tail = b.tail
        eb.use_deform = b.deform
        if b.parent:
            eb.parent = created[b.parent]
        created[b.name] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def skin_to(mesh: bpy.types.Object, rig: bpy.types.Object) -> None:
    """Automatische Gewichte (Wärmeverteilung) vom Skelett auf das Mesh."""
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def attach(obj: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    """Starres Teil an einen Knochen hängen (Augen, Nase, Halstuch)."""
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = world


Pose = dict[str, dict[str, Vec]]
"""Knochen → {"rot": Euler in Grad, "loc": Versatz, "scale": Faktor}."""


@dataclass
class Clip:
    name: str
    seconds: float
    keys: list[tuple[float, Pose]] = field(default_factory=list)
    loop: bool = False


FPS = 30


def bake_clips(rig: bpy.types.Object, clips: Sequence[Clip], bones: Sequence[str]) -> None:
    """Je Clip eine Action; alle beteiligten Knochen bekommen Schlüssel (Ruhepose ergänzt)."""
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    for clip in clips:
        action = bpy.data.actions.new(clip.name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for t, pose in clip.keys:
            frame = 1 + round(t * FPS)
            for bone_name in bones:
                pb = rig.pose.bones[bone_name]
                spec = pose.get(bone_name, {})
                rot = spec.get("rot", (0.0, 0.0, 0.0))
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = Euler([math.radians(a) for a in rot], "XYZ")
                pb.location = spec.get("loc", (0.0, 0.0, 0.0))
                pb.scale = spec.get("scale", (1.0, 1.0, 1.0))
                pb.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
                pb.keyframe_insert("location", frame=frame, group=bone_name)
                pb.keyframe_insert("scale", frame=frame, group=bone_name)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip.name
        track.strips.new(clip.name, 1, action)
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def export_glb(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="",
        export_skins=True,
        export_morph=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )
