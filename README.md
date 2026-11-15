# Chaos Party

Chaotisches 3D-Party-Brettspiel für 2–4 Personen im selben Raum. Das Spiel läuft auf dem PC; iPhones bzw. ein geteiltes iPad dienen per Browser als Controller.

**Brettspiel (M2) ausprobieren:** [docs/m2-demo.md](docs/m2-demo.md). Start, Beitritt und Netzwerk wie in [docs/m1-demo.md](docs/m1-demo.md). Ergebnisse in die [Gerätecheckliste](docs/device-test-checklist.md).

## Entwicklung

### Voraussetzungen

- Node.js **24** (siehe `.nvmrc`; mindestens 22.12)
- pnpm **10** – am einfachsten über Corepack: `corepack enable` (die Version steht in `package.json` → `packageManager`)

### Einrichten

```bash
pnpm install
pnpm dev
```

`pnpm dev` startet alle drei Apps parallel:

| App | Pfad | Adresse | Zweck |
|---|---|---|---|
| Host | `apps/host` | http://localhost:5173/host/ | Das Spiel auf dem PC (Babylon.js + React); `/ws` wird an den Server weitergeleitet |
| Controller | `apps/controller` | http://localhost:5174 | Controller für iPhone/iPad (Vite zeigt zusätzlich die LAN-Adresse an; `?code=…`, iPad: `&seats=2`) |
| Server | `apps/server` | http://localhost:8787 | Session-Server mit WebSocket `/ws`; `GET /health` |

**Production-Build (so wird gespielt):** `pnpm build && pnpm start`. Ein Prozess auf Port 8787 liefert den Host unter http://localhost:8787/host/, den Controller unter `/` und den WebSocket unter `/ws`. Das Terminal zeigt den LAN-Link mit Join-Code und QR-Code. Umgebungsvariablen: `PORT`, `HOST`, `JOIN_CODE` (fester Code), `PUBLIC_HOST`/`PUBLIC_PORT` (Adresse im QR erzwingen), `TERMINAL_QR=0`. Netzwerkprobleme: [docs/network-setup.md](docs/network-setup.md).

**Host-Szene allein ausprobieren** (ohne Handys und ohne Server): `/host/?local=1` öffnen. Steuerung per Tastatur – Spieler 1 WASD + Leertaste (Schubser), Spieler 2 Pfeiltasten + Enter, Spieler 3 IJKL + O, Spieler 4 Ziffernblock 8/4/5/6 + 0. URL-Parameter: `?players=1–4` (Standard 2), `?seed=` (Standard 2026), `?test=1` für den deterministischen Testmodus (Details in [ADR-004](docs/decisions/ADR-004-host-szene.md)).

### Prüfungen (Quality Gates)

| Befehl | Prüft |
|---|---|
| `pnpm typecheck` | TypeScript strict in allen Paketen |
| `pnpm lint` | ESLint (typbasiert), keine Warnungen erlaubt |
| `pnpm format:check` | Prettier (`pnpm format` korrigiert) |
| `pnpm test` | Vitest über alle Pakete (`pnpm test:watch` im Watch-Modus) |
| `pnpm build` | Production-Build von Host, Controller und Server |
| `pnpm check:licenses` | Lizenzen der Laufzeit-Abhängigkeiten gegen Positivliste |
| `pnpm check` | alles oben in dieser Reihenfolge |
| `pnpm test:e2e` | Playwright (Chromium) gegen die Production-Builds und den echten Node-Server: Host-Szene und Havok, Lobby/QR, iPhone- und iPad-Controller (Emulation, synthetisches Multitouch), Reconnect, Screenshot-Vergleiche. Separat, weil langsamer. Browser einmalig: `pnpm exec playwright install chromium`. Details: [docs/testing.md](docs/testing.md) |

Dieselben Schritte laufen in CI (`.github/workflows/ci.yml`) nach `pnpm install --frozen-lockfile`, danach `pnpm test:e2e`. Screenshot-Baselines liegen unter `tests/e2e/__screenshots__/` (nur Linux); nach gewollten Optikänderungen mit `pnpm test:e2e --update-snapshots` neu erzeugen.

### Aufbau

```text
apps/
  host/         PC-Spiel: Babylon.js/Havok-Szene (src/scene), React-HUD, Eingabequellen (src/input)
  controller/   Browser-Controller für iPhone und geteiltes iPad (Vite + React; src/net, src/state, src/zones)
  server/       Node-Server: Session (Join-Code, Slots, Tokens, Reconnect), WebSocket, LAN-Adresswahl, Auslieferung
packages/
  protocol/     Typisierte, versionierte Nachrichten mit zod-Validierung
  game-core/    Reine Spielregeln, Seeded RNG
tests/
  e2e/          Playwright-Tests (Konfiguration: playwright.config.ts)
```

Interne Pakete werden als TypeScript-Quelle importiert (`@chaos-party/protocol`, `@chaos-party/game-core`), ohne eigenen Build. Begründung und Alternativen: [ADR-002](docs/decisions/ADR-002-workspace-tooling.md).

## Projektdokumente (Quelle der Wahrheit)

- [`VISION.md`](VISION.md) – Produktvision, Säulen, Umfang des Vertical Slice
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – Zielarchitektur, Stack, Protokoll, Tests
- [`ROADMAP.md`](ROADMAP.md) – Meilensteine M1–M4 mit Abnahme-Gates
- [`CLAUDE.md`](CLAUDE.md) – Arbeitsanweisungen für Claude Code

## Arbeitsartefakte (`docs/`)

- [`docs/progress.md`](docs/progress.md) – Meilensteinstand, geprüfte Befehle, nächste Schritte
- [`docs/assumptions.md`](docs/assumptions.md) – zu validierende Annahmen mit Validierungsweg
- [`docs/decisions/`](docs/decisions/README.md) – Architekturentscheidungen (ADRs)
- [`docs/experiments.md`](docs/experiments.md) – Experiment-Log
- [`docs/m1-demo.md`](docs/m1-demo.md) – M1 auf echten Geräten ausprobieren
- [`docs/m2-demo.md`](docs/m2-demo.md) – M2-Brettspiel ausprobieren
- [`docs/device-test-checklist.md`](docs/device-test-checklist.md) – Gerätecheckliste für die Abnahme
- [`docs/network-setup.md`](docs/network-setup.md) – Firewall, WLAN, Adresswahl
- [`docs/ipad-zonen.md`](docs/ipad-zonen.md) – geteiltes iPad: Layouts und Grenzen

Aufgaben werden in Zunder im Projekt **Chaos Party** (Kennung `CHAOS-…`) geführt.

## Arbeitsweise mit Claude Code

Claude Code arbeitet die Zunder-Aufgaben Meilenstein für Meilenstein ab; jeder Meilenstein endet mit einer menschlichen Abnahme. Regeln stehen in `CLAUDE.md` („Task management with Zunder“), die Abläufe als Projekt-Skills in `.claude/skills/`:

| Skill | Zweck |
|---|---|
| `aufgabe-umsetzen` | `CHAOS-…`-Aufgabe oder die nächste freie Aufgabe umsetzen |
| `meilenstein-abnahme` | Abnahme vorbereiten, Entscheidung eintragen |
| `experiment-protokollieren` | Varianten-Vergleiche nach Experiment-Protokoll festhalten |
| `blocker-eskalieren` | Nach drei Fehlversuchen oder bei Freigabebedarf sauber eskalieren |
