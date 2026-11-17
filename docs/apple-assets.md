# USDZ-Assets für den nativen Apple-Host

Stand 2026-11-17, CHAOS-140, [ADR-019](decisions/ADR-019-nativer-apple-host.md) §5. Experiment: EXP-026 in [`experiments.md`](experiments.md).

Der native Host (RealityKit, Mac und Apple TV) zeigt dieselben Figuren und dieselbe Brett-Kulisse wie der Babylon-Host. Beides entsteht mit **einem Befehl** aus den Quellen im Repo und wird nicht eingecheckt.

## Befehl

```bash
pnpm build:apple-assets
```

| Option | Wirkung |
|---|---|
| `--nur=figuren` | nur die vier Figuren (≈ 30 s) |
| `--nur=brett` | nur die Kulisse (≈ 3 min unter Linux, Software-Rendering) |
| `--out=<ordner>` | anderer Ausgabeordner (Standard `build/apple-assets/`, aus dem Manifest) |
| `--ohne-pruefung` | Prüfungen auslassen |

Umgebung: `BLENDER_PYTHON` (Python mit `bpy` und `usd-core`; ohne die Variable legt das Skript `.venv-blender` mit `uv` an), `BOARD_EXPORT_TIMEOUT` (ms), `BOARD_EXPORT_VERBOSE=1`, `RK_CHECK=0` (keine RealityKit-Prüfung auf dem Mac).

Voraussetzungen: `pnpm install`, Playwright-Chromium (`pnpm exec playwright install chromium`), `uv` oder ein Python 3.13 mit `packages/assets/blender/requirements.txt`. Blender selbst ist nicht nötig, `bpy` kommt als Python-Paket.

## Ausgabe

| Datei | Inhalt |
|---|---|
| `figuren/<id>.usdz` | Figur direkt aus dem bpy-Skript (`packages/assets/blender/build.py <id> <ziel.usdz>`), ≈ 0,5–1 MB |
| `figuren/<id>.clips.json` | Lage der sieben Clips auf der Zeitleiste |
| `brett.usdz` | Kulisse aus dem Web-Host (Grafikstufe `hoch`), über Blender nach USDZ, ≈ 25 MB |
| `brett.szene.json` | Kamera, Sonne, Himmel, Figurenorte, **Felder** (`fields`), Instanz-Gruppen |
| `brett.instanzen.json` | Matrizen für Gras und Blumen (64 246 Instanzen) |
| `herkunft.json` | Lizenzen, Namensnennungen und Herkunft je Artefakt, Größe und SHA-256 |

## Vertrag für die Swift-Seite

**Koordinaten:** rechtshändig, Y oben, Meter, wie RealityKit. `brett.usdz` mit Identitäts-Transform einsetzen, dann gelten alle Weltkoordinaten aus den JSON-Dateien unverändert. Figuren blicken nach +z, Füße bei y = 0.

**Feld-Anker:** Jedes Feld aus game-core hat im Brett einen leeren Knoten `feld_<id>` (z. B. `feld_s07`) unter `felder`, auf der Feldoberfläche in der Feldmitte. `brett.findEntity(named: "feld_s07")?.position(relativeTo: nil)` ist der Standort einer Figur. Dieselben Daten stehen in `brett.szene.json` → `fields` (`id`, `anchor`, `kind`, `next`, `position`). Die Namensregel (`feld_` + ID, Zeichen außer `A–Z a–z 0–9 _` → `_`) steht in `apps/host/src/export/anchors.ts`. Mehrere Figuren auf einem Feld verteilt der Host selbst (wie `spreadPawns` im Babylon-Host).

**Figuren-Animationen:** USD kennt je Datei nur eine Animation. Alle Clips (`idle`, `run`, `jump`, `hit`, `cheer`, `sad`, `fall`) liegen deshalb nacheinander auf einer Zeitleiste mit 30 Bildern/s und 6 leeren Bildern dazwischen. `<id>.clips.json` nennt je Clip `start`/`end` in Sekunden ab Beginn und `loop`:

