# ADR-002: Workspace-Aufbau und Werkzeuge

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-6
**Betroffene Annahmen:** `docs/assumptions.md` D1, B9

## Kontext

ADR-001 legt pnpm, Vitest, React und Babylon.js fest und verschiebt Bundler, Node-Version, Lint/Format und den Paketschnitt in CHAOS-6. Ziel ist das **kleinste wartbare** Monorepo, das alle Quality Gates aus `CLAUDE.md` lokal und in CI abbildet und auf dem CHAOS-7 (Protokoll) und CHAOS-8 (Babylon/Havok) parallel aufsetzen können.

## Entscheidung

| Bereich | Wahl |
|---|---|
| Pakete | `apps/host`, `apps/controller`, `apps/server`, `packages/protocol`, `packages/game-core`. **Nicht** angelegt: `minigame-sdk`, `ui`, `assets`, `tests/` – erst, wenn es Inhalt dafür gibt (M2/M3). |
| Interne Pakete | Exportieren ihre **TypeScript-Quelle** direkt (`"exports": { ".": "./src/index.ts" }`), kein eigener Build-Schritt. Vite, Vitest, tsx und esbuild lesen TS nativ. |
| Node | `.nvmrc` = 24 (aktive LTS, CI); `engines` erlaubt ab 22.12 (Vite 8/Vitest 5-Minimum). |
| TypeScript | 6.0 mit `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; gemeinsame `tsconfig.base.json`, `tsc --noEmit` je Paket. TypeScript 7 (native) erst, wenn typescript-eslint es unterstützt (derzeit `<6.1`). |
| Bundler/Dev-Server | Vite 8 für Host und Controller (`host: true`, damit echte Geräte den Dev-Server im LAN erreichen). |
| Server | Reines `node:http` ohne Framework; Dev mit `tsx watch`, Build mit esbuild zu einer ESM-Datei `dist/main.js` (bündelt die TS-Workspace-Pakete mit). **Ein Prozess, ein Port** (Standard 8787): liefert den Controller-Build statisch und bekommt in CHAOS-9 den WebSocket-Endpunkt (Annahme B9). |
| Tests | Vitest 5 mit `test.projects` über `packages/*` und `apps/*`, Tests liegen neben dem Code (`*.test.ts`). |
| Lint | ESLint 10 (Flat Config) + typescript-eslint `strictTypeChecked`/`stylisticTypeChecked`, react-hooks, react-refresh; `--max-warnings 0`. |
| Format | Prettier 3 für Code und Konfiguration. Markdown ist ausgenommen: Prosa-Dokumente werden von Hand gepflegt, damit Tabellen nicht bei jeder Änderung umgebrochen werden. |
| Lieferkette | `minimumReleaseAge: 10080` (7 Tage) in `pnpm-workspace.yaml`; Install-Skripte nur für Pakete in `onlyBuiltDependencies` (esbuild); `pnpm check:licenses` prüft Laufzeit-Lizenzen gegen eine Positivliste. |
| CI | GitHub Actions: `pnpm install --frozen-lockfile` → typecheck → lint → format:check → test → build → Lizenzen. |

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Interne Pakete mit eigenem `tsc`-Build (`dist/` + Project References) | Zusätzlicher Build-Schritt und Watch-Prozesse ohne Nutzen, solange nur eigene Apps die Pakete konsumieren |
| Biome statt ESLint + Prettier | Schneller und ein Werkzeug, aber keine typbasierten Regeln (z. B. `no-floating-promises`), die für Netzwerk-/Async-Code wertvoll sind |
| Turborepo/Nx | Caching/Orchestrierung lohnt sich bei fünf kleinen Paketen nicht; `pnpm -r` reicht |
| Fastify/Express für den Server | Für statische Auslieferung + ein WebSocket-Endpunkt überdimensioniert; `node:http` + `ws` (CHAOS-9) bleibt transparent |
| Controller-App vom Vite-Dev-Server statt vom Node-Server ausliefern (auch in Produktion) | Zwei Ports für QR-Link und Firewall-Freigabe; widerspricht B9 |

## Konsequenzen

**Positiv**
- Ein Befehl pro Gate (`pnpm typecheck|lint|format:check|test|build|check:licenses`, alles zusammen `pnpm check`), identisch lokal und in CI.
- Änderungen an `protocol`/`game-core` wirken sofort in allen Apps, ohne Rebuild.
- Sicherheits-Grundschutz: Pfad-Traversal-Schutz im statischen Server getestet, verzögerte Übernahme neuer Paketversionen, Lizenz-Positivliste.

**Negativ / Risiken**
- Interne Pakete sind nur mit einem TS-fähigen Werkzeug nutzbar (nicht direkt mit `node`); der Server muss deshalb gebündelt werden.
- Typbasiertes Linting wird mit wachsendem Code langsamer; bei Bedarf Regeln reduzieren.
- `minimumReleaseAge` verzögert auch Sicherheitsupdates um bis zu 7 Tage; bei kritischen Lücken gezielt per `minimumReleaseAgeExclude` ausnehmen.

## Überprüfung

Neu bewerten, wenn ein Paket außerhalb des Workspace genutzt werden soll, Lint-/Testzeiten in CI über ~3 Minuten steigen oder typescript-eslint TypeScript 7 unterstützt.
