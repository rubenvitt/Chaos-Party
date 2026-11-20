"""
Kalle Kaktus (CHAOS-58, Nahansicht CHAOS-162): cooler Saguaro im Tontopf – gerippter Körper mit
Saguaro-Armen, Areolen mit Dornen auf den Graten, Sonnenbrille mit Fassung, schiefes Grinsen,
gelbe Blüte auf dem Kopf, Halstuch mit Knoten in Slot-Farbe. Hüpft im Topf (keine Beine).
Höhe ≈ 1,55.

CHAOS-162: Rumpf und Arme sind keine Skin-Modifier-Körper mehr, sondern Röhren mit
ausgeformtem Rippenprofil (64 bzw. 32 Punkte rundum, 8 Rippen). So bleiben die Grate auch aus
der Nähe sauber, und Gesicht, Halstuch und Dornen lassen sich exakt auf die Oberfläche setzen.
Gewichte kommen von Hand (`k.weight`) statt aus der Wärmeverteilung.
"""

from __future__ import annotations

import math

import figurkit as k  # importiert bpy zuerst
from clips import s, smoothstep, standard_clips
from mathutils import Vector

GREEN = k.hex_color("#64b450")
GREEN_DARK = k.hex_color("#3b7b3a")
GREEN_LIGHT = k.hex_color("#a6d873")
GREEN_OLIVE = k.hex_color("#6f8f3a")
AREOLE = k.hex_color("#f6f0dc")
SPINE = k.hex_color("#efe2b8")
SPINE_TIP = k.hex_color("#a8875a")
CLAY = k.hex_color("#cf7146")
CLAY_DARK = k.hex_color("#9c4d2c")
CLAY_LIGHT = k.hex_color("#e49067")
SOIL = k.hex_color("#4b3424")
SOIL_LIGHT = k.hex_color("#6e5038")
PEBBLE = k.hex_color("#b9ad98")
LENS = k.hex_color("#121219")
FRAME = k.hex_color("#26232b")
PETAL = k.hex_color("#ffd23f")
PETAL_INNER = k.hex_color("#fff1a6")
PETAL_CORE = k.hex_color("#f08a24")
STAMEN = k.hex_color("#ffb52e")
MOUTH = k.hex_color("#1c3a1f")

RIBS = 8
TRUNK_AROUND = 56
ARM_AROUND = 32
TRUNK_BOTTOM = 0.3
TRUNK_SHOULDER = 1.25
TRUNK_TOP = 1.5
RIB_DEPTH = 0.13
"""Rillentiefe als Anteil des Radius."""


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def rib(angle: float) -> float:
    """Rippenprofil: 1 auf dem Grat, 0 in der Rille. Breite, runde Grate, schmale Rillen."""
    g = 0.5 + 0.5 * math.cos(angle * RIBS)
    return g**0.45


def trunk_radius(z: float) -> float:
    """Grundradius des Rumpfs (ohne Rippen): leicht bauchig, oben schmaler."""
    return 0.236 + 0.008 * math.sin((z - 0.3) / 0.95 * math.pi) - 0.012 * smoothstep(0.9, 1.25, z)


def trunk_surface(angle: float, z: float) -> float:
    """Abstand der Oberfläche von der Rumpfachse beim Winkel (0 = +x, -π/2 = vorn) und Höhe z
    im zylindrischen Teil (bis `TRUNK_SHOULDER`)."""
    return trunk_radius(z) * (1 - RIB_DEPTH + RIB_DEPTH * rib(angle))


def on_trunk(angle: float, z: float, lift: float = 0.0) -> Vector:
    r = trunk_surface(angle, z) + lift
    return Vector((math.cos(angle) * r, math.sin(angle) * r, z))


FRONT = -math.pi / 2


def trunk():
    frames = k.path_frames([(0, 0, TRUNK_BOTTOM), (0, 0, TRUNK_SHOULDER)], 22)

    def radius(fr: k.Frame, a: float):
        # Frame: u = +x, v = +y (Tangente +z); a ist also der Weltwinkel um z.
        r = trunk_surface(a, fr.at.z)
        return r, r

    dome = (TRUNK_TOP - TRUNK_SHOULDER) / trunk_radius(TRUNK_SHOULDER)
    mesh = k.tube("kaktus", frames, radius, around=TRUNK_AROUND, dome_start=0.4, dome_end=dome, dome_rings=8)
    return mesh


