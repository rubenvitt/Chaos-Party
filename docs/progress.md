# Fortschritt

**Stand:** 2026-11-14 · **Aktueller Meilenstein:** M1 – Technischer Durchstich (`CHAOS-1`)

Aufgabenstatus im Detail führt Zunder (Projekt „Chaos Party“, `CHAOS-…`). Diese Datei ist der dauerhafte Schnappschuss im Repo: Meilensteinstand, geprüfte Befehle, nächste Schritte.

## Meilensteine

| Meilenstein | Epic | Gate | Status |
|---|---|---|---|
| M1 – Technischer Durchstich | CHAOS-1 | CHAOS-16 | in Arbeit |
| M2 – Spielbares Brett | CHAOS-2 | CHAOS-25 | gesperrt bis M1-Freigabe |
| M3 – Party-Identität und Minispiele | CHAOS-3 | CHAOS-35 | gesperrt bis M2-Freigabe |
| M4 – Vollständiger Vertical Slice | CHAOS-4 | CHAOS-43 | gesperrt bis M3-Freigabe |

## M1 – Aufgaben

| Aufgabe | Inhalt | Stand |
|---|---|---|
| CHAOS-5 | Annahmenliste + Arbeitsartefakte | Review (PR offen) |
| CHAOS-6 | pnpm-Monorepo + Pipelines | offen, als Nächstes |
| CHAOS-7 | Typisiertes WebSocket-Protokoll | blockiert durch CHAOS-6 |
| CHAOS-8 | Babylon.js-Szene + Havok | blockiert durch CHAOS-6 |
| CHAOS-9 | Session-Server | blockiert durch CHAOS-7 |
| CHAOS-10 | iPhone-Controller-UI | blockiert durch CHAOS-7 |
| CHAOS-11 | QR-Join über LAN | blockiert durch CHAOS-9 |
| CHAOS-12 | Reconnect/Disconnect | blockiert durch CHAOS-9, CHAOS-10 |
| CHAOS-13 | Shared-iPad-Zonen | blockiert durch CHAOS-10 |
| CHAOS-14 | Playwright + Integrationstests | blockiert durch CHAOS-8, 11, 12, 13 |
| CHAOS-15 | Gerätecheckliste, Demo-Anleitung, Abnahmebericht | blockiert durch CHAOS-14 |
| CHAOS-16 | **M1-Abnahme (Ruben)** | blockiert durch CHAOS-15 |

## Validierte Befehle

Noch keine: Es gibt noch keinen Code. Ab CHAOS-6 stehen hier die Befehle, die tatsächlich lokal und in CI grün gelaufen sind (Install, typecheck, lint, format, test, build, dev).

## Arbeitsartefakte

| Datei | Zweck |
|---|---|
| [`assumptions.md`](assumptions.md) | Zu validierende Annahmen mit Validierungsweg und zuständiger Aufgabe |
| [`decisions/`](decisions/README.md) | Architekturentscheidungen (ADR-001: Stack) |
| [`experiments.md`](experiments.md) | Experiment-Log mit Vorlage |
| `device-test-checklist.md` | folgt in CHAOS-15 |
| `acceptance/M1.md` | folgt in CHAOS-15 |
| `blockers.md` | wird bei Bedarf angelegt (Skill `blocker-eskalieren`) |

## Nächste Schritte

1. CHAOS-6: Monorepo-Gerüst mit `apps/host`, `apps/controller`, `apps/server`, `packages/protocol`, `packages/game-core`; typecheck/lint/format/test/build lokal und in CI. Prüft Annahmen D1, B9.
2. Danach parallel möglich: CHAOS-7 (Protokoll) und CHAOS-8 (Babylon/Havok, Annahmen C1–C5).

## Offene Risiken (Kurzfassung)

Höchstes Risiko in M1 sind die Annahmen, die nur auf echter Hardware prüfbar sind: iPad-Multitouch für mehrere Zonen (A1–A3), LAN-Erreichbarkeit/Firewall/Client-Isolation (B1, B2), Latenz (B6) und Bildschirmsperre/Reconnect auf iOS (B7). Details und Validierungswege: [`assumptions.md`](assumptions.md).
