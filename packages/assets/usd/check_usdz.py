"""Prüft die USDZ-Artefakte für den nativen Apple-Host (CHAOS-140) ohne Blender und ohne Mac.

    .venv-blender/bin/python -I packages/assets/usd/check_usdz.py build/apple-assets

Braucht nur `usd-core` (Pixars USD als Python-Paket, `packages/assets/blender/requirements.txt`).
Exit-Code 1 bei Fehlern. Geprüft wird:

- jede USDZ mit allen Validatoren von usd-core (`UsdValidation`, u. a. Paket-Kapselung,
  Materialbindung, Skelett, Texturen);
- Figuren (`figuren/<id>.usdz`): Clip-Tabelle `<id>.clips.json` passt zur Zeitleiste und zu den
  Animationsnamen im Manifest; Material `akzent` vorhanden und gebunden; jedes Mesh hat ein
  Material (RealityKit zeigt Vertexfarben nur ohne Material, die Farbe muss also aus der
  Textur kommen); `UsdPreviewSurface` liest keine Vertexfarbe; Knoten `abzeichen` vorne (+z);
  mit gebackenem Skinning Füße bei y = 0 und Höhe wie im Manifest;
- Brett (`brett.usdz`): jeder Feld-Anker aus `brett.szene.json` genau einmal und am richtigen
  Ort, alle Grundmeshes der Instanz-Gruppen vorhanden, Texturen eingebettet.

RealityKit selbst prüft das nicht: Laden und Aussehen bleiben eine Prüfung am Mac
(`packages/assets/usd/check_realitykit.swift`, Gerätecheckliste).
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from pxr import Gf, Usd, UsdGeom, UsdShade, UsdSkel, UsdValidation

HEIGHT_TOLERANCE = 0.1
"""Meter. Die Manifest-Höhe gilt für die Ruhepose, gemessen wird im ersten Bild von `idle`."""
FEET_TOLERANCE = 0.02
ANCHOR_TOLERANCE = 1e-3

errors: list[str] = []
notes: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def validate(path: Path) -> None:
    stage = Usd.Stage.Open(str(path))
    validators = UsdValidation.ValidationRegistry().GetOrLoadAllValidators()
    found = UsdValidation.ValidationContext(validators).Validate(stage)
    for error in found:
        if error.GetType() == UsdValidation.ValidationErrorType.Error:
            fail(f"{path.name}: {error.GetName()}: {error.GetMessage()}")


def world_bounds(stage: Usd.Stage, time: float) -> Gf.Range3d:
    cache = UsdGeom.BBoxCache(time, [UsdGeom.Tokens.default_])
    return cache.ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()


def baked(path: Path, tmp: Path, end: float) -> Usd.Stage:
    """Kopie der Figur mit gebackenem Skinning (Punkte je Bild statt Skelett)."""
    flat = tmp / f"{path.stem}_flat.usdc"
    Usd.Stage.Open(str(path)).Export(str(flat))
    stage = Usd.Stage.Open(str(flat))
    if any(p.IsA(UsdSkel.Root) for p in stage.Traverse()):
        if not UsdSkel.BakeSkinning(stage.Traverse(), Gf.Interval(stage.GetStartTimeCode(), end)):
            fail(f"{path.name}: Skinning lässt sich nicht backen")
    return stage


def check_figure(path: Path, manifest: dict, tmp: Path) -> None:
    figure = path.stem
    entry = next((a for a in manifest["assets"] if a["id"] == f"figur-{figure}"), None)
    if entry is None:
        fail(f"{path.name}: kein Manifest-Eintrag figur-{figure}")
        return
    clips_path = path.with_suffix(".clips.json")
    if not clips_path.exists():
        fail(f"{path.name}: {clips_path.name} fehlt")
        return
    table = json.loads(clips_path.read_text())
    clips = table["clips"]
    stage = Usd.Stage.Open(str(path))

    names = [c["name"] for c in clips]
    if sorted(names) != sorted(entry["animations"]):
        fail(f"{path.name}: Clips {names} ≠ Manifest {entry['animations']}")
    if stage.GetTimeCodesPerSecond() != table["fps"]:
        fail(f"{path.name}: {stage.GetTimeCodesPerSecond()} Bilder/s in USD, {table['fps']} in der Tabelle")
    if stage.GetStartTimeCode() != clips[0]["startFrame"] or stage.GetEndTimeCode() != clips[-1]["endFrame"]:
        fail(
            f"{path.name}: Zeitleiste {stage.GetStartTimeCode()}–{stage.GetEndTimeCode()} passt nicht "
            f"zur Tabelle {clips[0]['startFrame']}–{clips[-1]['endFrame']}"
        )
    for a, b in zip(clips, clips[1:]):
        if b["startFrame"] <= a["endFrame"]:
            fail(f"{path.name}: Clips {a['name']} und {b['name']} überlappen")

    materials = {p.GetName(): p for p in stage.Traverse() if p.IsA(UsdShade.Material)}
    if "akzent" not in materials:
        fail(f"{path.name}: Material „akzent“ fehlt (Slot-Farbe), vorhanden: {sorted(materials)}")
    bound: set[str] = set()
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        material, _ = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()
        if not material:
            fail(f"{path.name}: Mesh {prim.GetPath()} ohne Material")
            continue
        bound.add(material.GetPrim().GetName())
    if "akzent" in materials and "akzent" not in bound:
        fail(f"{path.name}: Material „akzent“ an keinem Mesh")
    for prim in stage.Traverse():
        if prim.IsA(UsdShade.Shader):
            shader_id = UsdShade.Shader(prim).GetIdAttr().Get()
            if shader_id == "UsdPrimvarReader_float3":
                fail(f"{path.name}: {prim.GetPath()} liest eine Vertexfarbe (RealityKit ignoriert das)")

    badge = [p for p in stage.Traverse() if p.GetName() == "abzeichen"]
    if len(badge) != 1:
        fail(f"{path.name}: {len(badge)} Knoten „abzeichen“ statt genau einem")
    else:
        at = UsdGeom.Xformable(badge[0]).ComputeLocalToWorldTransform(stage.GetStartTimeCode())
        z = at.ExtractTranslation()[2]
        if z <= 0:
            fail(f"{path.name}: „abzeichen“ hinter der Figur (z = {z:.3f}); Vorderseite muss +z sein")

    skinned = baked(path, tmp, float(clips[-1]["endFrame"]))
    idle = next((c for c in clips if c["name"] == "idle"), clips[0])
    box = world_bounds(skinned, float(idle["startFrame"]))
    feet, top = box.GetMin()[1], box.GetMax()[1]
    if abs(feet) > FEET_TOLERANCE:
        fail(f"{path.name}: Füße bei y = {feet:.3f} statt 0")
    if "height" in entry and abs(top - feet - entry["height"]) > HEIGHT_TOLERANCE:
        fail(f"{path.name}: Höhe {top - feet:.3f} m, Manifest {entry['height']} m")
    notes.append(
        f"{path.name}: {path.stat().st_size / 1024:.0f} KiB, {len(clips)} Clips bis "
        f"{clips[-1]['end']:.2f} s, Höhe {top - feet:.3f} m, Materialien {sorted(materials)}"
    )


def check_board(path: Path) -> None:
    scene_path = path.parent / "brett.szene.json"
    if not scene_path.exists():
        fail(f"{path.name}: brett.szene.json fehlt")
        return
    meta = json.loads(scene_path.read_text())
    stage = Usd.Stage.Open(str(path))
    by_name: dict[str, list[Usd.Prim]] = {}
    for prim in stage.Traverse():
        by_name.setdefault(prim.GetName(), []).append(prim)

    fields = meta.get("fields", [])
    if not fields:
        fail("brett.szene.json: keine Felder (`fields`)")
    for field in fields:
        prims = by_name.get(field["anchor"], [])
        if len(prims) != 1:
            fail(f"{path.name}: Feld-Anker {field['anchor']} {len(prims)}× statt genau einmal")
            continue
        at = UsdGeom.Xformable(prims[0]).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        got = at.ExtractTranslation()
        want = Gf.Vec3d(*field["position"])
        if (got - want).GetLength() > ANCHOR_TOLERANCE:
            fail(f"{path.name}: Feld-Anker {field['anchor']} bei {tuple(round(v, 3) for v in got)}, erwartet {tuple(want)}")

    for group in meta.get("instanced", []):
        name = group["mesh"].replace("-", "_")
        if name not in by_name:
            fail(f"{path.name}: Grundmesh {name} der Instanz-Gruppe {group['mesh']} fehlt")

    with zipfile.ZipFile(path) as package:
        textures = [n for n in package.namelist() if n.lower().endswith((".png", ".jpg", ".jpeg"))]
    if not textures:
        fail(f"{path.name}: keine Texturen eingebettet")
    notes.append(
        f"{path.name}: {path.stat().st_size / 1024 / 1024:.1f} MiB, {len(fields)} Feld-Anker, "
        f"{len(meta.get('instanced', []))} Instanz-Gruppen, {len(textures)} Texturen"
    )


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print("Aufruf: check_usdz.py <ordner> [--manifest=<packages/assets/manifest.json>]")
        raise SystemExit(2)
    root = Path(args[0])
    manifest_arg = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--manifest=")), None)
    manifest_path = Path(manifest_arg) if manifest_arg else Path(__file__).parents[1] / "manifest.json"
    manifest = json.loads(manifest_path.read_text())

    files = sorted(root.glob("*.usdz")) + sorted((root / "figuren").glob("*.usdz"))
    if not files:
        fail(f"{root}: keine USDZ-Dateien")
    tmp = Path(tempfile.mkdtemp(prefix="check-usdz-"))
    try:
        for path in files:
            validate(path)
            if path.parent.name == "figuren":
                check_figure(path, manifest, tmp)
            elif path.name == "brett.usdz":
                check_board(path)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if errors:
        print(f"USDZ-Prüfung fehlgeschlagen ({len(errors)} Fehler):")
        for e in errors:
            print(f"  ✗ {e}")
        raise SystemExit(1)
    for n in notes:
        print(f"  ✓ {n}")
    print(f"USDZ ok: {len(files)} Dateien geprüft.")


if __name__ == "__main__":
    main()