ARM_L = [(0.17, 0, 0.86), (0.3, 0, 0.875), (0.37, 0, 0.93), (0.385, 0, 1.04), (0.385, 0, 1.16)]
ARM_R = [(-0.17, 0, 0.74), (-0.29, 0, 0.755), (-0.345, 0, 0.8), (-0.355, 0, 0.9), (-0.355, 0, 0.99)]


def arm(name: str, points, r0: float, r1: float):
    frames = k.path_frames(points, 15, ref=(0, 1, 0))

    def radius(fr: k.Frame, a: float):
        r = (r0 + (r1 - r0) * fr.t) * (1 - RIB_DEPTH * 1.1 + RIB_DEPTH * 1.1 * rib(a))
        return r, r

    return k.tube(name, frames, radius, around=ARM_AROUND, dome_end=1.0, dome_rings=6), frames


class Spikes:
    """Areolen (helle Polster) mit Dornen, gesammelt in einem Mesh."""

    def __init__(self) -> None:
        self.verts: list[Vector] = []
        self.faces: list[tuple[int, ...]] = []
        self.colors: list[tuple[float, float, float]] = []

    def areole(self, at: Vector, normal: Vector, up: Vector, size: float, spines: int, seed: int) -> None:
        n = normal.normalized()
        u = (up - n * up.dot(n)).normalized()
        v = n.cross(u)
        base = len(self.verts)
        self.verts.append(at + n * size * 0.55)
        self.colors.append(AREOLE)
        for i in range(6):
            a = 2 * math.pi * i / 6
            self.verts.append(at + (u * math.cos(a) + v * math.sin(a)) * size - n * size * 0.2)
            self.colors.append(AREOLE)
        for i in range(6):
            self.faces.append((base, base + 1 + i, base + 1 + (i + 1) % 6))
        for j in range(spines):
            # Dornen gespreizt: einer nach oben, die anderen zur Seite und nach unten.
            a = 2 * math.pi * (j / spines) + seed * 0.7
            d = (n * 1.0 + (u * math.cos(a) + v * math.sin(a)) * 0.75).normalized()
            length = size * (3.4 if j == 0 else 2.6)
            w = size * 0.2
            side_u = (d.cross(n) if abs(d.dot(n)) < 0.99 else u).normalized()
            side_v = d.cross(side_u)
            b = len(self.verts)
            root = at + n * size * 0.3
            for i in range(3):
                t = 2 * math.pi * i / 3
                self.verts.append(root + (side_u * math.cos(t) + side_v * math.sin(t)) * w)
                self.colors.append(SPINE)
            self.verts.append(root + d * length)
            self.colors.append(SPINE_TIP)
            for i in range(3):
                self.faces.append((b + i, b + (i + 1) % 3, b + 3))

    def build(self, name: str):
        mesh = k.bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        obj = k.bpy.data.objects.new(name, mesh)
        k.bpy.context.scene.collection.objects.link(obj)
        for poly in mesh.polygons:
            poly.use_smooth = True  # sonst trennt der Export jede Ecke (Größe)
        layer = mesh.color_attributes.new("Farbe", "BYTE_COLOR", "CORNER")
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                layer.data[li].color = (*self.colors[mesh.loops[li].vertex_index], 1.0)
        return obj


def face_zone(angle: float, z: float) -> bool:
    """Stellen ohne Dornen: Gesicht, Halstuch, Brillenbügel."""
    d = abs(math.atan2(math.sin(angle - FRONT), math.cos(angle - FRONT)))
    if z > 0.95 and d < 0.9:
        return True
    if 0.86 < z < 1.02:
        return True
    return 1.12 < z < 1.27 and d < 1.5


def trunk_spikes(sp: Spikes) -> None:
    for r in range(RIBS):
        angle = 2 * math.pi * r / RIBS
        z = 0.5 + (0.045 if r % 2 else 0.0)
        i = 0
        while z < 1.33:
            if not face_zone(angle, z):
                at = on_trunk(angle, z)
                sp.areole(at, Vector((math.cos(angle), math.sin(angle), 0)), Vector((0, 0, 1)), 0.011, 2, r * 7 + i)
            z += 0.09
            i += 1


def arm_spikes(sp: Spikes, frames: list[k.Frame], r0: float, r1: float, seed: int) -> None:
    for r in range(RIBS):
        a = 2 * math.pi * r / RIBS
        for fr in frames[4:-1:4]:
            # Arme: nur auf den Graten, die nicht zum Rumpf zeigen.
            rad = (r0 + (r1 - r0) * fr.t)
            n = fr.u * math.cos(a) + fr.v * math.sin(a)
            at = fr.at + n * rad
            if abs(at.x) < 0.27:
                continue
            sp.areole(at, n, fr.tangent, 0.008, 1 + (r + seed) % 2, seed + r)