```swift
let source = figure.availableAnimations[0]
let clip = try AnimationResource.generate(with: source.definition.trimmed(start: idle.start, end: idle.end))
figure.playAnimation(idle.loop ? clip.repeat() : clip)
```

Der Spike `spikes/renderer-realitykit` macht das schon für `idle` (`SceneBuilder.playIdle`). Dass der Nullpunkt von `trimmed` dem ersten Bild der Zeitleiste entspricht, prüft `check_realitykit.swift` (Dauer = Ende des letzten Clips). Am Gerät ist das noch nicht angesehen.

**Slot-Farbe und Abzeichen:** wie im Babylon-Host. Das Material `akzent` färbt der Host in die Slot-Farbe. Der leere Knoten `abzeichen` (Brust, bewegt sich mit) trägt das Slot-Symbol.

**Materialien:** `UsdPreviewSurface` je Material mit Rauheit, Clearcoat, Metall und Leuchten. Die Vertexfarben der Figuren sind in eine Farbtextur je Figur gebacken (1024², `textures/<rig>_farbe.png` im USDZ), weil RealityKit Vertexfarben im Material ignoriert (EXP-017). **Sheen** (Fell, Strick) und **Subsurface** kennt UsdPreviewSurface nicht; sie fehlen gegenüber Babylon. In der Kulisse verlieren nur die Gras-Grundmeshes `gras_0…2` ihr Material (Vertexfarbe ohne Material, wie im Spike).

## Prüfungen

- **Ohne Mac** (Linux-CI, Job „Apple-Assets (USDZ)“): `packages/assets/usd/check_usdz.py` mit usd-core.
  - alle Validatoren von usd-core
  - Figuren: Clip-Tabelle passt zu Zeitleiste und Manifest, jedes Mesh hat ein Material, keine Vertexfarbe im Shader, `akzent` gebunden, `abzeichen` vorne, mit gebackenem Skinning Füße bei y = 0 und Höhe wie im Manifest (±0,1 m)
  - Brett: alle Feld-Anker genau einmal und auf 1 mm am Ort aus `fields`, alle Instanz-Grundmeshes, eingebettete Texturen
- **Herkunft:** Jede Textur im Brett-Export muss aus einem Manifest-Asset kommen, das das Artefakt in `from` nennt, oder eine Beschriftung (Wegweiser, „Am Zug“-Pfeil, gezeichnet mit Nunito) sein (`scripts/lib/board-images.mjs`). `pnpm check:assets` prüft die Einträge unter `builds` im Manifest und, wenn gebaut, die Budgets.
- **Auf dem Mac** zusätzlich `packages/assets/usd/check_realitykit.swift`: RealityKit lädt alles, Achsen, Feld-Anker, `abzeichen`, Länge der Zeitleiste.
- **Optik:** nur am Mac mit Augen, siehe [Gerätecheckliste](device-test-checklist.md), Abschnitt 25 „USDZ-Assets“.

## Bekannte Grenzen

- **Nicht bitgleich:** Zwei Läufe erzeugen gleichwertige, aber nicht bitgleiche Dateien. Blender packt die UV-Inseln über mehrere Objekte nicht immer gleich, und die Reihenfolge der Prims im USD schwankt. Das galt schon für die GLB-Figuren. Prims, Materialien, Clips und Anker sind gleich; die Prüfungen laufen auf den Inhalt.
- Die Kulisse ist eine Momentaufnahme: Beispiel-Spielstand, Tageslicht-Stimmung, ohne Wasseranimation, Laternen, Glühwürmchen, Lichtstimmungen und Nachbearbeitung (SSAO, Tiefenschärfe). Was davon der native Host braucht, klärt CHAOS-142/CHAOS-148.
- Himmelskuppeln und Dunst (`himmel_*`, `dunst`) sind im USDZ spiegelnde Kugeln; der Host blendet sie aus (wie der Spike).
- Größe: `brett.usdz` ≈ 25 MB (Budget 32 MiB im Manifest).
