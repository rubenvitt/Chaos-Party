# Blocker

Offene und gelöste Blocker (Format: `.claude/skills/blocker-eskalieren`). Gespiegelt als Kommentar an der jeweiligen Zunder-Aufgabe.

## 2026-11-19 – Standbild Brett → Minispiel ist kein Kontextaufbau (CHAOS-174)

**Symptom:** `pnpm perf` (Mac, SwiftShader) zeigt beim Wechsel Brett → Minispiel einen längsten Block von Median ≈ 0,8 s. CHAOS-174 sollte ihn durch einen beibehaltenen WebGL-Kontext deutlich senken.

**Ursache (Stand):** Gesichert: Der Block hängt am ersten synchronen GL-Aufruf nach dem Ausblenden des Bretts, nicht am Kontextaufbau; mit 1,5 s Abstand kostet `new Engine(…)` 15–20 ms (EXP-030). Vermutet: SwiftShader arbeitet noch vorausgelaufene Brett-Bilder im GPU-Prozess ab; auf echter GPU wäre das kurz.

**Versuche:** 1. Geteilte Minispiel-Engine (A) → Median 1344 ms, Block wandert in `engine.resize()`; 2. dieselbe ohne Größenwechsel (A′) → Median 789 ms, Block wandert ins Figuren-Laden; 3. Messprobe mit 1,5 s Verzögerung (B) → Median 143 ms, Kontext billig.

**Optionen:**

- A: Aufgabe verwerfen und N4 auf echter Hardware abwarten; nur bei echtem Standbild weitermachen. Kein Aufwand, kein Risiko. **Empfehlung.**
- B: Vor dem Aufbau der Bühne asynchron warten, bis der GPU-Prozess leer ist (WebGL2-Fence abfragen), auch für die Stimmungs-Vorbereitung des Bretts. ≈ halber Tag. Senkt die Kennzahl, aber auf SwiftShader steht das Bild in der Zeit trotzdem, und die Anleitung zeigt ihren Hintergrund später.
- C: Geteilte Engine trotzdem behalten (Effekt-Cache, kein Kontext-Wechsel). Dauerhaft zweiter Kontext am Brett ohne gemessenen Gewinn. Nicht empfohlen.

**Frage an Ruben:** Darf CHAOS-174 verworfen werden, bis N4 auf echter Hardware ein Standbild beim Wechsel Brett → Minispiel zeigt (Option A)?

**Status:** gelöst 2026-11-19: Option A. Ruben: „Keine Ahnung, was ich entscheiden muss, aber entscheide du für mich.“ Claude hat entschieden: CHAOS-174 verworfen. Kommt bei N4 auf echter Hardware ein Standbild beim Wechsel Brett → Minispiel heraus, entsteht eine neue Aufgabe mit diesem Messwert.
