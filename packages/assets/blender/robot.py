"""
Schraubi, der Aufziehroboter (CHAOS-58): lackiertes Blechspielzeug mit runden Kanten,
Bildschirmgesicht mit leuchtenden Augen, Wackelantenne mit Glühbirne und drehendem
Aufziehschlüssel. Starre Teile an Knochen (ein Roboter biegt sich nicht). Höhe ≈ 1,68.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import s, standard_clips

PAINT = k.hex_color("#9fbfd6")
PAINT_LIGHT = k.hex_color("#d9e6ee")
DARK = k.hex_color("#36394f")
SCREEN = k.hex_color("#14161f")
GLOW = k.hex_color("#bff4ff")
BULB = k.hex_color("#ffc94a")
RIVET = k.hex_color("#f0b73e")


def painted(obj, top=PAINT_LIGHT, bottom=PAINT, lo=0.0, hi=1.0):
    """Lack mit leichtem Verlauf (oben heller) – wirkt wie gebogenes Blech."""

    def color(p, n):
        t = max(0.0, min(1.0, (p.z - lo) / (hi - lo)))
        c = tuple(bottom[i] + (top[i] - bottom[i]) * t for i in range(3))
        # Kanten nach unten etwas dunkler (Umgebungsverdeckung im Lack).
        shade = 0.9 + 0.1 * max(0.0, n.z)
        return (c[0] * shade, c[1] * shade, c[2] * shade)

    k.paint(obj, color)
    return obj


GREY = k.hex_color("#c9d3dc")
SEAM = k.hex_color("#6f8597")
CREAM = k.hex_color("#f4ecd8")
RED = k.hex_color("#e05a4a")
GREEN = k.hex_color("#5fbf6a")


# CHAOS-171: Nahansicht. Kleinere Fasen (Blech statt Seife), Nähte, Nieten entlang der Kanten,
# Bildschirmrahmen, Lüftungsschlitze, Schlauch-Gelenke an Armen und Beinen, Stiefel mit Sohle,
# Spiralfeder an der Antenne. Neue Teile hängen an bestehenden Meshes (Budget 12 Meshes).


def hose(name: str, top, bottom, radius: float, rings: int, color=GREY):
    """Gerippter Schlauch zwischen zwei Punkten (Arm, Bein): Röhre mit Wellen."""
    frames = k.path_frames([top, bottom], rings * 4 + 1, ref=(1, 0, 0))

    def r(fr, a):
        w = radius * (1 + 0.16 * (0.5 + 0.5 * math.cos(fr.t * rings * 2 * math.pi)))
        return w, w

    return k.solid(k.tube(name, frames, r, around=14), color)


def rivet_row(name: str, a, b, count: int, radius: float = 0.013, normal=(0, -1, 0)):
    out = []
    for i in range(count):
        t = i / (count - 1)
        at = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
        rv = k.sphere(f"{name}-{i}", at, radius, scale=tuple(0.55 if n else 1.0 for n in normal), segments=8, rings=4)
        out.append(k.solid(rv, RIVET))
    return out


def leg(side: int):
    x = side * 0.13
    boot = k.rounded_box(f"fuss-{side}", (x, -0.035, 0.055), (0.17, 0.26, 0.08), 0.03, segments=3)
    sole = k.rounded_box(f"sohle-{side}", (x, -0.035, 0.012), (0.18, 0.27, 0.024), 0.01, segments=2)
    cap = k.sphere(f"kappe-{side}", (x, -0.135, 0.06), 0.07, scale=(1.05, 0.7, 0.6), segments=16, rings=8)
    cuff = k.cylinder(f"manschette-{side}", (x, 0, 0.11), 0.068, 0.04, segments=20)
    shin = hose(f"schienbein-{side}", (x, 0, 0.27), (x, 0, 0.12), 0.042, 4)
    k.solid(boot, DARK)
    k.solid(sole, k.hex_color("#23252f"))
    k.solid(cap, k.hex_color("#4a4e68"))
    k.solid(cuff, PAINT)
    return k.join([boot, sole, cap, cuff, shin], f"bein-{side}")


def arm(side: int):
    x = side * 0.3
    ball = k.sphere(f"schulter-{side}", (side * 0.29, 0, 0.64), 0.062, segments=18, rings=10)
    bolt = k.cylinder(f"schulterbolzen-{side}", (side * 0.35, 0, 0.64), 0.028, 0.02, segments=12, axis="X")
    upper = hose(f"oberarm-{side}", (side * 0.3, -0.005, 0.6), (side * 0.315, -0.02, 0.47), 0.03, 5)
    cuff = k.cylinder(f"armmanschette-{side}", (side * 0.317, -0.02, 0.455), 0.045, 0.03, segments=16)
    hand = k.sphere(f"hand-{side}", (side * 0.32, -0.025, 0.4), 0.068, scale=(0.85, 1.0, 1.1), segments=18, rings=10)
    thumb = k.sphere(f"daumen-{side}", (side * 0.285, -0.075, 0.42), 0.028, scale=(1.0, 1.0, 1.4), segments=10, rings=6)
    k.solid(ball, DARK)
    k.solid(bolt, RIVET)
    k.solid(cuff, PAINT)
    k.solid(hand, RIVET)
    k.solid(thumb, RIVET)
    del x
    return k.join([ball, bolt, upper, cuff, hand, thumb], f"arm-{side}")


def body():
    torso = painted(k.rounded_box("rumpf", (0, 0, 0.5), (0.52, 0.38, 0.46), 0.045, segments=3), lo=0.27, hi=0.73)
    belt = k.rounded_box("guertel", (0, 0, 0.3), (0.545, 0.405, 0.06), 0.022, segments=2)
    seam = k.rounded_box("naht", (0, 0, 0.615), (0.53, 0.39, 0.012), 0.012, segments=2)
    k.solid(belt, DARK)
    k.solid(seam, SEAM)
    parts = [torso, belt, seam]
    # Nieten entlang der Vorderkanten und der Naht.
    for x in (-0.225, 0.225):
        parts += rivet_row(f"niete-v{x}", (x, -0.191, 0.36), (x, -0.191, 0.7), 4)
    parts += rivet_row("niete-naht", (-0.15, -0.197, 0.615), (0.15, -0.197, 0.615), 5, 0.011)
    # Bedienleiste über dem Abzeichen: drei Knöpfe und ein Zeigerinstrument.
    plate = k.rounded_box("leiste", (0, -0.19, 0.67), (0.3, 0.02, 0.07), 0.012, segments=2)
    parts.append(k.solid(plate, PAINT_LIGHT))
    for i, color in enumerate((RED, BULB, GREEN)):
        b = k.cylinder(f"knopf-{i}", (-0.1 + i * 0.05, -0.203, 0.67), 0.016, 0.014, segments=12, axis="Y")
        parts.append(k.solid(b, color))
    dial = k.cylinder("anzeige", (0.09, -0.203, 0.67), 0.028, 0.012, segments=20, axis="Y")
    rim = k.torus("anzeige-rand", (0.09, -0.21, 0.67), 0.028, 0.006, segments=20, sides=5)
    rim.rotation_euler = (math.radians(90), 0, 0)
    needle = k.rounded_box("zeiger", (0.095, -0.212, 0.675), (0.004, 0.004, 0.03), 0.0015, segments=1)
    needle.rotation_euler = (0, math.radians(-35), 0)
    parts += [k.solid(dial, CREAM), k.solid(rim, DARK), k.solid(needle, RED)]
    # Lüftungsschlitze an den Seiten.
    for side in (1, -1):
        for j in range(4):
            slot = k.rounded_box(f"schlitz-{side}-{j}", (side * 0.262, 0.04, 0.42 + j * 0.035), (0.012, 0.16, 0.014), 0.006, segments=2)
            parts.append(k.solid(slot, DARK))
    # Hals: kurzer Schlauch in den Halsring.
    parts.append(hose("hals", (0, 0, 0.84), (0, 0, 0.72), 0.075, 3, DARK))
    return k.join(parts, "rumpf")


def head():
    shell = painted(k.rounded_box("kopf", (0, 0, 1.02), (0.58, 0.44, 0.42), 0.06, segments=4), lo=0.8, hi=1.24)
    screen = k.rounded_box("bildschirm", (0, -0.212, 1.02), (0.42, 0.05, 0.27), 0.045, segments=3)
    k.solid(screen, SCREEN)
    bezel = k.rounded_box("rahmen", (0, -0.212, 1.02), (0.47, 0.03, 0.32), 0.055, segments=3)
    k.solid(bezel, DARK)
    parts = [shell, bezel]
    for side in (1, -1):
        bolt = k.cylinder(f"ohr-{side}", (side * 0.31, 0, 1.02), 0.075, 0.06, segments=24, axis="X")
        cap = k.cylinder(f"ohrkappe-{side}", (side * 0.345, 0, 1.02), 0.048, 0.03, segments=20, axis="X")
        slot = k.rounded_box(f"ohrschlitz-{side}", (side * 0.361, 0, 1.02), (0.006, 0.07, 0.012), 0.003, segments=1)
        parts += [k.solid(bolt, DARK), k.solid(cap, RIVET), k.solid(slot, DARK)]
        # Nieten an den Ecken der Vorderseite.
        for z in (0.86, 1.18):
            rv = k.sphere(f"kopfniete-{side}-{z}", (side * 0.255, -0.222, z), 0.013, scale=(1, 0.55, 1), segments=8, rings=4)
            parts.append(k.solid(rv, RIVET))
    # Lüftungsschlitze oben hinten, Fassung der Antenne.
    for j in range(3):
        slot = k.rounded_box(f"kopfschlitz-{j}", (0, 0.06 + j * 0.045, 1.232), (0.2, 0.014, 0.008), 0.004, segments=1)
        parts.append(k.solid(slot, DARK))
    socket = k.cylinder("fassung", (0, 0, 1.24), 0.045, 0.025, segments=20)
    parts.append(k.solid(socket, DARK))
    return k.join(parts, "kopf-gehaeuse"), screen


def face():
    parts = []
    for side in (1, -1):
        eye = k.sphere(f"auge-{side}", (side * 0.1, -0.24, 1.05), 0.062, scale=(1.0, 0.3, 1.15), segments=28, rings=14)
        pupil = k.sphere(f"pupille-{side}", (side * 0.1 + 0.01, -0.257, 1.045), 0.028, scale=(1.0, 0.3, 1.1), segments=16, rings=8)
        spark = k.sphere(f"funkeln-{side}", (side * 0.1 + 0.022, -0.264, 1.06), 0.008, segments=8, rings=4)
        parts += [k.solid(eye, GLOW), k.solid(pupil, SCREEN), k.solid(spark, GLOW)]
    mouth = k.torus("mund", (0, -0.24, 0.96), 0.06, 0.012, segments=32, sides=6)
    mouth.rotation_euler = (math.radians(90), 0, 0)
    # Nur die untere Hälfte des Rings als Lächeln.
    for v in mouth.data.vertices:
        if v.co.y > 0.015:
            v.co.y = 0.015 + (v.co.y - 0.015) * 0.1
    parts.append(k.solid(mouth, GLOW))
    # Bäckchen als leuchtende Striche auf dem Bildschirm.
    for side in (1, -1):
        for j in range(2):
            dash = k.rounded_box(f"backe-{side}-{j}", (side * (0.15 + j * 0.022), -0.238, 0.975), (0.008, 0.004, 0.028), 0.003, segments=1)
            dash.rotation_euler = (0, math.radians(side * 20), 0)
            parts.append(k.solid(dash, k.hex_color("#7fd8ff")))
    return k.join(parts, "gesicht")


def antenna():
    # Spiralfeder als Röhre entlang einer Schraubenlinie.
    turns, pts = 4, []
    for i in range(turns * 10 + 1):
        a = 2 * math.pi * i / 10
        pts.append((math.cos(a) * 0.022, math.sin(a) * 0.022, 1.245 + 0.075 * i / (turns * 10)))
    spring = k.tube("feder", k.path_frames(pts, turns * 12, ref=(0, 0, 1)), lambda fr, a: (0.007, 0.007), around=6)
    rod = k.cylinder("antennenstab", (0, 0, 1.35), 0.012, 0.13, segments=10)
    socket = k.cylinder("birnenfassung", (0, 0, 1.38), 0.03, 0.03, segments=16)
    bulb = k.sphere("birne", (0, 0, 1.425), 0.05, segments=20, rings=10)
    k.solid(rod, DARK)
    k.solid(spring, DARK)
    k.solid(socket, RIVET)
    return k.join([rod, spring, socket], "antenne"), k.solid(bulb, BULB)


def wind_key():
    shaft = k.cylinder("schaft", (0, 0.24, 0.55), 0.025, 0.12, segments=10, axis="Y")
    rings = []
    for side in (1, -1):
        ring = k.torus(f"fluegel-{side}", (side * 0.07, 0.31, 0.55), 0.06, 0.022, segments=20, sides=8)
        ring.rotation_euler = (math.radians(90), 0, 0)
        rings.append(ring)
    for part in (shaft, *rings):
        k.solid(part, RIVET)
    return k.join([shaft, *rings], "schluessel")


BONES = [
    k.Bone("root", (0, 0, 0), (0, 0, 0.15), deform=False),
    k.Bone("huepfer", (0, 0, 0.25), (0, 0, 0.45), "root"),
    k.Bone("spine", (0, 0, 0.45), (0, 0, 0.78), "huepfer"),
    k.Bone("kopf", (0, 0, 0.8), (0, 0, 1.24), "spine"),
    k.Bone("antenne", (0, 0, 1.23), (0, 0, 1.4), "kopf"),
    k.Bone("abzeichen", (0, -0.2, 0.47), (0, -0.2, 0.55), "spine", deform=False),
    k.Bone("arm-l", (0.29, 0, 0.64), (0.32, -0.02, 0.36), "spine"),
    k.Bone("arm-r", (-0.29, 0, 0.64), (-0.32, -0.02, 0.36), "spine"),
    k.Bone("bein-l", (0.13, 0, 0.27), (0.13, 0, 0.02), "huepfer"),
    k.Bone("bein-r", (-0.13, 0, 0.27), (-0.13, 0, 0.02), "huepfer"),
    k.Bone("schluessel", (0, 0.19, 0.55), (0, 0.36, 0.55), "spine"),
]
ANIMATED = ["huepfer", "spine", "kopf", "antenne", "arm-l", "arm-r", "bein-l", "bein-r", "schluessel"]


def extra(name: str, p: float) -> k.Pose:
    """Antenne wackelt nach, Aufziehschlüssel dreht sich (beim Laufen schnell)."""
    amp = {"idle": 6, "run": 14, "jump": 22, "hit": 30, "cheer": 18, "fall": 25}.get(name, 8)
    turns = {"idle": 1, "run": 2, "cheer": 3}.get(name, 0)
    pose: k.Pose = {"antenne": {"rot": (amp * s(p, 2, 0.2), 0, amp * 0.7 * s(p, 2))}}
    if turns:
        pose["schluessel"] = {"rot": (0, 360 * turns * p, 0)}
    if name == "sad":
        pose["antenne"] = {"rot": (35 * min(1.0, p * 3), 0, 0)}
    return pose


def build() -> None:
    k.reset()
    paint = k.material("lack", vertex_colors=True, roughness=0.32, coat=0.6, structure="lack")
    brass = k.material("messing", vertex_colors=True, roughness=0.3, coat=0.3)
    brass.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.85
    screen_mat = k.material("bildschirm", color=SCREEN, roughness=0.08, coat=1.0)
    glow = k.material("leuchten", vertex_colors=True, roughness=0.2, emission=2.0, color=GLOW)
    accent = k.material("akzent", color=k.hex_color("#0072b2"), roughness=0.45, coat=0.4, structure="lack")

    rig = k.armature("schraubi", BONES)
    for side, bone in ((1, "bein-l"), (-1, "bein-r")):
        part = leg(side)
        k.assign(part, paint)
        k.attach(part, rig, bone)
    for side, bone in ((1, "arm-l"), (-1, "arm-r")):
        part = arm(side)
        k.assign(part, paint)
        k.attach(part, rig, bone)
    torso = body()
    k.assign(torso, paint)
    k.attach(torso, rig, "spine")
    collar = k.torus("halsring", (0, 0, 0.77), 0.13, 0.04, segments=28, sides=8)
    k.assign(collar, accent)
    k.attach(collar, rig, "spine")
    shell, screen = head()
    k.assign(shell, paint)
    k.assign(screen, screen_mat)
    k.attach(shell, rig, "kopf")
    k.attach(screen, rig, "kopf")
    eyes = face()
    k.assign(eyes, glow)
    k.attach(eyes, rig, "kopf")
    rod, bulb = antenna()
    k.assign(rod, paint)
    k.assign(bulb, glow)
    k.attach(rod, rig, "antenne")
    k.attach(bulb, rig, "antenne")
    key = wind_key()
    k.assign(key, brass)
    k.attach(key, rig, "schluessel")
    k.bake_clips(rig, standard_clips(extra), ANIMATED)
