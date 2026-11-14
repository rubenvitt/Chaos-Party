# Chaos Party

Chaotisches 3D-Party-Brettspiel für 2–4 Personen im selben Raum. Das Spiel läuft auf dem PC; iPhones bzw. ein geteiltes iPad dienen per Browser als Controller.

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
| Host | `apps/host` | http://localhost:5173 | Das Spiel auf dem PC (Babylon.js + React) |
| Controller | `apps/controller` | http://localhost:5174 | Controller für iPhone/iPad (Vite zeigt zusätzlich die LAN-Adresse an) |
| Server | `apps/server` | http://localhost:8787 | Lokaler Session-Server; `GET /health` |

Production-Build lokal starten: `pnpm build && pnpm start` – der Server liefert dann den gebauten Controller unter http://localhost:8787 aus (ein Port für Controller und, ab CHAOS-9, WebSocket). `PORT` und `HOST` sind per Umgebungsvariable einstellbar.

QR-Join, LAN-Adresse und Firewall-Hinweise folgen mit CHAOS-11.

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
| `pnpm test:e2e` | Playwright (Chromium) gegen den Production-Build des Hosts: Havok lädt, Szene rendert, Tastatur bewegt Figuren, Screenshot-Vergleich. Separat, weil langsamer (~30 s). Browser einmalig: `pnpm exec playwright install chromium` |

Dieselben Schritte laufen in CI (`.github/workflows/ci.yml`) nach `pnpm install --frozen-lockfile`, danach `pnpm test:e2e`. Screenshot-Baselines liegen unter `tests/e2e/__screenshots__/` (nur Linux); nach gewollten Optikänderungen mit `pnpm test:e2e --update-snapshots` neu erzeugen.
### Aufbau

```text
apps/
  host/         PC-Spiel: Babylon.js/Havok-Szene (src/scene), React-HUD, Eingabequellen (src/input)
  controller/   Browser-Controller für iPhone und geteiltes iPad (Vite + React)
  server/       Node-Server: Controller-Auslieferung, ab CHAOS-9 WebSocket
packages/
  protocol/     Typisierte, versionierte Nachrichten (ab CHAOS-7 mit Validierung)
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

Aufgaben werden in Zunder im Projekt **Chaos Party** (Kennung `CHAOS-…`) geführt.

## Arbeitsweise mit Claude Code

Claude Code arbeitet die Zunder-Aufgaben Meilenstein für Meilenstein ab; jeder Meilenstein endet mit einer menschlichen Abnahme. Regeln stehen in `CLAUDE.md` („Task management with Zunder“), die Abläufe als Projekt-Skills in `.claude/skills/`:

| Skill | Zweck |
|---|---|
| `aufgabe-umsetzen` | `CHAOS-…`-Aufgabe oder die nächste freie Aufgabe umsetzen |
| `meilenstein-abnahme` | Abnahme vorbereiten, Entscheidung eintragen |
| `experiment-protokollieren` | Varianten-Vergleiche nach Experiment-Protokoll festhalten |
| `blocker-eskalieren` | Nach drei Fehlversuchen oder bei Freigabebedarf sauber eskalieren |