def body():
    torso = trunk()
    left, left_frames = arm("arm-links", ARM_L, 0.08, 0.066)
    right, right_frames = arm("arm-rechts", ARM_R, 0.075, 0.062)
    sp = Spikes()
    trunk_spikes(sp)
    arm_spikes(sp, left_frames, 0.08, 0.066, 3)
    arm_spikes(sp, right_frames, 0.075, 0.062, 5)
    spikes = sp.build("dornen")

    def trunk_color(p: Vector, normal: Vector):
        a = math.atan2(p.y, p.x)
        ridge = rib(a)
        c = mix(GREEN_DARK, GREEN, smoothstep(0.05, 0.75, ridge))
        c = mix(c, GREEN_LIGHT, smoothstep(0.88, 1.0, ridge) * 0.45)
        # Neuer Wuchs oben heller, unten am Topf olivgrün und verholzt.
        c = mix(c, GREEN_LIGHT, smoothstep(1.25, 1.5, p.z) * 0.4)
        c = mix(c, GREEN_OLIVE, (1 - smoothstep(0.42, 0.62, p.z)) * 0.55)
        # Feine Längsstreifen in den Flanken.
        streak = 0.5 + 0.5 * math.sin(a * RIBS * 3)
        c = mix(c, GREEN_DARK, streak * (1 - ridge) * 0.12)
        return c


    k.paint(torso, trunk_color)

    def paint_arm(obj, frames, r0, r1):
        def color(p: Vector, normal: Vector):
            # Abstand zur Armachse über die nächste Rahmenmitte.
            fr = min(frames, key=lambda f: (f.at - p).length_squared)
            rad = r0 + (r1 - r0) * fr.t
            depth = smoothstep(rad * (1 - RIB_DEPTH * 1.1), rad, (p - fr.at).length)
            c = mix(GREEN_DARK, GREEN, smoothstep(0.0, 0.8, depth))
            c = mix(c, GREEN_LIGHT, smoothstep(0.9, 1.0, depth) * 0.4)
            return mix(c, GREEN_LIGHT, smoothstep(0.95, 1.2, p.z) * 0.3)

        k.paint(obj, color)

    paint_arm(left, left_frames, 0.08, 0.066)
    paint_arm(right, right_frames, 0.075, 0.062)

    def trunk_weights(p: Vector) -> dict[str, float]:
        lower = smoothstep(0.34, 0.5, p.z)
        upper = smoothstep(0.85, 1.05, p.z)
        return {"huepfer": 1 - lower, "spine": lower * (1 - upper), "kopf": lower * upper}

    def arm_weights(bone: str, side: float):
        def fn(p: Vector) -> dict[str, float]:
            w = smoothstep(0.2, 0.27, p.x * side)
            base = trunk_weights(p)
            out = {b: v * (1 - w) for b, v in base.items()}
            out[bone] = w
            return out

        return fn

    def spike_weights(p: Vector) -> dict[str, float]:
        if p.x > 0.27:
            return arm_weights("arm-l", 1)(p)
        if p.x < -0.27:
            return arm_weights("arm-r", -1)(p)
        return trunk_weights(p)

    k.weight(torso, trunk_weights)
    k.weight(left, arm_weights("arm-l", 1))
    k.weight(right, arm_weights("arm-r", -1))
    k.weight(spikes, spike_weights)
    return k.join([torso, left, right, spikes], "kaktus")


