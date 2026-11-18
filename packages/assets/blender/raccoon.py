"""
Wusel, der Waschbär (CHAOS-58): neu modelliert für den Look „Stilisierte Natur“.

Großer Kopf mit Schnauze und Fellwangen, dunkle Maske, große glänzende Augen, geringelter
Buschschwanz, Halstuch in Slot-Farbe (Material `akzent`). Höhe ≈ 1,55, Füße bei 0, Blick -Y.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import standard_clips
from mathutils import Vector
import bpy  # noqa: E402

FUR = k.hex_color("#8f8b95")
FUR_DARK = k.hex_color("#5d5864")
CREAM = k.hex_color("#ece6dc")
MASK = k.hex_color("#2f2b35")
PAWS = k.hex_color("#3a3541")
EAR_INNER = k.hex_color("#4a3f48")
SCLERA = k.hex_color("#fbfaf6")
IRIS = k.hex_color("#5a3a22")
PUPIL = k.hex_color("#0d0b10")
NOSE = k.hex_color("#1d1a20")
SCARF = k.hex_color("#e69f00")

HEAD_BACK = 0.06
HEAD_CENTER = Vector((0.0, HEAD_BACK, 1.1))


def smoothstep(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mix(c1: k.Color, c2: k.Color, t: float) -> k.Color:
    return (c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t)


def build_body():
    n = k.SkinNode
    nodes = [
        n((0, 0, 0.36), (0.22, 0.2)),  # 0 Becken
        n((0, 0, 0.52), (0.25, 0.23), 0),  # 1 Bauch
        n((0, 0, 0.68), (0.2, 0.18), 1),  # 2 Brust
        n((0, 0, 0.82), 0.12, 2),  # 3 Hals
    ]
    for side in (1, -1):
        hip = len(nodes)
        nodes += [
            n((side * 0.11, 0, 0.3), 0.11, 0),
            n((side * 0.13, -0.01, 0.17), 0.085, hip),
            n((side * 0.13, 0.0, 0.07), 0.075, hip + 1),
            n((side * 0.13, -0.1, 0.05), (0.085, 0.07), hip + 2),
        ]
    for side in (1, -1):
        sh = len(nodes)
        nodes += [
            n((side * 0.17, 0, 0.72), 0.07, 2),
            n((side * 0.27, -0.03, 0.6), 0.058, sh),
            n((side * 0.31, -0.07, 0.48), 0.07, sh + 1),
        ]
    body = k.skin_mesh("koerper", nodes, subdivisions=2)

    def color(p: Vector, normal: Vector) -> k.Color:
        c = FUR
        # Heller Bauch vorn.
        belly = smoothstep(-0.05, -0.16, p.y) * (1 - smoothstep(0.1, 0.17, abs(p.x)))
        belly *= smoothstep(0.3, 0.38, p.z) * (1 - smoothstep(0.66, 0.74, p.z))
        c = mix(c, CREAM, belly)
        # Dunkle Pfoten und Füße.
        if p.z < 0.14:
            c = mix(c, PAWS, smoothstep(0.13, 0.1, p.z))
        if abs(p.x) > 0.22 and p.z < 0.6:
            c = mix(c, PAWS, smoothstep(0.58, 0.53, p.z))
        # Etwas dunkler am Rücken.
        c = mix(c, FUR_DARK, smoothstep(0.05, 0.2, p.y) * 0.35)
        return c

    k.paint(body, color)
    return body


TAIL_POINTS = [
    Vector((0, 0.16, 0.36)),
    Vector((0, 0.27, 0.44)),
    Vector((0, 0.35, 0.6)),
    Vector((0, 0.37, 0.78)),
    Vector((0, 0.33, 0.92)),
]


def build_tail():
    """Buschschwanz als Röhre (CHAOS-171): jeder Ring leicht bauschig, Ringel scharf begrenzt."""
    frames = k.path_frames([tuple(p) for p in TAIL_POINTS], 38, ref=(1, 0, 0))
    profile = [0.07, 0.1, 0.12, 0.1, 0.06]

    def base(t: float) -> float:
        x = t * (len(profile) - 1)
        i = min(len(profile) - 2, int(x))
        f = x - i
        return profile[i] + (profile[i + 1] - profile[i]) * f

    def radius(fr: k.Frame, a: float):
        # Bausch je Ringel und feine Fellzacken rundum.
        puff = 1 + 0.045 * math.sin(fr.t * 5.5 * 2 * math.pi) ** 2 + 0.03 * math.cos(a * 9 + fr.t * 40)
        r = base(fr.t) * puff
        return r, r

    tail = k.tube("schwanz", frames, radius, around=20, dome_end=1.1, dome_rings=6)

    lengths = [0.0]
    for p0, p1 in zip(TAIL_POINTS, TAIL_POINTS[1:]):
        lengths.append(lengths[-1] + (p1 - p0).length)

    def along(p: Vector) -> float:
        best, best_t = 1e9, 0.0
        for i, (p0, p1) in enumerate(zip(TAIL_POINTS, TAIL_POINTS[1:])):
            ab = p1 - p0
            t = max(0.0, min(1.0, (p - p0).dot(ab) / ab.length_squared))
            d = (p0 + ab * t - p).length
            if d < best:
                best, best_t = d, lengths[i] + ab.length * t
        return best_t

    def color(p: Vector, normal: Vector) -> k.Color:
        u = along(p) / lengths[-1]
        stripe = 0.5 + 0.5 * math.sin(u * 5.5 * 2 * math.pi - 1.2)
        c = mix(FUR, MASK, smoothstep(0.45, 0.55, stripe))
        c = mix(c, MASK, smoothstep(0.86, 0.9, u))
        # Fellspitzen etwas heller.
        return mix(c, CREAM, 0.08 * (0.5 + 0.5 * math.cos(math.atan2(p.x, p.y) * 9)))

    k.paint(tail, color)
    return tail


def build_head():
    head = k.sphere("kopf", tuple(HEAD_CENTER), 0.36, scale=(1.12, 1.0, 0.95), segments=48, rings=28)
    snout = Vector((0, -0.33, -0.07))
    k.deform(head, k.bump(snout, Vector((0, -1, -0.15)), 0.16, 0.17))
    for side in (1, -1):
        k.deform(head, k.bump(Vector((side * 0.3, -0.12, -0.1)), Vector((side, -0.3, -0.25)), 0.07, 0.15))
    # Fellzacken an den Wangen (CHAOS-171): drei spitze Büschel je Seite.
    for side in (1, -1):
        for j, (dz, amt) in enumerate(((-0.02, 0.05), (-0.09, 0.06), (-0.16, 0.04))):
            tip = Vector((side * 0.39, -0.05, dz))
            k.deform(head, k.bump(tip, Vector((side, 0.1, -0.35)), amt, 0.045))
    # Stirn leicht flacher, Hinterkopf runder.
    k.deform(head, lambda p: Vector((p.x, p.y, p.z - 0.03 * max(0.0, p.z) * max(0.0, -p.y) * 4)))

    def color(p: Vector, normal: Vector) -> k.Color:
        c = FUR
        front = smoothstep(-0.12, -0.24, p.y)
        # Helle Schnauze und Wangen unten.
        muzzle = front * (1 - smoothstep(-0.0, 0.03, p.z))
        cheeks = smoothstep(0.2, 0.26, abs(p.x)) * (1 - smoothstep(0.0, 0.04, p.z)) * smoothstep(0.0, -0.15, p.y)
        c = mix(c, CREAM, max(muzzle, cheeks))
        # Maske über den Augen (nicht auf der Schnauze), heller Streifen darüber.
        # Maske: Band über den Augen, unter jedem Auge tropfenförmig nach unten gezogen.
        drop = 0.035 * math.exp(-(((abs(p.x) - 0.15) / 0.07) ** 2))
        band = smoothstep(0.005 - drop, 0.025 - drop, p.z) * (1 - smoothstep(0.13, 0.15, p.z))
        band *= smoothstep(-0.08, -0.16, p.y) * smoothstep(0.03, 0.05, abs(p.x))
        c = mix(c, MASK, band)
        brow = smoothstep(0.155, 0.17, p.z) * (1 - smoothstep(0.215, 0.235, p.z)) * front
        c = mix(c, CREAM, brow * 0.9)
        # Nasenrücken dunkel auslaufend.
        ridge = (1 - smoothstep(0.02, 0.05, abs(p.x))) * smoothstep(-0.3, -0.4, p.y) * smoothstep(-0.12, -0.04, p.z)
        c = mix(c, FUR_DARK, ridge * 0.6)
        return c

    k.paint(head, color)
    return head


def build_ears():
    ears = []
    for side in (1, -1):
        ear = k.sphere(f"ohr-{side}", (side * 0.25, 0.03 + HEAD_BACK, 1.4), 0.12, scale=(1.0, 0.42, 1.25), segments=20, rings=10)
        ear.rotation_euler = (0, math.radians(-side * 22), 0)
        inner = k.sphere(f"ohr-innen-{side}", (side * 0.25, -0.012 + HEAD_BACK, 1.39), 0.085, scale=(1.0, 0.25, 1.15), segments=16, rings=8)
        inner.rotation_euler = (0, math.radians(-side * 22), 0)
        k.paint(ear, lambda p, nrm: mix(FUR, MASK, smoothstep(0.05, 0.13, p.z)))
        k.paint(inner, lambda p, nrm: EAR_INNER)
        ears += [ear, inner]
    return ears


def build_face():
    """Augen (Lederhaut, Iris, Pupille, Glanzpunkt) und Nase – ein glänzendes Teil."""
    parts = []
    for side in (1, -1):
        x = side * 0.13
        parts.append(k.sphere(f"lederhaut-{side}", (x, -0.3 + HEAD_BACK, 1.16), 0.085, scale=(1.0, 0.7, 1.12), segments=20, rings=10))
        parts.append(k.sphere(f"iris-{side}", (x, -0.352 + HEAD_BACK, 1.157), 0.056, scale=(1.0, 0.55, 1.1), segments=20, rings=10))
        parts.append(k.sphere(f"pupille-{side}", (x, -0.378 + HEAD_BACK, 1.156), 0.032, scale=(1.0, 0.5, 1.1), segments=16, rings=8))
        parts.append(k.sphere(f"glanz-{side}", (x + 0.022, -0.395 + HEAD_BACK, 1.19), 0.013, segments=8, rings=6))
    nose = k.sphere("nase", (0, -0.505 + HEAD_BACK, 1.065), 0.052, scale=(1.35, 0.9, 0.9), segments=20, rings=10)
    colors = {"lederhaut": SCLERA, "iris": IRIS, "pupille": PUPIL, "glanz": SCLERA, "nase": NOSE}
    for part in parts + [nose]:
        tone = colors[part.name.split("-")[0]]
        k.paint(part, lambda p, nrm, tone=tone: tone)
    return k.join(parts + [nose], "gesicht")


def build_scarf():
    """Halstuch (CHAOS-171): Band am Hals statt Ring, Knoten vorn rechts mit zwei Zipfeln."""
    rings = []
    for z, r in ((0.765, 0.158), (0.775, 0.168), (0.8, 0.172), (0.825, 0.168), (0.835, 0.158)):
        rings.append([Vector((math.cos(2 * math.pi * i / 40) * r, math.sin(2 * math.pi * i / 40) * r * 0.95, z)) for i in range(40)])
    inner = [[Vector((p.x * 0.88, p.y * 0.88, p.z)) for p in ring] for ring in reversed(rings)]
    band = k.rings_mesh("band", rings + inner, cap_start=False, cap_end=False)
    knot = k.sphere("knoten", (0.09, -0.15, 0.785), 0.05, scale=(1.0, 0.75, 0.85), segments=16, rings=8)
    tails = []
    for i, (dx, dz) in enumerate(((0.035, -0.11), (-0.02, -0.1))):
        frames = k.path_frames([(0.09, -0.165, 0.78), (0.09 + dx * 0.6, -0.19, 0.78 + dz * 0.5), (0.09 + dx, -0.195, 0.78 + dz)], 8, ref=(1, 0, 0))
        tails.append(k.tube(f"zipfel-{i}", frames, lambda fr, a: (0.04 * (1 - 0.35 * fr.t), 0.012), around=12, dome_end=0.4, dome_rings=3))
    return k.join([band, knot, *tails], "halstuch")


def surface_point(head, x: float, z: float, lift: float = 0.0) -> Vector:
    """Punkt auf der Kopfoberfläche, von vorn gesehen bei (x, z) in Weltkoordinaten."""
    origin = Vector((x, -1.0, z)) - HEAD_CENTER
    hit, loc, normal, _ = head.ray_cast(origin, Vector((0, 1, 0)))
    assert hit, (x, z)
    return loc + HEAD_CENTER + normal * lift


def build_mouth_and_whiskers(head):
    """Mund als kleines „w“ unter der Nase und Schnurrhaare (CHAOS-171), Teil des Kopf-Meshes."""
    parts = []

    def stroke(name, points, width, color):
        frames = k.path_frames([tuple(p - HEAD_CENTER) for p in points], max(4, len(points) * 2), ref=(0, 1, 0))
        obj = k.tube(name, frames, lambda fr, a: (width, width), around=6, dome_start=1, dome_end=1, dome_rings=2)
        obj.location = HEAD_CENTER
        return k.solid(obj, color)

    parts.append(stroke("nasenstrich", [surface_point(head, 0, 1.03, -0.002), surface_point(head, 0, 1.0, -0.002)], 0.006, NOSE))
    for side in (1, -1):
        arc = [surface_point(head, side * 0.045 * t, 1.0 - 0.022 * math.sin(t * math.pi) + 0.008 * t, -0.002) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        parts.append(stroke(f"mund-{side}", arc, 0.0065, NOSE))
        for j, (dz, rise) in enumerate(((1.04, 0.02), (1.025, 0.0), (1.01, -0.02))):
            root = surface_point(head, side * 0.085, dz, -0.003)
            tip = root + Vector((side * 0.17, 0.02, rise))
            mid = root.lerp(tip, 0.5) + Vector((0, -0.01, 0.006))
            parts.append(stroke(f"schnurrhaar-{side}-{j}", [root, mid, tip], 0.0035, MASK))
    return parts


def paw_details(body: bpy.types.Object):
    """Finger an den Händen und Zehen an den Füßen, auf die Körperoberfläche gesetzt (Teil des
    Körper-Meshes). Die Skin-Form schrumpft durch die Unterteilung; deshalb die Lage per
    `closest_point_on_mesh` statt fester Koordinaten."""

    def on_surface(q: tuple[float, float, float], sink: float) -> Vector:
        ok, loc, normal, _ = body.closest_point_on_mesh(Vector(q))
        return loc - normal * sink if ok else Vector(q)

    parts = []
    for side in (1, -1):
        for j in range(3):
            dx = (j - 1) * 0.026
            f = on_surface((side * 0.31 + dx, -0.1, 0.44), 0.01)
            t = on_surface((side * 0.13 + dx * 1.2, -0.12, 0.03), 0.012)
            finger = k.sphere(f"finger-{side}-{j}", tuple(f), 0.022, scale=(0.9, 1.0, 1.2), segments=10, rings=6)
            toe = k.sphere(f"zeh-{side}-{j}", tuple(t), 0.025, scale=(1.0, 1.1, 0.8), segments=10, rings=6)
            parts += [k.solid(finger, PAWS), k.solid(toe, PAWS)]
    return parts


def copy_weights(source: bpy.types.Object, target: bpy.types.Object) -> None:
    """Gewichte je Punkt von der nächsten Ecke von `source` übernehmen (gleicher Raum)."""
    from mathutils.kdtree import KDTree

    tree = KDTree(len(source.data.vertices))
    for v in source.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    names = {g.index: g.name for g in source.vertex_groups}
    to_source = source.matrix_world.inverted() @ target.matrix_world
    for v in target.data.vertices:
        _, index, _ = tree.find(to_source @ v.co)
        for g in source.data.vertices[index].groups:
            group = target.vertex_groups.get(names[g.group]) or target.vertex_groups.new(name=names[g.group])
            group.add([v.index], g.weight, "REPLACE")


BONES = [
    k.Bone("root", (0, 0, 0), (0, 0, 0.15), deform=False),
    k.Bone("huepfer", (0, 0, 0.25), (0, 0, 0.5), "root"),
    k.Bone("spine", (0, 0, 0.5), (0, 0, 0.8), "huepfer"),
    k.Bone("kopf", (0, 0, 0.8), (0, 0, 1.3), "spine"),
    k.Bone("abzeichen", (0, -0.21, 0.6), (0, -0.21, 0.68), "spine", deform=False),
    k.Bone("arm-l", (0.17, 0, 0.73), (0.3, -0.07, 0.47), "spine"),
    k.Bone("arm-r", (-0.17, 0, 0.73), (-0.3, -0.07, 0.47), "spine"),
    k.Bone("bein-l", (0.12, 0, 0.32), (0.13, -0.02, 0.06), "huepfer"),
    k.Bone("bein-r", (-0.12, 0, 0.32), (-0.13, -0.02, 0.06), "huepfer"),
    k.Bone("schwanz-1", (0, 0.16, 0.36), (0, 0.35, 0.58), "huepfer"),
    k.Bone("schwanz-2", (0, 0.35, 0.58), (0, 0.34, 0.92), "schwanz-1"),
]
ANIMATED = ["huepfer", "spine", "kopf", "arm-l", "arm-r", "bein-l", "bein-r", "schwanz-1", "schwanz-2"]


def tail_extra(name: str, p: float) -> k.Pose:
    """Buschschwanz: wedelt im Stand, schwingt beim Laufen, hängt bei Trauer."""
    from clips import s

    amp = {"idle": 1.0, "run": 1.4, "cheer": 1.6}.get(name, 0.6)
    cycles = {"run": 2, "cheer": 3}.get(name, 1)
    pose: k.Pose = {
        "schwanz-1": {"rot": (0, 0, 10 * amp * s(p, cycles))},
        "schwanz-2": {"rot": (6 * amp * s(p, cycles, 0.1), 0, 16 * amp * s(p, cycles, -0.15))},
    }
    if name == "sad":
        pose = {"schwanz-1": {"rot": (35, 0, 0)}, "schwanz-2": {"rot": (25, 0, 0)}}
    if name == "jump":
        pose = {"schwanz-1": {"rot": (-25 * s(p, 0.5), 0, 0)}}
    if name == "hit":
        pose = {"schwanz-1": {"rot": (30, 0, 0)}}
    return pose


def build() -> None:
    k.reset()
    fur = k.material("fell", vertex_colors=True, roughness=0.8, sheen=0.5, subsurface=0.05)
    gloss = k.material("glanz", vertex_colors=True, roughness=0.08, coat=1.0)
    accent = k.material("akzent", color=SCARF, roughness=0.65, sheen=0.3)

    body = build_body()
    tail = build_tail()
    head = build_head()
    ears = build_ears()
    details = build_mouth_and_whiskers(head)
    head = k.join([head, *ears, *details], "kopf-mesh")
    face = build_face()
    scarf = build_scarf()
    for obj in (body, tail, head):
        k.assign(obj, fur)
    k.assign(face, gloss)
    k.assign(scarf, accent)

    rig = k.armature("wusel", BONES)
    body_tail = k.join([body, tail], "wusel-koerper")
    k.skin_to(body_tail, rig)
    # Finger und Zehen übernehmen die Gewichte der nächsten Körperstelle (Wärmeverteilung
    # erreicht lose Teile nicht sauber).
    paws = paw_details(body_tail)
    for paw in paws:
        k.assign(paw, fur)
        copy_weights(body_tail, paw)
    body_tail = k.join([body_tail, *paws], "wusel-koerper")
    k.attach(head, rig, "kopf")
    k.attach(face, rig, "kopf")
    k.attach(scarf, rig, "spine")
    k.bake_clips(rig, standard_clips(tail_extra), ANIMATED)
