"""
Kalle Kaktus (CHAOS-58): cooler Saguaro im Tontopf – gerippter, weicher Körper mit
Saguaro-Armen, Sonnenbrille, gelbe Blüte auf dem Kopf, Halstuch in Slot-Farbe. Hüpft im
Topf (keine Beine). Höhe ≈ 1,7.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import s, smoothstep, standard_clips
from mathutils import Vector

GREEN = k.hex_color("#5aa548")
GREEN_DARK = k.hex_color("#2f6b32")
GREEN_LIGHT = k.hex_color("#9bd16a")
SPINE = k.hex_color("#f4ecd2")
CLAY = k.hex_color("#cf7146")
CLAY_DARK = k.hex_color("#9c4d2c")
SOIL = k.hex_color("#4b3424")
LENS = k.hex_color("#121219")
PETAL = k.hex_color("#ffd23f")
PETAL_CORE = k.hex_color("#f08a24")
MOUTH = k.hex_color("#1c3a1f")

RIBS = 8


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


class Axis:
    """Achse einer Rippen-Gruppe: Polylinie, Radius (für die Zuordnung) und Rippentiefe."""

    def __init__(self, points, radius: float, depth: float):
        self.points = [Vector(p) for p in points]
        self.radius = radius
        self.depth = depth

    def nearest(self, p: Vector):
        """Nächster Achsenpunkt, Abstand und Winkel um die Achse (in ihrer Normalebene)."""
        best = None
        for a, b in zip(self.points, self.points[1:]):
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            c = a + ab * t
            d = (p - c).length
            if best is None or d < best[1]:
                best = (c, d, ab.normalized())
        c, d, axis = best
        # Feste Bezugsrichtung je Achse: Weltachse mit dem kleinsten Anteil an der Achse.
        ref = min((Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))), key=lambda v: abs(v.dot(axis)))
        u = (ref - axis * ref.dot(axis)).normalized()
        v = axis.cross(u)
        r = p - c
        return c, d, math.atan2(r.dot(v), r.dot(u))


def ribbed(obj, axes):
    """Rippen: radiale Wellen um die nächste Achse (Rumpf bzw. Arm).

    CHAOS-161: Der Winkel wird in der Normalebene der jeweiligen Achse gemessen (vorher immer um
    die Rumpfachse, das verbog die Arme), und die Rippenzahl muss zu den Punkten rundum passen:
    16 Punkte bei 8 Rippen (Grat, Rille, Grat …). Mit 10 Rippen auf 16 Punkten entstand Aliasing,
    der Rumpf sah zerknittert aus.
    Gibt eine Funktion zurück, die je Punkt die Rippenphase (1 = Grat, 0 = Rille) liefert.
    """

    def pick(p: Vector):
        return min((a.nearest(p) + (a,) for a in axes), key=lambda n: n[1] / n[3].radius)

    def fn(p: Vector) -> Vector:
        c, d, angle, axis = pick(p)
        if d < 1e-6:
            return p
        return p + (p - c).normalized() * axis.depth * math.cos(angle * RIBS)

    def phase(p: Vector) -> float:
        _, _, angle, _ = pick(p)
        return 0.5 + 0.5 * math.cos(angle * RIBS)

    k.deform(obj, fn)
    return phase


def body():
    n = k.SkinNode
    trunk = [
        # Unterstes Ende tief im Topf (CHAOS-161): Die abgerundete Kuppel liegt unter der Erde
        # (z 0,42), sonst zieht der Rumpf über dem Topfrand ein und die Rippen knittern dort.
        n((0, 0, 0.16), 0.2),
        n((0, 0, 0.62), 0.24, 0),
        n((0, 0, 0.95), 0.24, 1),
        n((0, 0, 1.25), 0.22, 2),
        n((0, 0, 1.5), 0.15, 3),
    ]
    arms = [
        # links: vom Rumpf nach außen, dann nach oben
        n((0.2, 0, 0.86), 0.08, 2),
        n((0.33, 0, 0.88), 0.082, 5),
        n((0.38, 0, 1.06), 0.078, 6),
        n((0.38, 0, 1.18), 0.06, 7),
        # rechts: tiefer, kürzer
        n((-0.2, 0, 0.74), 0.075, 1),
        n((-0.32, 0, 0.76), 0.076, 9),
        n((-0.36, 0, 0.92), 0.07, 10),
        n((-0.36, 0, 1.01), 0.055, 11),
    ]
    mesh = k.skin_mesh("kaktus", trunk + arms, subdivisions=2)
    ridge_of = ribbed(
        mesh,
        [
            Axis([(0, 0, 0.1), (0, 0, 1.6)], 0.24, 0.03),
            # Arme ab der Rumpfoberfläche, sonst ziehen sie Rumpfpunkte an sich.
            Axis([(0.26, 0, 0.865), (0.33, 0, 0.88), (0.38, 0, 1.06), (0.38, 0, 1.25)], 0.08, 0.014),
            Axis([(-0.26, 0, 0.75), (-0.32, 0, 0.76), (-0.36, 0, 0.92), (-0.36, 0, 1.07)], 0.075, 0.014),
        ],
    )

    def color(p: Vector, normal: Vector):
        # Rillen dunkler, Grate heller, Dornen als helle Punkte auf den Graten.
        r = Vector((p.x, p.y, 0))
        ridge = ridge_of(p)
        c = mix(GREEN_DARK, GREEN, smoothstep(0.1, 0.7, ridge))
        c = mix(c, GREEN_LIGHT, smoothstep(0.85, 1.0, ridge) * 0.6)
        c = mix(c, GREEN_LIGHT, smoothstep(1.2, 1.45, p.z) * 0.35)
        if ridge > 0.93 and (math.sin(p.z * 70) > 0.82) and r.length > 0.12:
            c = SPINE
        return c

    k.paint(mesh, color)
    return mesh


def pot():
    clay = k.lathe(
        "topf",
        [(0.0, 0.0), (0.24, 0.0), (0.26, 0.03), (0.31, 0.36), (0.36, 0.37), (0.37, 0.46), (0.33, 0.47), (0.31, 0.42), (0.0, 0.42)],
        segments=40,
    )

    def color(p, n):
        c = mix(CLAY_DARK, CLAY, smoothstep(0.0, 0.3, p.z))
        if p.z > 0.415 and math.hypot(p.x, p.y) < 0.31:
            return SOIL
        return c

    k.paint(clay, color)
    return clay


def glasses():
    parts = []
    for side in (1, -1):
        lens = k.sphere(f"glas-{side}", (side * 0.1, -0.235, 1.22), 0.085, scale=(1.15, 0.35, 0.82), segments=20, rings=10)
        parts.append(k.solid(lens, LENS))
    bridge = k.cylinder("steg", (0, -0.25, 1.235), 0.012, 0.06, segments=8, axis="X")
    parts.append(k.solid(bridge, LENS))
    for side in (1, -1):
        arm = k.cylinder(f"buegel-{side}", (side * 0.2, -0.12, 1.24), 0.01, 0.24, segments=6, axis="Y")
        parts.append(k.solid(arm, LENS))
    smile = k.torus("mund", (0, -0.235, 1.06), 0.07, 0.016, segments=24, sides=6)
    smile.rotation_euler = (math.radians(90), 0, 0)
    for v in smile.data.vertices:
        if v.co.y > 0.0:
            v.co.y *= 0.15
    parts.append(k.solid(smile, MOUTH))
    return k.join(parts, "gesicht")


def flower():
    parts = []
    for i in range(5):
        a = 2 * math.pi * i / 5
        petal = k.sphere(f"blatt-{i}", (math.cos(a) * 0.075, math.sin(a) * 0.075, 1.49), 0.06, scale=(1.3, 0.75, 0.35), segments=16, rings=8)
        petal.rotation_euler = (0, math.radians(-15), a)
        parts.append(k.solid(petal, PETAL))
    core = k.sphere("kern", (0, 0, 1.51), 0.04, segments=12, rings=6)
    parts.append(k.solid(core, PETAL_CORE))
    return k.join(parts, "bluete")


def scarf():
    ring = k.torus("halstuch", (0, 0, 0.98), 0.235, 0.05, segments=36, sides=10)
    ring.scale = (1.0, 1.0, 0.7)
    knot = k.sphere("knoten", (-0.12, -0.21, 0.95), 0.07, scale=(1.0, 0.7, 0.9), segments=16, rings=8)
    tip = k.sphere("zipfel", (-0.15, -0.22, 0.86), 0.06, scale=(0.8, 0.4, 1.4), segments=16, rings=8)
    return k.join([ring, knot, tip], "halstuch")


def arm_weights_off_trunk(obj) -> None:
    """Arm-Gewichte nur außerhalb des Rumpfs (CHAOS-161).

    Die automatischen Gewichte geben dem Rumpf bis hinunter zum Topf rund die Hälfte an
    `arm-r` bzw. `arm-l`; schwingt ein Arm, knittert der Rumpf mit. Gewicht der Arme ausblenden,
    solange |x| im Rumpf liegt (Radius 0,24 plus Rippen), Rest wieder auf 1 normieren.
    """
    groups = {g.index: g.name for g in obj.vertex_groups}
    spine = obj.vertex_groups["spine"]
    for v in obj.data.vertices:
        for ge in v.groups:
            name = groups[ge.group]
            if name in ("arm-l", "arm-r"):
                side = 1 if name == "arm-l" else -1
                ge.weight *= smoothstep(0.22, 0.3, v.co.x * side)
        total = sum(ge.weight for ge in v.groups)
        if total < 1e-6:
            spine.add([v.index], 1.0, "REPLACE")
            continue
        for ge in v.groups:
            ge.weight /= total


BONES = [
    k.Bone("root", (0, 0, 0), (0, 0, 0.15), deform=False),
    k.Bone("huepfer", (0, 0, 0.1), (0, 0, 0.42), "root"),
    k.Bone("spine", (0, 0, 0.42), (0, 0, 0.95), "huepfer"),
    k.Bone("kopf", (0, 0, 0.95), (0, 0, 1.47), "spine"),
    k.Bone("bluete", (0, 0, 1.47), (0, 0, 1.63), "kopf"),
    k.Bone("abzeichen", (0, -0.25, 0.68), (0, -0.25, 0.76), "spine", deform=False),
    k.Bone("arm-l", (0.2, 0, 0.86), (0.38, 0, 1.18), "spine"),
    k.Bone("arm-r", (-0.2, 0, 0.74), (-0.36, 0, 1.01), "spine"),
]
ANIMATED = ["huepfer", "spine", "kopf", "bluete", "arm-l", "arm-r"]


def extra(name: str, p: float) -> k.Pose:
    """Blüte wippt nach."""
    amp = {"idle": 6, "run": 16, "jump": 25, "hit": 30, "cheer": 20, "fall": 25}.get(name, 8)
    pose: k.Pose = {"bluete": {"rot": (amp * s(p, 2, 0.25), 0, amp * 0.8 * s(p, 2))}}
    if name == "sad":
        pose = {"bluete": {"rot": (30 * min(1.0, p * 3), 0, 0)}}
    return pose


def build() -> None:
    k.reset()
    skin = k.material("kaktus", vertex_colors=True, roughness=0.55, subsurface=0.08, coat=0.15)
    clay = k.material("ton", vertex_colors=True, roughness=0.85)
    gloss = k.material("glanz", vertex_colors=True, roughness=0.05, coat=1.0)
    petals = k.material("bluete", vertex_colors=True, roughness=0.6, sheen=0.4, subsurface=0.1)
    accent = k.material("akzent", color=k.hex_color("#e69f00"), roughness=0.65, sheen=0.3)

    rig = k.armature("kalle", BONES)
    cactus = body()
    k.assign(cactus, skin)
    k.skin_to(cactus, rig)
    arm_weights_off_trunk(cactus)
    clay_pot = pot()
    k.assign(clay_pot, clay)
    k.attach(clay_pot, rig, "huepfer")
    face = glasses()
    k.assign(face, gloss)
    k.attach(face, rig, "kopf")
    bloom = flower()
    k.assign(bloom, petals)
    k.attach(bloom, rig, "bluete")
    cloth = scarf()
    k.assign(cloth, accent)
    k.attach(cloth, rig, "spine")
    k.bake_clips(rig, standard_clips(extra, legs=False), ANIMATED)
