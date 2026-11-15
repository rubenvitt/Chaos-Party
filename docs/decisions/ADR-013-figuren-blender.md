# ADR-013: Figuren aus Blender-Skripten (bpy) statt aus dem Babylon-Generator

**Status:** Angenommen
**Datum:** 2026-11-15
**Aufgabe:** CHAOS-58 (Teil von CHAOS-56)
**Betroffene Annahmen:** –

## Kontext

Nach M3 fand Ruben die Grafik „70er-Jahre-Stil“ (CHAOS-56). Im Look-Dev (EXP-008, EXP-009) fiel die Wahl auf „Stilisierte Natur“ mit Figuren in Animationsfilm-Qualität. Die M3-Figuren (CHAOS-27) entstanden in `packages/assets/src/generator/` aus Babylon-Grundkörpern: starre Teile an Gelenken, keine weichen Übergänge, kein Skinning. In dieser Form lässt sich der gewünschte Look nicht erreichen.

Ruben hat die Werkzeugwahl freigegeben („Pakete als Basis oder Blender + MCP“), keine bezahlten Assets. Freie Asset-Quellen für Figuren waren aus der Umgebung nicht erreichbar, und fremde Figurenpakete hätten die eigene Identität gekostet.

## Entscheidung

- Die Figuren entstehen als **Python-Skripte für Blender**, das als Python-Modul läuft (`bpy==5.3.0`, `packages/assets/blender/requirements.txt`), ohne Oberfläche und reproduzierbar: `packages/assets/blender/build-all.sh` schreibt `packages/assets/models/characters/<id>.glb`.
- Der Baukasten `figurkit.py` liefert weiche Körper aus Skin-Modifier + Subdivision, harte Formen (abgerundete Kästen, Drehkörper), Vertexfarben statt Texturen, Sheen für Fell und Strick sowie Klarlack für Augen und Lack. Dazu kommen Skelett, Skinning bzw. starre Teile an Knochen und der GLB-Export.
- `clips.py` enthält die sieben gemeinsamen Animationen (`CHARACTER_ANIMATIONS`), figurtypische Bewegung kommt über `extra()`.
- Der **Vertrag bleibt**: Füße bei y = 0, Blick +Z, Höhe 1,4–1,8, Grundfläche ≤ 0,5, Gelenk `huepfer`, Knoten `abzeichen`, Material `akzent`, Animationsnamen. `pnpm check:assets` prüft das wie bisher an den echten GLBs.
- Der Babylon-Figurengenerator (`characters.ts`, `clips.ts`, `kit.ts`, `generate.ts`) entfällt. Der TS-Generator erzeugt nur noch die Porträt-SVGs.
- Blender ist **nur Werkzeug** (GPL, wird nicht ausgeliefert). Die erzeugten Modelle sind Eigenwerk.
- Der Host lädt die GLBs wie bisher. Mit `loadCharacters(..., { keepPbr: true })` bleiben die PBR-Materialien erhalten (für den Natur-Look). Ohne die Option werden sie wie im M3-Brett in `StandardMaterial` umgewandelt, Vertexfarben bleiben dabei erhalten.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Babylon-Generator weiterentwickeln | Keine Subdivision, kein Skin-Modifier, kein Auto-Weighting. Weiche, organische Formen nur mit sehr viel eigenem Geometriecode. |
| CC0-Figurenpakete (z. B. Quaternius, Kenney) | Hosts in der Umgebung gesperrt; fremde Identität, andere Spiele nutzen dieselben Figuren. |
| Blender als Systempaket (apt, 4.0) | Älter, schwerer zu pinnen. Das pip-Modul ist versioniert und reicht ohne Oberfläche. |
| Bezahlte Modelle / Auftrag | Kosten brauchen Freigabe, Ruben wollte keine. |

## Konsequenzen

**Positiv**
- Figuren in deutlich höherer Qualität (Skinning, weiche Formen, Fell-Sheen), von Ruben im 3D-Artefakt abgenommen.
- Reproduzierbar aus Code, Änderungen sind als Diff prüfbar.
- Der Vertrag und die Asset-Prüfung bleiben unverändert in Kraft.

**Negativ / Risiken**
- Die Reproduzierbarkeit der GLBs wird in CI **nicht** geprüft (bpy ist ≈ 430 MB groß). Der frühere Test „Generator erzeugt die eingecheckten Dateien“ gilt nur noch für die Porträts. Gegenmaßnahme: Nach jeder Skriptänderung `build-all.sh` ausführen und die GLBs mit committen; `check:assets` prüft Vertrag und Budget.
- Das Budget je Figur steigt von 300 auf 384 KiB, weil Skinning-Daten (Gelenke, Gewichte) und Vertexfarben dazukommen. Ist-Stand: 110–324 KiB, 2 800–10 300 Dreiecke.
- Die Porträts zeigen noch die M3-Figuren (eigene Folgeaufgabe). **Nachtrag 2026-11-15 (CHAOS-61):** erledigt. Die Porträts entstehen jetzt ebenfalls in Blender (`portrait.py`, Cycles-Render als WebP mit Akzent-Maske), der TS-Generator in `packages/assets/src/generator/` ist entfernt. Renders sind nicht byte-gleich reproduzierbar; `check:assets` prüft Format, Maße, Alpha und das Paar Bild/Maske.

## Überprüfung

Neu bewerten, wenn bpy in CI gebraucht wird (dann ein Container-Job mit gepinnter Version), wenn Figuren handmodelliert werden sollen (Blender mit Oberfläche bzw. MCP) oder wenn die Bildrate am Ziel-PC mit vier geskinnten Figuren nicht reicht.
