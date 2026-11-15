# Fortschritt

**Stand:** 2026-11-15 (M2 freigegeben) · **Aktueller Meilenstein:** M3 – Party-Identität und Minispiele (`CHAOS-3`)

Aufgabenstatus im Detail führt Zunder (Projekt „Chaos Party“, `CHAOS-…`). Diese Datei ist der dauerhafte Schnappschuss im Repo: Meilensteinstand, geprüfte Befehle, nächste Schritte.

## Meilensteine

| Meilenstein | Epic | Gate | Status |
|---|---|---|---|
| M1 – Technischer Durchstich | CHAOS-1 | CHAOS-16 | **APPROVED** 2026-11-15 (nur iPhone getestet, iPad offen) |
| M2 – Spielbares Brett | CHAOS-2 | CHAOS-25 | **APPROVED** 2026-11-15 (nur iPhone getestet, iPad nach M3 verschoben) ([`acceptance/M2.md`](acceptance/M2.md)) |
| M3 – Party-Identität und Minispiele | CHAOS-3 | CHAOS-35 | freigegeben, als Nächstes |
| M4 – Vollständiger Vertical Slice | CHAOS-4 | CHAOS-43 | gesperrt bis M3-Freigabe |

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
| CHAOS-25 | **M2-Abnahme (Ruben)** | offen |

### Seeds (reproduzierbar)

| Wo | Seed |
|---|---|
| Server-Integrationstests (`apps/server/src/boardGame.integration.test.ts`) | 20261115 (2 Spieler), 7 (3 Spieler, auch Reaktionstest mit 10 Runden), 424242 (4 Spieler) |
| E2E-Brettspiel (`tests/e2e/fixtures/server.ts`) | `E2E_GAME_SEED = 2026` |
| Experimente (`EXPERIMENTS=1 …`) | 1–200 je Variante und Spielerzahl |
| Echte Partie | Terminal zeigt „Seed <Zahl>“; nachspielen mit `SEED=<Zahl> pnpm start` |

## Validierte Befehle

Stand 2026-11-15 (M2), lokal Node 22 / pnpm 10.28; CI Node 24 (`.nvmrc`), `ubuntu-latest`.

| Befehl | Ergebnis |
|---|---|
| `pnpm install --frozen-lockfile` | ok |
| `pnpm check` (typecheck, lint, format, test, build, Lizenzen) | ok – 791 Unit-/Integrationstests, 10 Laufzeit-Pakete auf der Positivliste |
| `pnpm test:e2e --trace off` | ok – 89 Tests in 11 Specs (Desktop, iPhone hoch/quer, iPad quer/hoch), ~2,6 min |
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
| [`decisions/`](decisions/README.md) | ADR-001 … ADR-011 |
| [`experiments.md`](experiments.md) | Experiment-Log (EXP-001 … EXP-004 aus M2) |
| [`testing.md`](testing.md) | Test-Suiten, Ausführen, Baselines, Abdeckung je M1-Lieferumfang |
| [`m1-demo.md`](m1-demo.md) | M1 auf echten Geräten ausprobieren |
| [`device-test-checklist.md`](device-test-checklist.md) | Gerätecheckliste für die Abnahme (offen) |
| [`network-setup.md`](network-setup.md) | Firewall, WLAN, Adresswahl |
| [`ipad-zonen.md`](ipad-zonen.md) | Geteiltes iPad: Layouts und Grenzen |
| [`acceptance/M1.md`](acceptance/M1.md) | Abnahmebericht M1 |
| [`m2-demo.md`](m2-demo.md) | M2-Brettspiel ausprobieren |
| [`acceptance/M2.md`](acceptance/M2.md) | Abnahmebericht M2 (APPROVED) |
| `blockers.md` | nicht nötig (keine Blocker) |

## Nächste Schritte

1. M3 (CHAOS-3) beginnt mit dem Minispiel-Vertrag (CHAOS-26), Art-Direction (CHAOS-27) und Asset-Pipeline (CHAOS-28).
2. Offene Fragen 1–5 aus [`acceptance/M2.md`](acceptance/M2.md) in den M3-Testrunden klären.
3. Nach dem M3-Gate: iPad-Nachtest CHAOS-47 (Voraussetzung für das M4-Gate CHAOS-43).

## Offene Risiken (Kurzfassung)

Höchstes Risiko in M1 sind die Annahmen, die nur auf echter Hardware prüfbar sind: iPad-Multitouch für mehrere Zonen (A1–A3), LAN-Erreichbarkeit/Firewall/Client-Isolation (B1, B2), Latenz (B6) und Bildschirmsperre/Reconnect auf iOS (B7). Details und Validierungswege: [`assumptions.md`](assumptions.md).

Neu in M2: Ob das Brettspiel **Spaß macht** und verständlich ist, zeigen nur Testrunden mit Menschen. Alle Balance-Werte stammen aus Bot-Simulationen (EXP-001 … EXP-004). Das Reaktionsfenster (3 s) beruht auf angenommenen Reaktionszeiten; auf iOS gibt es keine Vibration als Hinweis.
