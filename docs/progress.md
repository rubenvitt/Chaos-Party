# Fortschritt

**Stand:** 2026-11-15 (M1 freigegeben) · **Aktueller Meilenstein:** M2 – Spielbares Brett (`CHAOS-2`)

Aufgabenstatus im Detail führt Zunder (Projekt „Chaos Party“, `CHAOS-…`). Diese Datei ist der dauerhafte Schnappschuss im Repo: Meilensteinstand, geprüfte Befehle, nächste Schritte.

## Meilensteine

| Meilenstein | Epic | Gate | Status |
|---|---|---|---|
| M1 – Technischer Durchstich | CHAOS-1 | CHAOS-16 | **APPROVED** 2026-11-15 (nur iPhone getestet, iPad offen) |
| M2 – Spielbares Brett | CHAOS-2 | CHAOS-25 | aktuell |
| M3 – Party-Identität und Minispiele | CHAOS-3 | CHAOS-35 | gesperrt bis M2-Freigabe |
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

## Validierte Befehle

Stand 2026-11-14 (PR #4), lokal Node 22.23 / pnpm 10.28; CI Node 24 (`.nvmrc`), `ubuntu-latest`.

| Befehl | Ergebnis |
|---|---|
| `pnpm install --frozen-lockfile` | ok |
| `pnpm check` (typecheck, lint, format, test, build, Lizenzen) | ok – 505 Unit-/Integrationstests, 10 Laufzeit-Pakete auf der Positivliste |
| `pnpm test:e2e` | ok – 54 Tests in 7 Specs (Desktop, iPhone hoch/quer, iPad quer/hoch), ~1,4 min |
| `pnpm build && pnpm start` | Host `http://localhost:8787/host/`, Controller `/`, WebSocket `/ws`; Terminal zeigt LAN-Link, Join-Code, QR |
| `pnpm dev` | Host :5173/host/, Controller :5174 (beide leiten `/ws` an :8787 weiter), Server :8787 |
| Manueller Durchstich (Koordinator, Chromium-Emulation) | Host + 2 iPhone-Seiten + iPad (2 Zonen) gegen echten Server: Join, Bereit, Start, Joysticks bewegen je die eigene Figur, keine Seitenfehler |

Details: [`testing.md`](testing.md).

## Arbeitsartefakte

| Datei | Zweck |
|---|---|
| [`assumptions.md`](assumptions.md) | Annahmen mit Validierungsweg und Stand |
| [`decisions/`](decisions/README.md) | ADR-001 … ADR-010 |
| [`experiments.md`](experiments.md) | Experiment-Log (in M1 keine Gameplay-Experimente) |
| [`testing.md`](testing.md) | Test-Suiten, Ausführen, Baselines, Abdeckung je M1-Lieferumfang |
| [`m1-demo.md`](m1-demo.md) | M1 auf echten Geräten ausprobieren |
| [`device-test-checklist.md`](device-test-checklist.md) | Gerätecheckliste für die Abnahme (offen) |
| [`network-setup.md`](network-setup.md) | Firewall, WLAN, Adresswahl |
| [`ipad-zonen.md`](ipad-zonen.md) | Geteiltes iPad: Layouts und Grenzen |
| [`acceptance/M1.md`](acceptance/M1.md) | Abnahmebericht M1 |
| `blockers.md` | nicht nötig (keine Blocker) |

## Nächste Schritte

1. M2 (CHAOS-2) beginnt mit den freigegebenen Aufgaben, als Erstes CHAOS-17 (Zustandsautomat) und CHAOS-18 (3D-Brett).
2. **Ruben:** geteiltes iPad auf echtem Gerät nachtesten (CHAOS-47, Checkliste I1–I9), spätestens vor dem M2-Gate CHAOS-25.
3. Gerätewerte vom iPhone (P3, P9) nachtragen, sobald Ruben sie meldet.

## Offene Risiken (Kurzfassung)

Höchstes Risiko in M1 sind die Annahmen, die nur auf echter Hardware prüfbar sind: iPad-Multitouch für mehrere Zonen (A1–A3), LAN-Erreichbarkeit/Firewall/Client-Isolation (B1, B2), Latenz (B6) und Bildschirmsperre/Reconnect auf iOS (B7). Details und Validierungswege: [`assumptions.md`](assumptions.md).