def pot():
    profile = [
        (0.0, 0.0),
        (0.22, 0.0),
        (0.245, 0.008),
        (0.258, 0.03),
        (0.31, 0.345),
        (0.335, 0.352),
        (0.358, 0.362),
        (0.37, 0.385),
        (0.372, 0.44),
        (0.365, 0.462),
        (0.348, 0.47),
        (0.33, 0.466),
        (0.318, 0.45),
        (0.312, 0.43),
        (0.308, 0.41),
        (0.0, 0.41),
    ]
    clay = k.lathe("topf", profile, segments=40)

    def color(p, n):
        r = math.hypot(p.x, p.y)
        if p.z > 0.405 and r < 0.309:
            return SOIL
        c = mix(CLAY_DARK, CLAY, smoothstep(0.0, 0.25, p.z))
        # Rand oben heller, feine Drehrillen.
        c = mix(c, CLAY_LIGHT, smoothstep(0.35, 0.47, p.z) * 0.5)
        groove = 0.5 + 0.5 * math.sin(p.z * 160)
        return mix(c, CLAY_DARK, groove * 0.08 * (1 - smoothstep(0.34, 0.36, p.z)))

    k.paint(clay, color)

    # Erde: leicht gewellte Scheibe mit ein paar Kieseln.
    rings = []
    for i in range(1, 5):
        r = 0.308 * i / 4
        ring = []
        for j in range(32):
            a = 2 * math.pi * j / 32
            h = 0.418 + 0.006 * math.sin(a * 5 + i) * math.sin(i * 1.7) - 0.006 * (i / 4) ** 2
            ring.append(Vector((math.cos(a) * r, math.sin(a) * r, h)))
        rings.append(ring)
    soil = k.rings_mesh("erde", rings, cap_start=True, cap_end=False)
    k.paint(soil, lambda p, n: mix(SOIL, SOIL_LIGHT, 0.5 + 0.5 * math.sin(p.x * 90) * math.sin(p.y * 80)))
    pebbles = []
    for i, (a, r, s_) in enumerate(((0.6, 0.27, 0.022), (2.1, 0.285, 0.016), (3.3, 0.265, 0.02), (4.4, 0.28, 0.014), (5.5, 0.27, 0.018))):
        pb = k.sphere(f"kiesel-{i}", (math.cos(a) * r, math.sin(a) * r, 0.42), s_, scale=(1.2, 0.9, 0.6), segments=8, rings=5)
        pebbles.append(k.solid(pb, mix(PEBBLE, SOIL_LIGHT, (i % 3) * 0.2)))
    return k.join([clay, soil, *pebbles], "topf")


def glasses():
    parts = []
    z = 1.175
    front = -trunk_surface(FRONT, z)
    lens_y = front - 0.03
    for side in (1, -1):
        cx = side * 0.1
        lens = k.sphere(f"glas-{side}", (cx, lens_y, z), 0.083, scale=(1.18, 0.28, 0.8), segments=18, rings=8)
        parts.append(k.solid(lens, LENS))
        rim = k.torus(f"fassung-{side}", (cx, lens_y, z), 0.083, 0.011, segments=24, sides=5)
        rim.rotation_euler = (math.radians(90), 0, 0)
        rim.scale = (1.18, 0.8, 1.0)
        parts.append(k.solid(rim, FRAME))
        # Glanzlicht als heller Streif oben außen.
        shine = k.sphere(f"glanz-{side}", (cx + side * 0.035, lens_y - 0.024, z + 0.03), 0.018, scale=(1.6, 0.2, 0.5), segments=10, rings=5)
        shine.rotation_euler = (0, math.radians(-side * 25), 0)
        parts.append(k.solid(shine, k.hex_color("#cfd6e8")))
    bridge = k.torus("steg", (0, lens_y, z + 0.02), 0.03, 0.009, segments=16, sides=6)
    bridge.rotation_euler = (math.radians(90), 0, 0)
    for v in bridge.data.vertices:
        if v.co.y < 0:  # nur der obere Bogen (vor der Drehung: y)
            v.co.y = 0
    parts.append(k.solid(bridge, FRAME))
    for side in (1, -1):
        x = side * 0.198
        back = -math.sqrt(max(0.0, trunk_radius(z) ** 2 - x * x)) + 0.03
        temple = k.cylinder(f"buegel-{side}", (x, (lens_y + back) / 2, z + 0.01), 0.008, back - lens_y, segments=6, axis="Y")
        parts.append(k.solid(temple, FRAME))
    parts.append(mouth())
    return k.join(parts, "gesicht")


def mouth():
    """Schiefes Grinsen als Rille auf der Oberfläche (rechter Mundwinkel höher)."""
    points = []
    for i in range(9):
        t = i / 8
        a = FRONT + (t - 0.5) * 0.62
        z = 1.045 - 0.03 * math.sin(t * math.pi) + 0.012 * t
        points.append(on_trunk(a, z, -0.002))
    frames = k.path_frames([tuple(p) for p in points], 14, ref=(0, -1, 0))
    obj = k.tube("mund", frames, lambda fr, a: (0.011 * (0.6 + 0.4 * math.sin(fr.t * math.pi)),) * 2, around=8, dome_start=1.0, dome_end=1.0, dome_rings=3)
    return k.solid(obj, MOUTH)


