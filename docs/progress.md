# Fortschritt

**Stand:** 2026-11-16 (M4 freigegeben; CHAOS-73: Grafik-Engpass auf echter GPU gefunden und behoben, Messung an Rubens PC offen; CHAOS-75: Renderer-Spike mit Prototypen und ADR-016-Entwurf, Messung durch Ruben offen; CHAOS-54: viertes Minispiel „Kuckucks-Klatsche“ in der Rotation, EXP-016; CHAOS-78: native RealityKit-App für macOS/tvOS, iPhone/iPad als Benchmark, EXP-017) · **Aktueller Meilenstein:** M4 – Vollständiger Vertical Slice (`CHAOS-4`)

Aufgabenstatus im Detail führt Zunder (Projekt „Chaos Party“, `CHAOS-…`). Diese Datei ist der dauerhafte Schnappschuss im Repo: Meilensteinstand, geprüfte Befehle, nächste Schritte.

## Meilensteine

| Meilenstein | Epic | Gate | Status |
|---|---|---|---|
| M1 – Technischer Durchstich | CHAOS-1 | CHAOS-16 | **APPROVED** 2026-11-15 (nur iPhone getestet, iPad offen) |
| M2 – Spielbares Brett | CHAOS-2 | CHAOS-25 | **APPROVED** 2026-11-15 (nur iPhone getestet, iPad nach M3 verschoben) ([`acceptance/M2.md`](acceptance/M2.md)) |
| M3 – Party-Identität und Minispiele | CHAOS-3 | CHAOS-35 | **APPROVED** 2026-11-15 (Optik → eigenes Epic CHAOS-56) ([`acceptance/M3.md`](acceptance/M3.md)) |
| M4 – Vollständiger Vertical Slice | CHAOS-4 | CHAOS-43 | **APPROVED** 2026-11-16 trotz Ruckeln; Performance auf echter Hardware folgt (CHAOS-73) ([`acceptance/M4.md`](acceptance/M4.md)) |

## M1 – Aufgaben

