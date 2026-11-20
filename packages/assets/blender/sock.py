"""
Socke Sigi (CHAOS-58): weiche Strick-Socke als „L“ aus Schaft und Fuß, Ringel-Streifen,
dunkle Ferse und Spitze, zwei ungleiche Knopfaugen, gestickter Mund, Rippbündchen in
Slot-Farbe. Hüpft (keine Beine, keine Arme) und biegt sich weich. Höhe ≈ 1,5.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import smoothstep, standard_clips
from mathutils import Vector  # noqa: E402

CREAM = k.hex_color("#f3ece0")
STRIPE = k.hex_color("#e05a4a")
PATCH = k.hex_color("#b8423a")
BUTTON_A = k.hex_color("#7a3f2c")
BUTTON_B = k.hex_color("#3f6fb0")
THREAD = k.hex_color("#3a2a28")
CHEEK = k.hex_color("#f2a0a0")


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


# CHAOS-162: Die Socke ist eine Röhre entlang einer geschwungenen Mittellinie statt eines
# Skin-Körpers. So hat sie eine klare Sockenform (gerader Schaft, runde Ferse hinten unten, flacher
# Fuß, Spitze vorn) und genug Ringe für scharfe Ringel und feine Strickrippen.
PATH = [
    (0, 0.04, 1.44),  # im Bündchen (CHAOS-161: das Schaftende steckt im Bündchen)
    (0, 0.04, 1.1),
    (0, 0.045, 0.72),
    (0, 0.035, 0.44),
    (0, -0.02, 0.25),
    (0, -0.13, 0.165),
    (0, -0.265, 0.15),
    (0, -0.345, 0.15),
]
AROUND = 48
RINGS = 74
LEG_R = 0.2
KNIT_RIBS = 24
HEEL = Vector((0, 0.15, 0.17))
FOOT_START = 0.6
"""Anteil der Länge, ab dem der Querschnitt zum Fuß wird."""


def section(t: float) -> tuple[float, float]:
    """Halbachsen (Breite, Höhe) des Querschnitts entlang der Socke (t = 0 oben, 1 Spitze)."""
    foot = smoothstep(FOOT_START, 0.8, t)
    rx = LEG_R + (0.178 - LEG_R) * foot - 0.03 * smoothstep(0.9, 1.0, t)
    rv = LEG_R + (0.14 - LEG_R) * foot - 0.015 * smoothstep(0.9, 1.0, t)
    return rx, rv


def sock():
    frames = k.path_frames(PATH, RINGS)

    def radius(fr: k.Frame, a: float):
        rx, rv = section(fr.t)
        # Strickrippen: zwei Punkte je Rippe, am Schaft deutlich, am Fuß nur angedeutet.
        knit = 1 + 0.02 * math.cos(a * KNIT_RIBS) * (1 - 0.6 * smoothstep(0.55, 0.7, fr.t))
        return rx * knit, rv * knit

    mesh = k.tube("socke", frames, radius, around=AROUND, dome_end=0.95, dome_rings=6)

    def shape(p: Vector) -> Vector:
        # Ferse: runde Ausbeulung hinten unten.
        p = k.bump(HEEL, Vector((0, 0.75, -0.45)), 0.06, 0.11)(p)
        # Sohle flach drücken, damit die Socke steht.
        if p.z < 0.035:
            p.z = 0.035 - (0.035 - p.z) * 0.35
        return p

    k.deform(mesh, shape)
    lo = min(v.co.z for v in mesh.data.vertices)
    k.deform(mesh, lambda p: p - Vector((0, 0, lo)))

    def color(p: Vector, normal: Vector):
        # Ringel nur am Schaft: zwei breite und zwei schmale Streifen, scharf begrenzt.
        c = CREAM
        for z0, z1 in ((1.18, 1.25), (1.06, 1.1), (0.84, 0.91), (0.72, 0.76)):
            band = smoothstep(z0 - 0.012, z0 + 0.004, p.z) * (1 - smoothstep(z1 - 0.004, z1 + 0.012, p.z))
            c = mix(c, STRIPE, band)
        # Ferse hinten unten, Spitze vorn.
        heel_d = (Vector((p.x * 0.8, p.y, p.z)) - HEEL).length
        heel = 1 - smoothstep(0.2, 0.215, heel_d)
        toe = smoothstep(0.255, 0.27, -p.y)
        c = mix(c, PATCH, max(heel, toe))
        # Bäckchen unter den Knopfaugen.
        for cx in (0.13, -0.14):
            d = (Vector((p.x, p.y, p.z)) - Vector((cx, -0.15, 0.97))).length
            c = mix(c, CHEEK, math.exp(-((d / 0.045) ** 2)) * 0.55)
        # Strick: Rillen zwischen den Rippen etwas dunkler.
        a = math.atan2(p.x, p.z * 0 + (p.y - 0.04))
        knit = 0.955 + 0.045 * (0.5 + 0.5 * math.cos(a * KNIT_RIBS))
        return (c[0] * knit, c[1] * knit, c[2] * knit)

    k.paint(mesh, color)
    return mesh


def surface_front(x: float, z: float) -> float:
    """y der Schaft-Vorderseite bei (x, z) (Schaft ist rund mit Radius LEG_R um y = 0,04)."""
    return 0.04 - math.sqrt(max(0.0, LEG_R**2 - x * x))


def cuff():
    # Boden der Öffnung bei 1,45: Darunter steckt das Schaftende (erster Pfadpunkt in `PATH`).
    # Oben ein umgeschlagener, runder Wulst.
    profile = [(0.0, 1.27), (0.198, 1.27), (0.212, 1.285), (0.218, 1.31), (0.218, 1.47), (0.214, 1.5), (0.204, 1.518), (0.19, 1.524), (0.176, 1.516), (0.169, 1.5), (0.168, 1.47), (0.168, 1.45), (0.0, 1.45)]
    ring = k.lathe("buendchen", profile, segments=96)

    def ribs(p: Vector) -> Vector:
        r = math.hypot(p.x, p.y)
        if r < 0.16:
            return p
        a = math.atan2(p.y, p.x)
        # 24 Rippen auf 96 Punkten (4 je Rippe): runde Grate, schmale Rillen.
        g = (0.5 + 0.5 * math.cos(a * 24)) ** 0.6
        f = 1 + 0.045 * (g - 0.5) * smoothstep(0.17, 0.2, r)
        return Vector((p.x * f, p.y * f, p.z))

    k.deform(ring, ribs)
    k.deform(ring, lambda p: p + Vector((0, 0.04, 0)))
    return ring


def button(name, at, radius, color, cross: bool):
    y = surface_front(at[0], at[2])
    disc = k.cylinder(name, (at[0], y - 0.008, at[2]), radius, 0.026, segments=24, axis="Y")
    rim = k.torus(f"{name}-rand", (at[0], y - 0.021, at[2]), radius * 0.84, radius * 0.15, segments=24, sides=6)
    rim.rotation_euler = (math.radians(90), 0, 0)
    parts = [k.solid(disc, color), k.solid(rim, mix(color, (1, 1, 1), 0.18))]
    for dx, dz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        h = k.sphere(f"{name}-loch", (at[0] + dx * radius * 0.27, y - 0.021, at[2] + dz * radius * 0.27), radius * 0.1, scale=(1, 0.5, 1), segments=8, rings=4)
        parts.append(k.solid(h, mix(color, THREAD, 0.7)))
    # Faden durch die Löcher: als Kreuz oder als zwei Striche.
    pairs = [((-1, -1), (1, 1)), ((-1, 1), (1, -1))] if cross else [((-1, -1), (-1, 1)), ((1, -1), (1, 1))]
    for i, (a, b) in enumerate(pairs):
        pa = (at[0] + a[0] * radius * 0.27, y - 0.024, at[2] + a[1] * radius * 0.27)
        pb = (at[0] + b[0] * radius * 0.27, y - 0.024, at[2] + b[1] * radius * 0.27)
        frames = k.path_frames([pa, pb], 2, ref=(0, 1, 0))
        parts.append(k.solid(k.tube(f"{name}-faden-{i}", frames, lambda fr, a: (0.006, 0.006), around=6, dome_start=1, dome_end=1, dome_rings=2), THREAD))
    return parts


def stitch(name: str, a: Vector, b: Vector, width: float = 0.009):
    """Ein gestickter Stich zwischen zwei Punkten, halb in der Oberfläche."""
    frames = k.path_frames([tuple(a), tuple((a + b) / 2 + Vector((0, -0.004, 0))), tuple(b)], 3, ref=(0, 1, 0))
    return k.solid(k.tube(name, frames, lambda fr, _: (width, width), around=6, dome_start=1, dome_end=1, dome_rings=2), THREAD)


def on_front(x: float, z: float, lift: float = 0.0) -> Vector:
    return Vector((x, surface_front(x, z) - lift, z))


def face():
    parts = []
    parts += button("knopf-l", (0.088, 0, 1.08), 0.055, BUTTON_A, cross=True)
    parts += button("knopf-r", (-0.095, 0, 1.1), 0.07, BUTTON_B, cross=False)
    # Gestickter Mund: Stiche entlang eines schiefen Lächelns.
    arc = []
    for i in range(11):
        t = i / 10
        x = 0.085 - 0.17 * t
        z = 0.965 - 0.045 * math.sin(t * math.pi) + 0.015 * t
        arc.append(on_front(x, z, -0.002))
    for i in range(0, 10, 2):
        parts.append(stitch(f"mund-{i}", arc[i], arc[i + 1] + (arc[i + 2] - arc[i + 1]) * 0.4))
    # Hochgezogene Augenbraue über dem großen Knopf.
    parts.append(stitch("braue-1", on_front(-0.05, 1.19, -0.002), on_front(-0.1, 1.205, -0.002)))
    parts.append(stitch("braue-2", on_front(-0.1, 1.205, -0.002), on_front(-0.145, 1.195, -0.002)))
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
    knit = k.material("strick", vertex_colors=True, roughness=0.9, sheen=0.7, structure="strick")
    gloss = k.material("knopf", vertex_colors=True, roughness=0.2, coat=0.8)
    accent = k.material("akzent", color=k.hex_color("#cc79a7"), roughness=0.85, sheen=0.6, structure="strick")

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