def petal(name: str, angle: float, length: float, width: float, tilt: float, z: float, color):
    """Gewölbtes Blütenblatt: abgeflachte Kugel, außen hochgebogen."""
    obj = k.sphere(name, (0, 0, 0), 1.0, scale=(length / 2, width / 2, 0.012), segments=12, rings=6)

    def shape(p: Vector) -> Vector:
        x = p.x + length / 2  # Blattgrund bei x = 0
        lift = (x / length) ** 2 * length * tilt
        cup = (p.y / (width / 2)) ** 2 * 0.012
        return Vector((x, p.y, p.z + lift + cup))

    k.deform(obj, shape)
    k.paint(obj, lambda p, n: mix(color, PETAL_CORE, (1 - smoothstep(0.0, length * 0.35, p.x)) * 0.35))
    for v in obj.data.vertices:
        c, s_ = math.cos(angle), math.sin(angle)
        x, y = v.co.x, v.co.y
        v.co = Vector((x * c - y * s_, x * s_ + y * c, v.co.z + z))
    obj.data.update()
    return obj


def flower():
    parts = []
    for i in range(6):
        parts.append(petal(f"blatt-{i}", 2 * math.pi * i / 6, 0.135, 0.07, 0.55, 1.485, PETAL))
    for i in range(5):
        parts.append(petal(f"innen-{i}", 2 * math.pi * (i + 0.5) / 5, 0.09, 0.05, 0.9, 1.495, PETAL_INNER))
    core = k.sphere("kern", (0, 0, 1.505), 0.036, scale=(1, 1, 0.6), segments=14, rings=7)
    parts.append(k.solid(core, PETAL_CORE))
    for i in range(8):
        a = 2 * math.pi * i / 8
        st = k.sphere(f"staub-{i}", (math.cos(a) * 0.026, math.sin(a) * 0.026, 1.52), 0.007, segments=6, rings=4)
        parts.append(k.solid(st, STAMEN))
    return k.join(parts, "bluete")


def scarf():
    """Halstuch: Band dicht am Rumpf, vorn tiefer, Knoten links vorn mit zwei Zipfeln."""
    rings = []
    around = 48
    for h in range(5):
        ring = []
        for i in range(around):
            a = 2 * math.pi * i / around
            front = 0.5 + 0.5 * math.cos(a - FRONT)
            z = 0.95 - 0.035 * front + (h - 2) * 0.017
            bulge = 0.012 * math.sin(h / 4 * math.pi)
            r = trunk_radius(z) + 0.012 + bulge
            ring.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
        rings.append(ring)
    # Rohr aus dem Band: innen geschlossen über einen zweiten, engeren Ringsatz.
    inner = []
    for ring in reversed(rings):
        inner.append([Vector((p.x * 0.93, p.y * 0.93, p.z)) for p in ring])
    band = k.rings_mesh("band", rings + inner, cap_start=False, cap_end=False)
    # Ränder schließen: erster und letzter Ring hängen über die Innenseite zusammen.
    ka = -math.pi / 2 - 0.62
    kx, ky = math.cos(ka) * 0.255, math.sin(ka) * 0.255
    knot = k.sphere("knoten", (kx, ky, 0.905), 0.045, scale=(1.0, 0.75, 0.85), segments=16, rings=8)
    tails = []
    for i, (dx, dz, rot) in enumerate(((0.03, -0.09, 18), (-0.035, -0.08, -22))):
        frames = k.path_frames([(kx, ky, 0.9), (kx + dx * 0.6, ky - 0.03, 0.9 + dz * 0.5), (kx + dx, ky - 0.035, 0.9 + dz)], 8, ref=(1, 0, 0))
        tail = k.tube(f"zipfel-{i}", frames, lambda fr, a: (0.035 * (1 - 0.35 * fr.t), 0.012), around=12, dome_end=0.4, dome_rings=3)
        tails.append(tail)
    return k.join([band, knot, *tails], "halstuch")


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
    skin = k.material("kaktus", vertex_colors=True, roughness=0.55, subsurface=0.08, coat=0.15, structure="haut")
    clay = k.material("ton", vertex_colors=True, roughness=0.85)
    gloss = k.material("glanz", vertex_colors=True, roughness=0.05, coat=1.0)
    petals = k.material("bluete", vertex_colors=True, roughness=0.6, sheen=0.4, subsurface=0.1)
    accent = k.material("akzent", color=k.hex_color("#e69f00"), roughness=0.65, sheen=0.3)

    rig = k.armature("kalle", BONES)
    cactus = body()
    k.assign(cactus, skin)
    k.skin_named(cactus, rig)
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
