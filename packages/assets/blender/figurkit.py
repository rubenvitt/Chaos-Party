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
    bpy.context.view_layer.update()  # sonst ist matrix_world nach `location =` noch veraltet
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


@dataclass
class _Baked:
    rig: bpy.types.Object
    clips: list[Clip]
    bones: list[str]


_baked: _Baked | None = None
"""Zuletzt gebackene Clips (für `export_usdz`, das sie auf eine Zeitleiste legt)."""


def _key_clip(rig: bpy.types.Object, clip: Clip, bones: Sequence[str], first_frame: int) -> None:
    for t, pose in clip.keys:
        frame = first_frame + round(t * FPS)
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


def _rest_pose(rig: bpy.types.Object) -> None:
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def bake_clips(rig: bpy.types.Object, clips: Sequence[Clip], bones: Sequence[str]) -> None:
    """Je Clip eine Action; alle beteiligten Knochen bekommen Schlüssel (Ruhepose ergänzt)."""
    global _baked
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    for clip in clips:
        action = bpy.data.actions.new(clip.name)
        action.use_fake_user = True
        rig.animation_data.action = action
        _key_clip(rig, clip, bones, 1)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip.name
        track.strips.new(clip.name, 1, action)
        rig.animation_data.action = None
    _rest_pose(rig)
    _baked = _Baked(rig, list(clips), list(bones))


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


# ---------------------------------------------------------------------------------------------
# USDZ für den nativen Apple-Host (CHAOS-140, ADR-019 §5)
# ---------------------------------------------------------------------------------------------

ATLAS_SIZE = 1024
"""Kantenlänge der Farbtextur, in die die Vertexfarben gebacken werden (eine je Figur)."""

CLIP_GAP_FRAMES = 6
"""Leere Bilder zwischen zwei Clips auf der Zeitleiste, damit beim Zuschneiden nichts überblendet."""


def timeline(clips: Sequence[Clip]) -> list[dict[str, object]]:
    """Lage der Clips auf der gemeinsamen USD-Zeitleiste (Bild 1 = 0 s).

    USD und RealityKit kennen je Datei nur eine Animation. Alle Clips liegen deshalb
    nacheinander auf einer Zeitleiste; der Host schneidet sie mit `start`/`end` (Sekunden ab
    Beginn) wieder heraus (`AnimationView(source:trimStart:trimEnd:)`).
    """
    out: list[dict[str, object]] = []
    frame = 1
    for clip in clips:
        frames = round(clip.seconds * FPS)
        out.append(
            {
                "name": clip.name,
                "startFrame": frame,
                "endFrame": frame + frames,
                "start": round((frame - 1) / FPS, 6),
                "end": round((frame - 1 + frames) / FPS, 6),
                "loop": clip.loop,
            }
        )
        frame += frames + CLIP_GAP_FRAMES
    return out


def _uses_vertex_colors(mat: bpy.types.Material | None) -> bool:
    return bool(
        mat
        and mat.node_tree
        and any(n.bl_idname == "ShaderNodeVertexColor" for n in mat.node_tree.nodes)
    )


