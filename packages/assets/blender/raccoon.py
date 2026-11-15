"""
Wusel, der Waschbär (CHAOS-58): neu modelliert für den Look „Stilisierte Natur“.

Großer Kopf mit Schnauze und Fellwangen, dunkle Maske, große glänzende Augen, geringelter
Buschschwanz, Halstuch in Slot-Farbe (Material `akzent`). Höhe ≈ 1,55, Füße bei 0, Blick -Y.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from mathutils import Vector

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

HEAD_CENTER = Vector((0.0, 0.0, 1.1))


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
        if p.z < 0.11:
            c = mix(c, PAWS, smoothstep(0.11, 0.08, p.z))
        if abs(p.x) > 0.24 and p.z < 0.56:
            c = mix(c, PAWS, smoothstep(0.56, 0.5, p.z))
        # Etwas dunkler am Rücken.
        c = mix(c, FUR_DARK, smoothstep(0.05, 0.2, p.y) * 0.35)
        return c

    k.paint(body, color)
    return body


TAIL_POINTS = [
    Vector((0, 0.18, 0.36)),
    Vector((0, 0.34, 0.42)),
    Vector((0, 0.47, 0.58)),
    Vector((0, 0.51, 0.77)),
    Vector((0, 0.46, 0.92)),
]


def build_tail():
    n = k.SkinNode
    radii = [0.07, 0.11, 0.13, 0.11, 0.06]
    nodes = [n(tuple(p), r, None if i == 0 else i - 1) for i, (p, r) in enumerate(zip(TAIL_POINTS, radii))]
    tail = k.skin_mesh("schwanz", nodes, subdivisions=2)

    lengths = [0.0]
    for a, b in zip(TAIL_POINTS, TAIL_POINTS[1:]):
        lengths.append(lengths[-1] + (b - a).length)

    def along(p: Vector) -> float:
        best, best_t = 1e9, 0.0
        for i, (a, b) in enumerate(zip(TAIL_POINTS, TAIL_POINTS[1:])):
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            d = (a + ab * t - p).length
            if d < best:
                best, best_t = d, lengths[i] + ab.length * t
        return best_t

    def color(p: Vector, normal: Vector) -> k.Color:
        s = along(p)
        stripe = 0.5 + 0.5 * math.sin(s * 34.0)
        c = mix(FUR, MASK, smoothstep(0.55, 0.8, stripe))
        return mix(c, MASK, smoothstep(0.7, 0.8, s / lengths[-1]))

    k.paint(tail, color)
    return tail


def build_head():
    head = k.sphere("kopf", tuple(HEAD_CENTER), 0.36, scale=(1.12, 1.0, 0.95), segments=64, rings=32)
    snout = Vector((0, -0.33, -0.07))
    k.deform(head, k.bump(snout, Vector((0, -1, -0.15)), 0.16, 0.17))
    for side in (1, -1):
        k.deform(head, k.bump(Vector((side * 0.3, -0.12, -0.1)), Vector((side, -0.3, -0.25)), 0.07, 0.15))
    # Stirn leicht flacher, Hinterkopf runder.
    k.deform(head, lambda p: Vector((p.x, p.y, p.z - 0.03 * max(0.0, p.z) * max(0.0, -p.y) * 4)))

    def color(p: Vector, normal: Vector) -> k.Color:
        c = FUR
        front = smoothstep(-0.12, -0.24, p.y)
        # Helle Schnauze und Wangen unten.
        muzzle = front * (1 - smoothstep(-0.02, 0.05, p.z))
        cheeks = smoothstep(0.18, 0.3, abs(p.x)) * (1 - smoothstep(-0.02, 0.06, p.z)) * smoothstep(0.0, -0.15, p.y)
        c = mix(c, CREAM, max(muzzle, cheeks))
        # Maske über den Augen (nicht auf der Schnauze), heller Streifen darüber.
        band = smoothstep(-0.02, 0.03, p.z) * (1 - smoothstep(0.12, 0.16, p.z))
        band *= smoothstep(-0.05, -0.18, p.y) * smoothstep(0.02, 0.06, abs(p.x))
        c = mix(c, MASK, band)
        brow = smoothstep(0.15, 0.18, p.z) * (1 - smoothstep(0.21, 0.24, p.z)) * front
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
        ear = k.sphere(f"ohr-{side}", (side * 0.25, 0.03, 1.4), 0.12, scale=(1.0, 0.42, 1.25), segments=32, rings=16)
        ear.rotation_euler = (0, math.radians(-side * 22), 0)
        inner = k.sphere(f"ohr-innen-{side}", (side * 0.25, -0.012, 1.39), 0.085, scale=(1.0, 0.25, 1.15), segments=24, rings=12)
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
        parts.append(k.sphere(f"lederhaut-{side}", (x, -0.3, 1.16), 0.085, scale=(1.0, 0.7, 1.12)))
        parts.append(k.sphere(f"iris-{side}", (x, -0.352, 1.157), 0.056, scale=(1.0, 0.55, 1.1)))
        parts.append(k.sphere(f"pupille-{side}", (x, -0.378, 1.156), 0.032, scale=(1.0, 0.5, 1.1)))
        parts.append(k.sphere(f"glanz-{side}", (x + 0.022, -0.395, 1.19), 0.013, segments=12, rings=8))
    nose = k.sphere("nase", (0, -0.505, 1.065), 0.052, scale=(1.35, 0.9, 0.9))
    colors = {"lederhaut": SCLERA, "iris": IRIS, "pupille": PUPIL, "glanz": SCLERA, "nase": NOSE}
    for part in parts + [nose]:
        tone = colors[part.name.split("-")[0]]
        k.paint(part, lambda p, nrm, tone=tone: tone)
    return k.join(parts + [nose], "gesicht")


def build_scarf():
    ring = k.torus("halstuch", (0, 0, 0.83), 0.165, 0.055)
    ring.scale = (1.0, 1.0, 0.75)
    knot = k.sphere("knoten", (0.09, -0.17, 0.79), 0.07, scale=(1.0, 0.7, 0.9))
    tip = k.sphere("zipfel", (0.12, -0.19, 0.7), 0.06, scale=(0.8, 0.4, 1.4))
    tip.rotation_euler = (0, math.radians(-20), 0)
    return k.join([ring, knot, tip], "halstuch")


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
    k.Bone("schwanz-1", (0, 0.18, 0.36), (0, 0.45, 0.55), "huepfer"),
    k.Bone("schwanz-2", (0, 0.45, 0.55), (0, 0.47, 0.92), "schwanz-1"),
]
ANIMATED = ["huepfer", "spine", "kopf", "arm-l", "arm-r", "bein-l", "bein-r", "schwanz-1", "schwanz-2"]


def wave(seconds: float, steps: int, pose_at) -> list[tuple[float, k.Pose]]:
    return [(seconds * i / steps, pose_at(i / steps)) for i in range(steps + 1)]


def s(phase: float, cycles: float = 1, offset: float = 0) -> float:
    return math.sin((phase * cycles + offset) * 2 * math.pi)


def tail_sway(phase: float, amp: float = 1.0) -> k.Pose:
    return {
        "schwanz-1": {"rot": (0, 0, 10 * amp * s(phase))},
        "schwanz-2": {"rot": (6 * amp * s(phase, 1, 0.1), 0, 16 * amp * s(phase, 1, -0.15))},
    }


def clips() -> list[k.Clip]:
    out: list[k.Clip] = []

    def idle(p: float) -> k.Pose:
        pose: k.Pose = {
            "huepfer": {"scale": (1.0 - 0.012 * s(p, 2), 1.0 + 0.02 * s(p, 2), 1.0 - 0.012 * s(p, 2))},
            "spine": {"rot": (2 * s(p), 0, 1.5 * s(p, 1, 0.25))},
            "kopf": {"rot": (3 * s(p, 1, 0.1), 6 * s(p, 1, 0.3), 4 * s(p, 1))},
            "arm-l": {"rot": (4 * s(p, 2), 0, -3)},
            "arm-r": {"rot": (4 * s(p, 2, 0.5), 0, 3)},
        }
        pose.update(tail_sway(p))
        return pose

    out.append(k.Clip("idle", 2.4, wave(2.4, 24, idle), loop=True))

    def run(p: float) -> k.Pose:
        pose: k.Pose = {
            "huepfer": {"loc": (0, 0.05 * abs(s(p)), 0)},
            "spine": {"rot": (12, 6 * s(p), 0)},
            "kopf": {"rot": (-8, -6 * s(p), 0)},
            "bein-l": {"rot": (-40 * s(p), 0, 0)},
            "bein-r": {"rot": (40 * s(p), 0, 0)},
            "arm-l": {"rot": (45 * s(p), 0, 0)},
            "arm-r": {"rot": (-45 * s(p), 0, 0)},
        }
        pose.update(tail_sway(p * 2, 1.4))
        return pose

    out.append(k.Clip("run", 0.5, wave(0.5, 10, run), loop=True))

    rest: k.Pose = {}
    squash = {"huepfer": {"scale": (1.18, 0.78, 1.18)}}
    out.append(
        k.Clip(
            "jump",
            0.8,
            [
                (0.0, rest),
                (0.1, {**squash, "arm-l": {"rot": (-20, 0, 0)}, "arm-r": {"rot": (-20, 0, 0)}}),
                (
                    0.38,
                    {
                        "huepfer": {"loc": (0, 0.55, 0), "scale": (0.9, 1.15, 0.9)},
                        "arm-l": {"rot": (0, 0, -70)},
                        "arm-r": {"rot": (0, 0, 70)},
                        "bein-l": {"rot": (25, 0, 0)},
                        "bein-r": {"rot": (25, 0, 0)},
                        "schwanz-1": {"rot": (-25, 0, 0)},
                    },
                ),
                (0.62, squash),
                (0.8, rest),
            ],
        )
    )
    out.append(
        k.Clip(
            "hit",
            0.7,
            [
                (0.0, rest),
                (
                    0.12,
                    {
                        "huepfer": {"scale": (1.15, 0.8, 1.15), "loc": (0, -0.03, 0)},
                        "spine": {"rot": (-22, 0, 8)},
                        "kopf": {"rot": (-15, 0, 18)},
                        "arm-l": {"rot": (0, 0, -55)},
                        "arm-r": {"rot": (0, 0, 55)},
                        "schwanz-1": {"rot": (30, 0, 0)},
                    },
                ),
                (0.35, {"spine": {"rot": (6, 0, -4)}, "kopf": {"rot": (5, 0, -8)}}),
                (0.7, rest),
            ],
        )
    )

    def cheer(p: float) -> k.Pose:
        hop = max(0.0, s(p, 2)) * 0.32
        pose: k.Pose = {
            "huepfer": {"loc": (0, hop, 0), "rot": (0, 360 * smoothstep(0.15, 0.65, p), 0)},
            "arm-l": {"rot": (0, 0, -150 + 15 * s(p, 4))},
            "arm-r": {"rot": (0, 0, 150 - 15 * s(p, 4))},
            "kopf": {"rot": (-12, 0, 8 * s(p, 2))},
            "bein-l": {"rot": (20 * max(0.0, s(p, 2)), 0, 0)},
            "bein-r": {"rot": (20 * max(0.0, s(p, 2)), 0, 0)},
        }
        pose.update(tail_sway(p * 3, 1.6))
        if p >= 0.999:
            return {}
        return pose

    out.append(k.Clip("cheer", 1.5, wave(1.5, 30, cheer)))

    def sad(p: float) -> k.Pose:
        w = smoothstep(0.0, 0.3, p) * (1 - smoothstep(0.8, 1.0, p))
        return {
            "huepfer": {"scale": (1 + 0.05 * w, 1 - 0.08 * w, 1 + 0.05 * w)},
            "spine": {"rot": (22 * w, 0, 0)},
            "kopf": {"rot": (28 * w, 0, 10 * w * s(p, 1.5))},
            "arm-l": {"rot": (8 * w, 0, 6 * w)},
            "arm-r": {"rot": (8 * w, 0, -6 * w)},
            "schwanz-1": {"rot": (35 * w, 0, 0)},
            "schwanz-2": {"rot": (25 * w, 0, 0)},
        }

    out.append(k.Clip("sad", 1.6, wave(1.6, 16, sad)))

    out.append(
        k.Clip(
            "fall",
            1.1,
            [
                (0.0, rest),
                (0.15, {"huepfer": {"rot": (-15, 0, 0)}, "arm-l": {"rot": (0, 0, -80)}, "arm-r": {"rot": (0, 0, 80)}}),
                (
                    0.45,
                    {
                        "huepfer": {"rot": (0, 0, 85), "loc": (0, -0.12, 0)},
                        "kopf": {"rot": (0, 0, 15)},
                        "bein-l": {"rot": (-30, 0, 0)},
                        "bein-r": {"rot": (20, 0, 0)},
                    },
                ),
                (0.75, {"huepfer": {"rot": (0, 0, 80), "loc": (0, -0.12, 0)}}),
                (1.1, rest),
            ],
        )
    )
    return out


def build() -> None:
    k.reset()
    fur = k.material("fell", vertex_colors=True, roughness=0.8, sheen=0.5, subsurface=0.05)
    gloss = k.material("glanz", vertex_colors=True, roughness=0.08, coat=1.0)
    accent = k.material("akzent", color=SCARF, roughness=0.65, sheen=0.3)

    body = build_body()
    tail = build_tail()
    head = build_head()
    ears = build_ears()
    head = k.join([head, *ears], "kopf-mesh")
    face = build_face()
    scarf = build_scarf()
    for obj in (body, tail, head):
        k.assign(obj, fur)
    k.assign(face, gloss)
    k.assign(scarf, accent)

    rig = k.armature("wusel", BONES)
    body_tail = k.join([body, tail], "wusel-koerper")
    k.skin_to(body_tail, rig)
    k.attach(head, rig, "kopf")
    k.attach(face, rig, "kopf")
    k.attach(scarf, rig, "spine")
    k.bake_clips(rig, clips(), ANIMATED)