| Aufgabe | Inhalt | Stand |
|---|---|---|
| CHAOS-5 | Annahmenliste + Arbeitsartefakte | erledigt (PR #2) |
| CHAOS-6 | pnpm-Monorepo + Pipelines | erledigt (PR #3) |
| CHAOS-7 | Typisiertes WebSocket-Protokoll (ADR-003) | erledigt (PR #4) |
| CHAOS-8 | Babylon.js-Szene + Havok (ADR-004) | erledigt (PR #4) |
| CHAOS-9 | Session-Server (ADR-005) | erledigt (PR #4) |
| CHAOS-10 | iPhone-Controller-UI (ADR-006) | erledigt (PR #4) |
| CHAOS-11 | QR-Join über LAN (ADR-007) | erledigt (PR #4) |
| CHAOS-12 | Reconnect/Disconnect (ADR-009) | erledigt (PR #4) |
| CHAOS-13 | Shared-iPad-Zonen (ADR-008) | erledigt (PR #4) |
| CHAOS-14 | Playwright + Integrationstests (`testing.md`) | erledigt (PR #4) |
| CHAOS-45 | Messanzeige Latenz/Bildrate (ADR-010) | erledigt (PR #4) |
| CHAOS-15 | Gerätecheckliste, Demo-Anleitung, Abnahmebericht | erledigt (PR #4) |
| CHAOS-16 | **M1-Abnahme (Ruben)** | APPROVED 2026-11-15, siehe [`acceptance/M1.md`](acceptance/M1.md) |

## M2 – Aufgaben

Umgesetzt in **einem** PR (Branch `claude/chaos-2-orchestrierung-subagents-uuzx8a`), orchestriert mit Subagenten: Verträge zuerst (Protokoll v2, game-core-Typen), dann parallel Regeln, Brett + Host, Controller; danach Server-Integration, Integrationstests und Experimente.

| Aufgabe | Inhalt | Stand |
|---|---|---|
| CHAOS-17 | game-core: Zustandsautomat mit Seeded RNG (ADR-011) | im PR |
| CHAOS-18 | Brett „Wackelwald“ als Daten + Validierung, prozedurale Host-Szene | im PR |
| CHAOS-19 | Würfeln, Zugreihenfolge, Pfadwahl, Bewegung (Regeln + Animation) | im PR |
| CHAOS-20 | Münzen, Trophäen, Ökonomie, HUD | im PR |
| CHAOS-21 | Items (Doppelwürfel, Münzklau, Falle, Schild) + Reaktionsfenster | im PR |
| CHAOS-22 | Controller-Kontext der Brettphase (iPhone, iPad-Zonen), Server-Verdrahtung | im PR |
| CHAOS-23 | Deterministische Integrationstests des Zugzyklus | im PR |
| CHAOS-24 | Experimente EXP-001 … EXP-004 | im PR |
| CHAOS-48 | Warnung bei belegtem `localhost` | im PR |
| CHAOS-47 | **Ruben:** iPad-Nachtest aus M1 (I1–I9) | nach M3 verschoben (Ruben, 2026-11-15), Voraussetzung für CHAOS-43 |
| CHAOS-25 | **M2-Abnahme (Ruben)** | APPROVED 2026-11-15 |

## M3 – Aufgaben

Umgesetzt in **einem** PR ([#6](https://github.com/rubenvitt/chaos-party/pull/6), Branch `claude/inspiring-darwin-1iwg23`, gestapelt auf den M2-Branch), orchestriert mit Subagenten: Verträge zuerst (minigame-sdk, Protokoll v3, game-core, Server, Vorschau), dann parallel Figuren/Assets, je ein Minispiel pro Kategorie (mit Konzeptvergleich), Host-Bühne + Ton/VFX und Controller; Integration, übergreifende Tests und Doku durch den Koordinator.

| Aufgabe | Inhalt | Stand |
|---|---|---|
| CHAOS-26 | minigame-sdk: Vertrag, Laufzeit (fester Takt), Headless-Harness, Host-Bühne (ADR-012) | im PR |
| CHAOS-27 | Art Direction + vier Figuren (GLB aus eigenem Generator) | im PR |
| CHAOS-28 | Asset-Paket, Manifest, `pnpm check:assets` in CI | im PR |
| CHAOS-29 | Konzeptvergleiche EXP-005 … EXP-007 | im PR |
| CHAOS-30 | Arcade: Sockenregen | im PR |
| CHAOS-31 | Physik: Pudding-Gerangel (Havok) | im PR |
| CHAOS-32 | Hybrid: Wackelturm | im PR |
| CHAOS-33 | Anleitungen, Ergebnisse, Ton, VFX, Animation (Host + Controller) | im PR |
| CHAOS-34 | Tests Brett ↔ Minispiel, Wertung, Cleanup, Screenshot-Regression | im PR |
| CHAOS-35 | **M3-Abnahme (Ruben)** | APPROVED 2026-11-15 |

## M4 – Aufgaben

Umgesetzt in **einem** PR ([#16](https://github.com/rubenvitt/chaos-party/pull/16), Branch `claude/affectionate-noether-ye4h0b`), orchestriert mit Subagenten in drei Phasen: (A) Verträge zuerst – Protokoll v4, game-core, Server, ADR-015; (B) parallel in eigenen Worktrees Host-UI, Controller-UI und Server-Robustheit; (C) parallel Performance- und Balance-Pass, danach Gesamt-E2E und Start-Ablauf. Integration, Gesamtprüfung und Doku durch den Koordinator.

| Aufgabe | Inhalt | Stand |
|---|---|---|
| CHAOS-36 | Lobby mit Figuren, Charakterwahl, Rundenwahl, Start/Pause/Ende (ADR-015) | im PR |
| CHAOS-37 | Gleichstandsregel, Trophäenzählung, Siegerbildschirm mit Podest, Revanche | im PR |
| CHAOS-38 | iPad-Zonen 2/3/4 in allen Phasen, gemischte Aufstellung, Reconnect je Phase, Auto-Pause bei Host-Verlust | im PR |
| CHAOS-55 | Minispiel-Münzen im Stand, „geteilt“/„abgebrochen“ am Controller, Ergebnis-Bestätigung | im PR |
| CHAOS-39 | Messung je Szene, `pnpm perf`, Optimierungen ([`performance.md`](performance.md)) | im PR |
| CHAOS-40 | EXP-011 … EXP-013, Runden-Vorschläge 10/16/20, Feinschliff | im PR |
| CHAOS-41 | Gesamtablauf-E2E, Gerätecheckliste Abschnitt 12, [`m4-demo.md`](m4-demo.md) | im PR |
| CHAOS-42 | `pnpm play`, `pnpm smoke`, [`known-issues.md`](known-issues.md), [`security-license-review.md`](security-license-review.md), Abnahmebericht | im PR |
| CHAOS-47 | **Ruben:** iPad-Nachtest aus M1 (I1–I9) | offen, Voraussetzung für CHAOS-43 |
| CHAOS-43 | **M4-Abnahme (Ruben)** | APPROVED 2026-11-16 (trotz Ruckeln, „hakelig langsam“) |
| CHAOS-73 | Ruckeln auf echter GPU: PCSS-Filterstufe `LOW`, Auflösungsgrenze je Grafikstufe, Automatik merkt sich die Stufe ([EXP-014](experiments.md)) | im PR, Messung an Rubens PC/Fernseher offen |
| CHAOS-75 (Backlog CHAOS-44) | Renderer-Spike: `?gpu=webgpu` am Brett, Bevy-Prototyp (WebAssembly + nativ) mit exportierter Brett-Szene, Recherche tvOS ([EXP-015](experiments.md), [ADR-016](decisions/ADR-016-renderer.md) Entwurf, [`renderer-spike.md`](renderer-spike.md)) | im PR, Messbogen R1–R11 durch Ruben offen |
| CHAOS-78 (Backlog CHAOS-44) | RealityKit-App (`spikes/renderer-realitykit`): macOS, tvOS, iPhone/iPad nur als Benchmark; USDZ-Konverter, GPU-Instancing, Host-Client an `/ws` ([EXP-017](experiments.md)) | im PR, echte Apple TV (R12) und saubere Mac-Messung (R13/R14) offen |

### Messwerte Performance (CHAOS-39)

SwiftShader (Xeon 2,3 GHz ×4, Chromium 153 headless, 1280×720, Seed 2026, 4 Bots) – nur relativ, keine Aussage über echte Hardware. Historie (altes Brett aus Grundkörpern, vor CHAOS-62):

| Szene | Bildabstand p50/p95 ms vorher → nachher | Draw Calls | Render-Schleifen |
|---|---|---|---|
| Brett | 217/576 → 162/453 (im Rauschen) | 187 → 150 | 1 |
| Finale (Brett dahinter) | 244/922 → kein Bild mehr | 184 → – | 2 → 1 |
| Podest | 351/902 → 100/226 | 71 | 2 → 1 |

Revanche ×3: Heap nach GC 20,0 → 21,3 MB, kein Leck. Server `board` ≈ 0,5/s à 1,4 kB. Hardware-Schwellen offen (Gerätecheckliste PF0–PF10). Details: [`performance.md`](performance.md).

Nach CHAOS-62 (Natur-Look, Sparstufe `minimal` bei Software-Rendering in halber Auflösung; Baseline `tests/perf/baseline.json` neu geschrieben):

| Szene | Bildabstand p50/p95 ms | Draw Calls | Render-Schleifen | Heap max MB |
|---|---|---|---|---|
| Brett | 204/899 | 256 (Bäume je Baum verformt, nicht instanzierbar; Schattenpass) | 1 | 194 |
| Minispiele | 223–322 / 507–892 | 205–260 (Natur-Kulisse) | 1 | 90–120 |
| Finale (Brett dahinter) | kein Bild | – | 1 | 175 |
| Podest | 63/106 | 71 | 1 | 130 |

Render-Pause hinter dem Finale und Messung je Szene funktionieren mit dem Natur-Brett; Revanche ×3: Heap nach GC 21,9 → 23,1 MB, kein Leck. Details: [`performance.md` §3a](performance.md#3a-nach-chaos-62-natur-look-aktuelle-baseline).

### Seeds (M4)

| Wo | Seed |
|---|---|
| E2E-Gesamtablauf (`m4-gesamtablauf.spec.ts`) | 2026, schnelles Test-Pacing, Minispiele 6 s |
| Server-Integration (Reconnect, Host-Verlust, gemischt, Determinismus, Fuzz) | siehe [`testing.md`](testing.md) (u. a. `INTEGRATION_SEEDS`, 424242, 99, Fuzz 1/2/3/2026) |
| Experimente EXP-011 … EXP-013 | Seeds 1–200 je Spielerzahl (`EXPERIMENTS=m4 …`) |
| Experiment EXP-016 (Kuckucks-Klatsche, CHAOS-54) | Seeds 1–300 je Zeile (`EXPERIMENTS=1 … experimentKuckuck`) |
| `pnpm perf` | 2026 |

### Seeds (M3)

| Wo | Seed |
|---|---|
| Server-Integration Brett ↔ Minispiel | 424242 + Spielerzahl (je Minispiel der Rotation), 20261115/7 für Fehlerfälle |
| Vertragsprüfung je Minispiel (`catalog.test.ts`) | 1000 + Spielerzahl, Bots mit Seed = Spielerzahl |
| Screenshot-Regression Minispiele | `seed=7`, vier Spieler, 120 feste Schritte |
| Experimente EXP-005 … EXP-007 | siehe `docs/experiments.md` |

### Seeds M2 (reproduzierbar)

| Wo | Seed |
|---|---|
| Server-Integrationstests (`apps/server/src/boardGame.integration.test.ts`) | 20261115 (2 Spieler), 7 (3 Spieler, auch Reaktionstest mit 10 Runden), 424242 (4 Spieler) |
| E2E-Brettspiel (`tests/e2e/fixtures/server.ts`) | `E2E_GAME_SEED = 2026` |
| Experimente (`EXPERIMENTS=1 …`) | 1–200 je Variante und Spielerzahl |
| Echte Partie | Terminal zeigt „Seed <Zahl>“; nachspielen mit `SEED=<Zahl> pnpm start` |

## Validierte Befehle

Stand 2026-11-15 (M4), lokal Node 22 / pnpm 10.28; CI Node 24 (`.nvmrc`), `ubuntu-latest`.

| Befehl | Ergebnis |
|---|---|
| `pnpm play` | ein Befehl: installiert/baut bei Bedarf, startet Port 8787, öffnet den Host (`OPEN=0` ohne Browser, `--rebuild`); frischer Klon bis `/health` ≈ 8 s (Linux) |
| `pnpm smoke` | ok – Rauchtest des Start-Ablaufs nach `pnpm build` (≈ 1–6 s), läuft in CI |
| `pnpm check` (M4, nach Merge von `main` mit CHAOS-62; CHAOS-41-Fix) | ok – 1420 Tests in 120 Dateien, 13 Laufzeit-Pakete, 51 Asset-Einträge (Porträts als WebP + Masken, Natur-Texturen und Himmel) |
| `pnpm test:e2e --trace off` (M4) | ok – 154 bestanden, 3 bewusst übersprungen, ≈ 5 min; mit Natur-Brett `m4-gesamtablauf host-pause host-finale` 2× hintereinander grün |
| CI-Nachstellung (CHAOS-41) | `CI=1 taskset -c 0-1 pnpm exec playwright test m2-brett-durchstich m4-gesamtablauf --project=chromium --repeat-each=5`: vorher 4 von 6 Läufen rot (Anleitung nicht gesehen, Podest „loading“, Revanche verloren), nach dem Fix 15/15 grün; `controller-m4` Endstand mit ±0,1–0,3 px Zeichenabstand stabil |
| `pnpm perf` | ok – Messläufe Partie + Revanche ×3 gegen Baseline, ≈ 6–7 min (nicht in CI); Baseline nach CHAOS-62 neu geschrieben |
| `E2E_SKIP_BUILD=1 PERF_GPU=1 PERF_VIEWPORT=1920x1080 PERF_DPR=1 pnpm perf -g Partie` | ok (2026-11-16, CHAOS-73, M3 Max) – Partie auf echter GPU im sichtbaren Fenster ohne VSync, ≈ 3 min; Brett 5,5 ms Median (vorher 26 ms), siehe [`performance.md` §3b](performance.md#3b-erste-messung-auf-echter-gpu-chaos-73) |
| `node scripts/spike-export-board.mjs` | ok (2026-11-16, CHAOS-75) – exportiert das Brett (Stufe `hoch`) nach `spikes/renderer-bevy/assets/export/`, ≈ 2–3 min unter Software-Rendering |
| `cd spikes/renderer-bevy && cargo build --release` / `./build-web.sh` | ok (2026-11-16, CHAOS-75, Rust 1.100, Bevy 0.20.1) – Erst-Build ≈ 10 min nativ, ≈ 8 min je WebAssembly-Variante; Messung nur auf echter Hardware ([`renderer-spike.md`](renderer-spike.md)) |
| `spikes/renderer-realitykit/convert/convert.sh`, `xcodegen generate`, `xcodebuild … -destination 'platform=macOS' / 'generic/platform=iOS Simulator' / 'generic/platform=tvOS Simulator'` | ok (2026-11-16, CHAOS-78, Xcode 27, bpy 5.3.0 mit Python 3.13 über uv) – siehe [`spikes/renderer-realitykit/README.md`](../spikes/renderer-realitykit/README.md) |
| `EXPERIMENTS=m4 pnpm exec vitest run packages/game-core/src/rules/experimentsM4.test.ts --silent=false` | Tabellen für EXP-011 … EXP-013 |
| `pnpm install --frozen-lockfile` | ok |
| `pnpm check` (typecheck, lint, format, test, build, Lizenzen, Assets) | ok – 1098 Unit-/Integrationstests, 12 Laufzeit-Pakete auf der Positivliste, 22 Asset-Einträge |
| `pnpm test:e2e --trace off` | ok – 108 Tests in 15 Specs (Desktop, iPhone hoch/quer, iPad quer/hoch), ~3,5 min |
| `pnpm check:assets` / `pnpm generate:assets` | Asset-Manifest prüfen / Figuren und Porträts neu erzeugen (Blender-venv, ADR-013) |
| `pnpm --filter @chaos-party/assets import:polyhaven` | ok (2026-11-15, CHAOS-62) – 18 Natur-Texturen (512²-WebP) und 6 Himmel (512 × 256-HDR) von Poly Haven, ≈ 5 s, braucht ImageMagick mit WebP |
| `/host/?qualitaet=<stufe>&stimmung=<id>` | Lobby (bzw. mit `local=1` die Arena) im Natur-Look mit fester Stufe; ohne `stimmung` Goldene Stunde (CHAOS-77) |
| `/host/?local=1&board=1&qualitaet=<hoch\|mittel\|niedrig\|minimal>&stimmung=<id>` | Brett im Natur-Look mit fester Grafikstufe und Lichtstimmung (CHAOS-62); ohne `qualitaet` startet `hoch` mit Automatik; ohne `stimmung` folgt das Licht der Runde (CHAOS-63) |
| `packages/assets/blender/portraits-all.sh` | ok (2026-11-15, CHAOS-61) – vier Porträts + Masken in ≈ 40 s (Cycles CPU), 7–12 KiB je Bild |
| `/host/?local=1&minigame=<id>&players=4` | Minispiel ohne Server mit Tastatur (`&flow=1` mit Anleitung und Ergebnis) |
| `lookdev.html?look=natur-<morgen\|mittag\|wolken\|abend\|daemmerung\|nacht>&shot=<brett\|figur\|minispiel>` | Look-Dev-Vitrine (Dev-Server, vorher `node scripts/fetch-lookdev-assets.mjs`); `&tune={…}` überschreibt Felder einer Lichtstimmung |
| `EXPERIMENTS=1 pnpm exec vitest run packages/game-core/src/rules/experiments.test.ts --silent=false` | ok – Tabellen für EXP-001 … EXP-004, ~7 s |
| `ROUNDS=3 SEED=2026 pnpm start` | Brettspiel mit 3 Runden und festem Seed; Terminal meldet den Seed beim Start |
| `pnpm build && pnpm start` | Host `http://localhost:8787/host/`, Controller `/`, WebSocket `/ws`; Terminal zeigt LAN-Link, Join-Code, QR |
| `pnpm dev` | Host :5173/host/, Controller :5174 (beide leiten `/ws` an :8787 weiter), Server :8787 |
| Manueller Durchstich (Koordinator, Chromium-Emulation) | Host + 2 iPhone-Seiten + iPad (2 Zonen) gegen echten Server: Join, Bereit, Start, Joysticks bewegen je die eigene Figur, keine Seitenfehler |

Details: [`testing.md`](testing.md).

## Arbeitsartefakte

| Datei | Zweck |
|---|---|
| [`assumptions.md`](assumptions.md) | Annahmen mit Validierungsweg und Stand |
| [`decisions/`](decisions/README.md) | ADR-001 … ADR-015 |
| [`experiments.md`](experiments.md) | Experiment-Log (EXP-001 … EXP-004 aus M2, EXP-005 … EXP-007 aus M3) |
| [`testing.md`](testing.md) | Test-Suiten, Ausführen, Baselines, Abdeckung je M1-Lieferumfang |
| [`m1-demo.md`](m1-demo.md) | M1 auf echten Geräten ausprobieren |
| [`device-test-checklist.md`](device-test-checklist.md) | Gerätecheckliste für die Abnahme (offen) |
| [`network-setup.md`](network-setup.md) | Firewall, WLAN, Adresswahl |
| [`ipad-zonen.md`](ipad-zonen.md) | Geteiltes iPad: Layouts und Grenzen |
| [`acceptance/M1.md`](acceptance/M1.md) | Abnahmebericht M1 |
| [`m2-demo.md`](m2-demo.md) | M2-Brettspiel ausprobieren |
| [`acceptance/M2.md`](acceptance/M2.md) | Abnahmebericht M2 (APPROVED) |
| [`m3-demo.md`](m3-demo.md) | M3-Minispiele ausprobieren |
| [`acceptance/M3.md`](acceptance/M3.md) | Abnahmebericht M3 (APPROVED) |
| [`art-direction.md`](art-direction.md) | Stil-Leitfaden, Figuren |
| [`m4-demo.md`](m4-demo.md) | M4: komplette Partie auf echten Geräten |
| [`acceptance/M4.md`](acceptance/M4.md) | Abnahmebericht M4 (offen) |
| [`known-issues.md`](known-issues.md) | Bekannte Probleme des Release Candidate |
| [`security-license-review.md`](security-license-review.md) | Sicherheits-, Lizenz- und Secret-Prüfung |
| [`performance.md`](performance.md) | Messmethode, Messwerte, Schwellen |
| [`renderer-spike.md`](renderer-spike.md) | Renderer-Spike CHAOS-75: Anleitung und Messbogen |
| `blockers.md` | nicht nötig (keine Blocker) |

## Nächste Schritte

1. M4-PR [#16](https://github.com/rubenvitt/chaos-party/pull/16) mergen (nach CI). Stand von `main` (CHAOS-60, CHAOS-61, CHAOS-64, CHAOS-62) ist eingemischt: Die Figurenwahl im Controller, die Plakette und der Endstand zeigen die neuen Blender-Porträts (Plakette mit der gewählten Figur), die M4-E2E-Tests öffnen Controller-Geräte im Chromium ohne GPU (`deviceBrowser`). Das Brett im Natur-Look (CHAOS-62) behält die M4-Fähigkeiten: Render-Pause hinter Trophäenzählung/Podest, Messung je Szene, gewählte Figuren und Revanche; die Minispiel-Bühne verbindet `ctx.look`/Grafikstufen mit der Pause (ADR-015).
2. **Performance auf echter Hardware (höchste Priorität):** Ruben erlebt die Partie als „hakelig langsam“. Erst messen (`?debug=1` → „Alle Szenen kopieren“, Checkliste PF0–PF10, N1–N7), dann die Ursache beheben (CHAOS-73; Kandidaten in [`performance.md`](performance.md) §3a, Podest CHAOS-71). Offen bleibt der iPad-Nachtest CHAOS-47 (Checkliste Abschnitt 4).
3. Grafik-Neuausrichtung CHAOS-56 läuft getrennt weiter: Look-Dev abgeschlossen (EXP-008, EXP-009; PR #7, #8). Figuren neu aus Blender-Skripten (CHAOS-58, ADR-013), von Ruben abgenommen. Controller-UI „Glas & Licht“ umgesetzt (CHAOS-59). Porträts der neuen Figuren in Lobby und Controller (CHAOS-61, Blender-Render, `docs/screenshots/chaos61-portraets.jpg`). Lichtstimmungen als Daten (`apps/host/src/lighting/moods.ts`, CHAOS-60, EXP-010): sechs Stimmungen inkl. Dämmerung und Nacht (Laternen, Glühwürmchen, leuchtende Felder), Ruben wählte den Lichtwechsel im Lauf der Partie (Runde 1 morgens, letzte Runde nachts). Natur-Look im Spiel erledigt (CHAOS-62, ADR-014): Modul `apps/host/src/nature/`, Brett als Insel mit Baumscheiben-Feldern (`board/natureBoard.ts`), Minispiele über den optionalen Vertrag `ctx.look` (Kulisse, PBR-Materialien), CC0-Texturen und -Himmel im Asset-Paket, Grafikstufen `hoch`/`mittel`/`niedrig` mit Automatik und Sparstufe `minimal` (Testmodus, Software-Rendering). Bilder: `docs/screenshots/chaos62-*.jpg`. Offen: Bildrate am Ziel-PC (Gerätecheckliste N1–N7). Lichtverlauf je Runde umgesetzt (CHAOS-63): Partie als Tag von Morgen bis Nacht, 4 s Überblendung beim Rundenwechsel ohne Nachladen, Minispiele erben die Runden-Stimmung, HUD nachts hell; Bild `docs/screenshots/chaos63-lichtverlauf.jpg`, Gerätetest Checkliste Abschnitt 14 (L1–L7). Lobby-Arena und Siegerpodest im Natur-Look (CHAOS-77): gemeinsame Bühnen-Kulisse `nature/stageLook.ts`, Lobby fest in der Goldenen Stunde (Baumstamm-Banden, Baumstumpf-Pfosten), Siegerehrung fest nachts (Holzpodest, leuchtende Slot-Deckel, Spot, Laternen), CSS-Hintergründe passend; Bilder `docs/screenshots/chaos77-*.jpg`, Gerätetest Checkliste Abschnitt 15 (LS1–LS5). Wackelnder E2E-Test „geteiltes iPad: zwei Finger steuern zwei Figuren“ behoben (CHAOS-64): Controller-Geräte laufen im Test in einem eigenen Chromium ohne GPU (siehe `docs/testing.md`).
4. **Renderer-Spike CHAOS-75:** Ruben misst mit [`renderer-spike.md`](renderer-spike.md) (R1–R11) und entscheidet über [ADR-016](decisions/ADR-016-renderer.md) (Vorschlag: bei Babylon bleiben, WebGPU bei ≥ 20 % Vorteil übernehmen, tvOS als eigener RealityKit-Spike mit Server auf PC/Mac).
   - **CHAOS-78:** RealityKit-App auf der echten Apple TV messen (Gerätecheckliste §17, R12) und die Mac-Werte R13/R14 ohne GeForce NOW wiederholen; danach ADR-Entwurf für den tvOS-Host und Rubens Entscheidung zu CHAOS-74.
5. Ideen außerhalb von M4 liegen im Backlog CHAOS-44 (u. a. Aufholhilfe, kürzere Anleitungen bei Wiederholung). Wachsende Sabotage ist seit CHAOS-67 umgesetzt (EXP-018: Klau/Falle +1 alle 5 Runden).
6. **Mehr Minispiel-Vielfalt (CHAOS-54):** Kuckucks-Klatsche ist überarbeitet (EXP-016) und läuft als viertes Minispiel in der Rotation (`packages/minigames/src/kuckucks-klatsche/`). Es ist das erste Minispiel nur mit Knopf A, gedacht auch für die kleinen Zonen am geteilten iPad. Bei 10 Runden kommt jedes Minispiel jetzt 2–3-mal statt 3–4-mal. Ruben prüft es mit Gerätecheckliste P6a; Bild: `docs/screenshots/chaos54-kuckucks-klatsche.jpg`. Die übrigen verworfenen Konzepte (Aufzieh-Takt, Krümel-Kehraus, Geysir-Gier) bleiben Kandidaten im Backlog (CHAOS-79).
7. **Minispiel-Ausbau auf ~200 (CHAOS-80):** Ruben möchte rund 200 Minispiele. Konzept steht in [`minigames/README.md`](minigames/README.md) (Fabrik aus Baukasten, gemeinsamen Prüfungen und Trichter) und [`minigames/katalog.md`](minigames/katalog.md) (200 Skizzen MG-001 … MG-200 in 20 Familien). Ruben hat das Konzept-Gate CHAOS-82 am 2026-11-16 freigegeben, mit Auflage: keine Gleichförmigkeit (README §5.5). Neue Spielformen ja, Schnellfeuer als eigene Rundenart, geheime Wahl am iPad seltener. Als Nächstes kommt das Fundament (CHAOS-83 … CHAOS-90).

## Offene Risiken (Kurzfassung)

Höchstes Risiko in M1 sind die Annahmen, die nur auf echter Hardware prüfbar sind: iPad-Multitouch für mehrere Zonen (A1–A3), LAN-Erreichbarkeit/Firewall/Client-Isolation (B1, B2), Latenz (B6) und Bildschirmsperre/Reconnect auf iOS (B7). Details und Validierungswege: [`assumptions.md`](assumptions.md).

Neu in M2: Ob das Brettspiel **Spaß macht** und verständlich ist, zeigen nur Testrunden mit Menschen. Alle Balance-Werte stammen aus Bot-Simulationen (EXP-001 … EXP-004). Das Reaktionsfenster (3 s) beruht auf angenommenen Reaktionszeiten; auf iOS gibt es keine Vibration als Hinweis.

Neu in M3: Ob die drei Minispiele Spaß machen, fair sind und schnell verstanden werden, zeigt nur der Test mit Menschen; alle Minispiel-Werte stammen aus Bot-Simulationen (EXP-005 … EXP-007). Leistung am echten PC während der Minispiele (Figuren, Partikel, Havok) ist ungemessen; unter ~4 Bilder/s läuft ein Minispiel langsamer als Echtzeit.

Neu in M4: Die Werte für Partiedauer, Gleichstandsregel und Sabotage stammen aus Bot-Simulationen (EXP-011 … EXP-013); der Halbzeit-Führende gewinnt dort 59–73 %. Ob eine ganze Partie trägt und Lust auf eine weitere macht, zeigt nur Rubens Gruppentest. Performance-Schwellen sind nur relativ (SwiftShader); echte Werte fehlen. Vollständige Liste: [`known-issues.md`](known-issues.md).