def bake_vertex_colors(image_name: str, size: int = ATLAS_SIZE) -> bpy.types.Image | None:
    """Vertexfarben aller Figurenteile in eine gemeinsame Farbtextur backen und die Materialien
    darauf umstellen (Base Color ← Textur statt ← Vertexfarbe).

    Warum: RealityKit ignoriert Vertexfarben im Material (`UsdPrimvarReader`) und zeigt sie nur
    ohne Material (EXP-017). Mit Textur bleiben Rauheit, Clearcoat, Metall und Leuchten als
    `UsdPreviewSurface` erhalten. Sheen und Subsurface kennt UsdPreviewSurface nicht.
    """
    scene = bpy.context.scene
    objects = [
        o
        for o in scene.objects
        if o.type == "MESH" and any(_uses_vertex_colors(m) for m in o.data.materials)
    ]
    if not objects:
        return None

    # Gemeinsame UV-Abwicklung: Smart UV Project im Mehrobjekt-Editmodus packt alle Inseln
    # zusammen in 0…1. Die Anordnung schwankt zwischen Läufen leicht (Packen über mehrere
    # Objekte); das Ergebnis ist gleichwertig, aber nicht bitgleich (docs/apple-assets.md).
    objects.sort(key=lambda o: o.name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")

    image = bpy.data.images.new(image_name, size, size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    materials = sorted({m for o in objects for m in o.data.materials if m}, key=lambda m: m.name)
    for mat in materials:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.name = "farbatlas"
        node.image = image
        node.interpolation = "Linear"
        mat.node_tree.nodes.active = node

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    bake = scene.render.bake
    bake.margin = 8
    bake.margin_type = "EXTEND"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_clear=True, margin=8)

    for mat in materials:
        tree = mat.node_tree
        atlas = tree.nodes["farbatlas"]
        vertex_nodes = [n for n in tree.nodes if n.bl_idname == "ShaderNodeVertexColor"]
        if not vertex_nodes:
            tree.nodes.remove(atlas)  # Material ohne Vertexfarbe: Konstante bleibt
            continue
        for vc in vertex_nodes:
            for link in list(vc.outputs["Color"].links):
                tree.links.new(atlas.outputs["Color"], link.to_socket)
            tree.nodes.remove(vc)
    return image


def add_badge_anchor(rig: bpy.types.Object, name: str = "abzeichen") -> bpy.types.Object:
    """Leeres Objekt am Knochen `abzeichen`: In USD sind Knochen keine Prims, der Host findet das
    Abzeichen so per `findEntity(named: "abzeichen")`."""
    bone = rig.data.bones[name]
    empty = _link(bpy.data.objects.new(name, None))
    empty.location = rig.matrix_world @ bone.head_local
    attach(empty, rig, name)
    return empty


def export_usdz(path: str, texture_dir: str) -> list[dict[str, object]]:
    """Figur als USDZ: Farbatlas statt Vertexfarben, alle Clips auf einer Zeitleiste.

    Gibt die Clip-Tabelle zurück (siehe `timeline`). `texture_dir`: Ablage für die gebackene
    PNG, bevor der Export sie ins USDZ packt.
    """
    assert _baked is not None, "erst bake_clips aufrufen"
    rig = _baked.rig
    add_badge_anchor(rig)

    image = bake_vertex_colors(f"{rig.name}_farbe")
    if image is not None:
        image.filepath_raw = f"{texture_dir}/{rig.name}_farbe.png"
        image.file_format = "PNG"
        image.save()

    # NLA-Spuren spielen alle ab Bild 1 gleichzeitig; für USD eine einzige Action mit allen
    # Clips nacheinander.
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    action = bpy.data.actions.new("zeitleiste")
    rig.animation_data.action = action
    table = timeline(_baked.clips)
    for clip, entry in zip(_baked.clips, table):
        _key_clip(rig, clip, _baked.bones, int(entry["startFrame"]))  # type: ignore[call-overload]
    _rest_pose(rig)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = int(table[-1]["endFrame"])  # type: ignore[call-overload]
    scene.render.fps = FPS

    skinned = any(m.type == "ARMATURE" for ob in scene.objects for m in ob.modifiers)
    bpy.ops.wm.usd_export(
        filepath=path,
        export_animation=True,
        # Robot: Teile hängen starr an Knochen, kein Mesh ist geskinnt. Ein Skeleton ohne SkelRoot
        # wäre ungültiges USD; die Knochenbewegung steckt dann in den Xform-Zeitreihen.
        export_armatures=skinned,
        export_materials=True,
        generate_preview_surface=True,
        export_textures_mode="NEW",
        convert_orientation=True,
        export_global_forward_selection="NEGATIVE_Z",
        export_global_up_selection="Y",
        export_lights=False,
        export_cameras=False,
        export_custom_properties=False,
        root_prim_path="/root",
    )
    return table


# ---------------------------------------------------------------------------------------------
# Harte Formen (Roboter, Topf, Knöpfe)
# ---------------------------------------------------------------------------------------------


def rounded_box(
    name: str, at: Vec, size: Vec, radius: float, *, segments: int = 4
) -> bpy.types.Object:
    """Kasten mit gerundeten Kanten (Bevel, angewendet) – wie lackiertes Blechspielzeug."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(mesh)
    bm.free()
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = at
    bevel = obj.modifiers.new("kante", "BEVEL")
    bevel.width = radius
    bevel.segments = segments
    bevel.limit_method = "NONE"
    bevel.harden_normals = False
    _apply_modifiers(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def cylinder(
    name: str,
    at: Vec,
    radius: float,
    depth: float,
    *,
    radius_top: float | None = None,
    segments: int = 24,
    axis: str = "Z",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    if axis != "Z":
        for v in bm.verts:
            x, y, z = v.co
            v.co = Vector((z, y, -x)) if axis == "X" else Vector((x, z, -y))
    bm.to_mesh(mesh)
    bm.free()
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = at
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def lathe(name: str, profile: Sequence[tuple[float, float]], *, segments: int = 40) -> bpy.types.Object:
    """Drehkörper um Z aus (Radius, Höhe)-Punkten (Topf, Pokal, Knopf)."""
    verts: list[Vector] = []
    faces: list[tuple[int, ...]] = []
    rings = len(profile)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        for r, z in profile:
            verts.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    for i in range(segments):
        n = (i + 1) % segments
        for j in range(rings - 1):
            faces.append((i * rings + j, n * rings + j, n * rings + j + 1, i * rings + j + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = _link(bpy.data.objects.new(name, mesh))
    bpy.context.view_layer.objects.active = obj
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # Normalen nach außen (Reihenfolge der Profilpunkte egal).
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def solid(obj: bpy.types.Object, color: Color) -> bpy.types.Object:
    """Einfarbig per Vertexfarbe (für Teile, die sich ein Material teilen)."""
    paint(obj, lambda p, n: color)
    return obj
