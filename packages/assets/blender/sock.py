"""
Socke Sigi (CHAOS-58): weiche Strick-Socke als „L“ aus Schaft und Fuß, Ringel-Streifen,
dunkle Ferse und Spitze, zwei ungleiche Knopfaugen, gestickter Mund, Rippbündchen in
Slot-Farbe. Hüpft (keine Beine, keine Arme) und biegt sich weich. Höhe ≈ 1,5.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import smoothstep, standard_clips
from mathutils import Vector

CREAM = k.hex_color("#f3ece0")
STRIPE = k.hex_color("#e05a4a")
PATCH = k.hex_color("#b8423a")
BUTTON_A = k.hex_color("#7a3f2c")
BUTTON_B = k.hex_color("#3f6fb0")
THREAD = k.hex_color("#3a2a28")


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def sock():
    n = k.SkinNode
    nodes = [
        n((0, 0.06, 0.26), 0.22),  # 0 Ferse
        n((0, 0.04, 0.62), 0.205, 0),  # 1
        n((0, 0.03, 1.0), 0.2, 1),  # 2
        n((0, 0.04, 1.3), 0.2, 2),  # 3 unter dem Bündchen
        n((0, -0.16, 0.18), 0.18, 0),  # 4 Fuß
        n((0, -0.36, 0.16), 0.15, 4),  # 5 Spitze
        # 6 im Bündchen (CHAOS-161): Skin + Subdivision runden das Ende etwa um den Radius ab.
        # Ohne diesen Knoten endet der Schaft als Kuppel, die am Rand schon bei z ≈ 1,07 einzieht,
        # und das Bündchen ab z 1,30 schwebt darüber.
        n((0, 0.04, 1.44), 0.2, 3),
    ]
    mesh = k.skin_mesh("socke", nodes, subdivisions=2)

    def color(p: Vector, normal: Vector):
        # Ringel nur am Schaft.
        stripe = 0.5 + 0.5 * math.sin(p.z * 26)
        c = mix(CREAM, STRIPE, smoothstep(0.55, 0.75, stripe) * smoothstep(0.42, 0.5, p.z))
        # Ferse hinten unten, Spitze vorn.
        heel = smoothstep(0.08, 0.2, p.y) * (1 - smoothstep(0.32, 0.42, p.z))
        toe = smoothstep(-0.3, -0.42, p.y)
        c = mix(c, PATCH, max(heel, toe))
        # Strick-Maschen: feines Muster aus Helligkeit.
        knit = 0.94 + 0.06 * math.sin(p.z * 220) * math.sin(math.atan2(p.y, p.x) * 40)
        return (c[0] * knit, c[1] * knit, c[2] * knit)

    k.paint(mesh, color)
    return mesh


def cuff():
    # Boden der Öffnung bei 1,45: Darunter steckt das Schaftende (Knoten 6 in `sock`).
    ring = k.lathe("buendchen", [(0.0, 1.27), (0.2, 1.27), (0.215, 1.31), (0.215, 1.5), (0.19, 1.52), (0.17, 1.5), (0.17, 1.45), (0.0, 1.45)], segments=48)

    def ribs(p: Vector) -> Vector:
        r = math.hypot(p.x, p.y)
        if r < 0.16:
            return p
        a = math.atan2(p.y, p.x)
        f = 1 + 0.035 * math.cos(a * 24)
        return Vector((p.x * f, p.y * f, p.z))

    k.deform(ring, ribs)
    # Mittig auf das Schaftende (Knoten 3 und 6 liegen bei y = 0,04), sonst steht vorn eine Lippe über.
    k.deform(ring, lambda p: p + Vector((0, 0.04, 0)))
    return ring


def button(name, at, radius, color):
    disc = k.cylinder(name, at, radius, 0.03, segments=24, axis="Y")
    rim = k.torus(f"{name}-rand", (at[0], at[1] - 0.012, at[2]), radius * 0.85, radius * 0.16, segments=24, sides=6)
    rim.rotation_euler = (math.radians(90), 0, 0)
    holes = []
    for dx, dz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        h = k.sphere(f"{name}-loch", (at[0] + dx * radius * 0.28, at[1] - 0.016, at[2] + dz * radius * 0.28), radius * 0.12, segments=8, rings=4)
        holes.append(k.solid(h, THREAD))
    k.solid(disc, color)
    k.solid(rim, mix(color, (1, 1, 1), 0.15))
    return [disc, rim, *holes]


def face():
    parts = []
    parts += button("knopf-l", (0.085, -0.205, 1.08), 0.055, BUTTON_A)
    parts += button("knopf-r", (-0.095, -0.2, 1.1), 0.07, BUTTON_B)
    smile = k.torus("mund", (0, -0.2, 0.96), 0.075, 0.012, segments=24, sides=6)
    smile.rotation_euler = (math.radians(90), 0, 0)
    for v in smile.data.vertices:
        if v.co.y > 0.0:
            v.co.y *= 0.15
    parts.append(k.solid(smile, THREAD))
    return k.join(parts, "gesicht")


BONES = [
    k.Bone("root", (0, 0, 0), (0, 0, 0.15), deform=False),
    k.Bone("huepfer", (0, 0.02, 0.1), (0, 0.04, 0.45), "root"),
    k.Bone("spine", (0, 0.04, 0.45), (0, 0.03, 0.85), "huepfer"),
    k.Bone("kopf", (0, 0.03, 0.85), (0, 0.04, 1.4), "spine"),
    k.Bone("abzeichen", (0, -0.2, 0.62), (0, -0.2, 0.7), "spine", deform=False),
]
ANIMATED = ["huepfer", "spine", "kopf"]


def extra(name: str, p: float) -> k.Pose:
    return {}


def build() -> None:
    k.reset()
    knit = k.material("strick", vertex_colors=True, roughness=0.9, sheen=0.7)
    gloss = k.material("knopf", vertex_colors=True, roughness=0.2, coat=0.8)
    accent = k.material("akzent", color=k.hex_color("#cc79a7"), roughness=0.85, sheen=0.6)

    rig = k.armature("sigi", BONES)
    body = sock()
    k.assign(body, knit)
    band = cuff()
    k.assign(band, accent)
    k.skin_to(body, rig)
    k.skin_to(band, rig)
    eyes = face()
    k.assign(eyes, gloss)
    k.attach(eyes, rig, "kopf")
    k.bake_clips(rig, standard_clips(extra, legs=False, arms=False), ANIMATED)
