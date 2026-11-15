"""
Gemeinsame Animationen aller Figuren (CHAOS-58): die sieben Clips aus `CHARACTER_ANIMATIONS`.

Jede Figur hat die Knochen `huepfer`, `spine`, `kopf`; Arme (`arm-l`/`arm-r`) und Beine
(`bein-l`/`bein-r`) sind optional – Schlüssel für fehlende Knochen ignoriert `bake_clips`.
Figurtypische Bewegung (Schwanz, Antenne, Schlüssel, Blüte) kommt über `extra(name, phase)`.

Achsen (Knochen-lokal): Knochen zeigen nach oben bzw. unten. Drehung um X kippt nach
vorn/hinten, um Y dreht um die eigene Achse, um Z kippt seitlich. `loc` Y = entlang des Knochens.
"""

from __future__ import annotations

import math
from typing import Callable

import figurkit as k

Extra = Callable[[str, float], k.Pose]


def s(phase: float, cycles: float = 1, offset: float = 0) -> float:
    return math.sin((phase * cycles + offset) * 2 * math.pi)


def smoothstep(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def merge(*poses: k.Pose) -> k.Pose:
    out: k.Pose = {}
    for pose in poses:
        for bone, spec in pose.items():
            out.setdefault(bone, {}).update(spec)
    return out


def wave(seconds: float, steps: int, pose_at: Callable[[float], k.Pose]) -> list[tuple[float, k.Pose]]:
    return [(seconds * i / steps, pose_at(i / steps)) for i in range(steps + 1)]


def none(_name: str, _phase: float) -> k.Pose:
    return {}


def standard_clips(extra: Extra = none, *, legs: bool = True, arms: bool = True) -> list[k.Clip]:
    """Die sieben Clips. `legs=False`: Figur hüpft statt zu laufen (Socke, Kaktus im Topf)."""
    out: list[k.Clip] = []

    def idle(p: float) -> k.Pose:
        return merge(
            {
                "huepfer": {"scale": (1.0 - 0.012 * s(p, 2), 1.0 + 0.02 * s(p, 2), 1.0 - 0.012 * s(p, 2))},
                "spine": {"rot": (2 * s(p), 0, 1.5 * s(p, 1, 0.25))},
                "kopf": {"rot": (3 * s(p, 1, 0.1), 6 * s(p, 1, 0.3), 4 * s(p, 1))},
                "arm-l": {"rot": (4 * s(p, 2), 0, -3)},
                "arm-r": {"rot": (4 * s(p, 2, 0.5), 0, 3)},
            },
            extra("idle", p),
        )

    out.append(k.Clip("idle", 2.4, wave(2.4, 24, idle), loop=True))

    def run(p: float) -> k.Pose:
        if legs:
            body = {
                "huepfer": {"loc": (0, 0.05 * abs(s(p)), 0)},
                "spine": {"rot": (12, 6 * s(p), 0)},
                "kopf": {"rot": (-8, -6 * s(p), 0)},
                "bein-l": {"rot": (-40 * s(p), 0, 0)},
                "bein-r": {"rot": (40 * s(p), 0, 0)},
            }
        else:
            hop = abs(s(p))
            body = {
                "huepfer": {"loc": (0, 0.16 * hop, 0), "scale": (1 + 0.08 * (1 - hop), 1 - 0.1 * (1 - hop) + 0.06 * hop, 1 + 0.08 * (1 - hop))},
                "spine": {"rot": (10, 0, 5 * s(p))},
                "kopf": {"rot": (-6, 0, -6 * s(p))},
            }
        return merge(
            body,
            {"arm-l": {"rot": (45 * s(p), 0, 0)}, "arm-r": {"rot": (-45 * s(p), 0, 0)}} if arms else {},
            extra("run", p),
        )

    out.append(k.Clip("run", 0.5, wave(0.5, 10, run), loop=True))

    squash = {"huepfer": {"scale": (1.18, 0.78, 1.18)}}

    def jump_key(t: float) -> k.Pose:
        return extra("jump", t / 0.8)

    out.append(
        k.Clip(
            "jump",
            0.8,
            [
                (0.0, jump_key(0.0)),
                (0.1, merge(squash, {"arm-l": {"rot": (-20, 0, 0)}, "arm-r": {"rot": (-20, 0, 0)}}, jump_key(0.1))),
                (
                    0.38,
                    merge(
                        {
                            "huepfer": {"loc": (0, 0.55, 0), "scale": (0.9, 1.15, 0.9)},
                            "arm-l": {"rot": (0, 0, -70)},
                            "arm-r": {"rot": (0, 0, 70)},
                            "bein-l": {"rot": (25, 0, 0)},
                            "bein-r": {"rot": (25, 0, 0)},
                        },
                        jump_key(0.38),
                    ),
                ),
                (0.62, merge(squash, jump_key(0.62))),
                (0.8, {}),
            ],
        )
    )
    out.append(
        k.Clip(
            "hit",
            0.7,
            [
                (0.0, {}),
                (
                    0.12,
                    merge(
                        {
                            "huepfer": {"scale": (1.15, 0.8, 1.15), "loc": (0, -0.03, 0)},
                            "spine": {"rot": (-22, 0, 8)},
                            "kopf": {"rot": (-15, 0, 18)},
                            "arm-l": {"rot": (0, 0, -55)},
                            "arm-r": {"rot": (0, 0, 55)},
                        },
                        extra("hit", 0.17),
                    ),
                ),
                (0.35, merge({"spine": {"rot": (6, 0, -4)}, "kopf": {"rot": (5, 0, -8)}}, extra("hit", 0.5))),
                (0.7, {}),
            ],
        )
    )

    def cheer(p: float) -> k.Pose:
        if p >= 0.999:
            return {}
        hop = max(0.0, s(p, 2)) * 0.32
        return merge(
            {
                "huepfer": {"loc": (0, hop, 0), "rot": (0, 360 * smoothstep(0.15, 0.65, p), 0)},
                "arm-l": {"rot": (0, 0, -150 + 15 * s(p, 4))},
                "arm-r": {"rot": (0, 0, 150 - 15 * s(p, 4))},
                "kopf": {"rot": (-12, 0, 8 * s(p, 2))},
                "bein-l": {"rot": (20 * max(0.0, s(p, 2)), 0, 0)},
                "bein-r": {"rot": (20 * max(0.0, s(p, 2)), 0, 0)},
            },
            extra("cheer", p),
        )

    out.append(k.Clip("cheer", 1.5, wave(1.5, 30, cheer)))

    def sad(p: float) -> k.Pose:
        w = smoothstep(0.0, 0.3, p) * (1 - smoothstep(0.8, 1.0, p))
        return merge(
            {
                "huepfer": {"scale": (1 + 0.05 * w, 1 - 0.08 * w, 1 + 0.05 * w)},
                "spine": {"rot": (22 * w, 0, 0)},
                "kopf": {"rot": (28 * w, 0, 10 * w * s(p, 1.5))},
                "arm-l": {"rot": (8 * w, 0, 6 * w)},
                "arm-r": {"rot": (8 * w, 0, -6 * w)},
            },
            extra("sad", p),
        )

    out.append(k.Clip("sad", 1.6, wave(1.6, 16, sad)))

    out.append(
        k.Clip(
            "fall",
            1.1,
            [
                (0.0, {}),
                (0.15, merge({"huepfer": {"rot": (-15, 0, 0)}, "arm-l": {"rot": (0, 0, -80)}, "arm-r": {"rot": (0, 0, 80)}}, extra("fall", 0.14))),
                (
                    0.45,
                    merge(
                        {
                            "huepfer": {"rot": (0, 0, 85), "loc": (0, -0.12, 0)},
                            "kopf": {"rot": (0, 0, 15)},
                            "bein-l": {"rot": (-30, 0, 0)},
                            "bein-r": {"rot": (20, 0, 0)},
                        },
                        extra("fall", 0.4),
                    ),
                ),
                (0.75, {"huepfer": {"rot": (0, 0, 80), "loc": (0, -0.12, 0)}}),
                (1.1, {}),
            ],
        )
    )
    return out
