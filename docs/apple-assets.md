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
  - Figuren, Auflage (CHAOS-161): aufgesetzte Teile schweben nicht über ihrem Träger (`AUFLAGE` in `check_usdz.py`: Socken-Bündchen auf dem Schaft, Kaktus-Blüte auf dem Kaktus, Kaktus im Topf). Gemessen wird der Median des Abstands der Unterseite (unterste 2 cm) zur Trägeroberfläche, Punkte im Träger zählen 0, erlaubt sind 3 cm; in der Ruhepose und am Anfang und in der Mitte jedes Clips, mit gebackenem Skinning. Bounds allein fanden den Fehler nicht.
  - Brett: alle Feld-Anker genau einmal und auf 1 mm am Ort aus `fields`, alle Instanz-Grundmeshes, eingebettete Texturen
- **Herkunft:** Jede Textur im Brett-Export muss aus einem Manifest-Asset kommen, das das Artefakt in `from` nennt, oder eine Beschriftung (Wegweiser, „Am Zug“-Pfeil, gezeichnet mit Nunito) sein (`scripts/lib/board-images.mjs`). `pnpm check:assets` prüft die Einträge unter `builds` im Manifest und, wenn gebaut, die Budgets.
- **Auf dem Mac** zusätzlich `packages/assets/usd/check_realitykit.swift`: RealityKit lädt alles, Achsen, Feld-Anker, `abzeichen`, Länge der Zeitleiste und dieselbe Auflage-Prüfung mit den Meshes, wie RealityKit sie geladen hat (nur Ruhepose: das verformte Skinning gibt RealityKit nicht an die CPU heraus).
- **Optik:** nur am Mac mit Augen, siehe [Gerätecheckliste](device-test-checklist.md), Abschnitt „USDZ-Assets“.

## Bekannte Grenzen

- **Skin-Modifier-Enden (CHAOS-161):** Skin-Modifier plus Subdivision runden ein Körperende etwa um den Knotenradius ab. Wer ein Teil auf ein Ende setzt (Bündchen, Blüte, Hut), braucht einen Knoten, der bis ins Teil reicht, oder muss das Teil auf die Kuppel absenken; die Auflage-Prüfung meldet es sonst. Rippen und andere Wellen um eine Achse brauchen eine Wellenzahl, die zu den Punkten rundum passt (16 bei Subdivision 2), sonst knittert die Fläche.

- **Nahbilder ohne Mac (CHAOS-162):** `packages/assets/blender/nahbild.py <id> <ziel.png>` rendert eine Figur in Cycles aus drei Blickwinkeln (Dreiviertel, Profil, von oben). Die Babylon-Vitrine zeigt eine Figur aus der Nähe mit `preview.html?nah=<Slot 1–4>`. RealityKit-Nahbilder (`--nah`) gibt es weiter nur am Mac.
- **Farbatlas packen (CHAOS-162):** Smart UV Project allein legte bei fein unterteilten Figuren Inseln übereinander (Knopffarbe auf der Sockenspitze). `bake_vertex_colors` packt die Inseln danach neu (`pack_islands`, ohne Überlappung).

- **Nicht bitgleich:** Zwei Läufe erzeugen gleichwertige, aber nicht bitgleiche Dateien. Blender packt die UV-Inseln über mehrere Objekte nicht immer gleich, und die Reihenfolge der Prims im USD schwankt. Das galt schon für die GLB-Figuren. Prims, Materialien, Clips und Anker sind gleich; die Prüfungen laufen auf den Inhalt.
- Die Kulisse ist eine Momentaufnahme: Beispiel-Spielstand, Tageslicht-Stimmung, ohne Wasseranimation, Laternen, Glühwürmchen, Lichtstimmungen und Nachbearbeitung (SSAO, Tiefenschärfe). Der native Host zeigt die Kulisse so (CHAOS-142); Lichtstimmungen und Effekte folgen mit CHAOS-148.
- Himmelskuppeln und Dunst (`himmel_*`, `dunst`) sind im USDZ spiegelnde Kugeln; der Host blendet sie aus (wie der Spike).
- Größe: `brett.usdz` ≈ 25 MB (Budget 32 MiB im Manifest).
