// Reine Hilfsfunktionen für `pnpm play` (scripts/play.mjs, CHAOS-42): Versionsprüfung,
// „Build veraltet?“, Optionen. Ohne Seiteneffekte beim Import, damit sie testbar bleiben
// (scripts/play-lib.test.mjs).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Zerlegt eine Versionsangabe wie `v22.12.0`, `22.12` oder `pnpm/10.28.0 npm/? …`.
 * @param {string} text
 * @returns {[number, number, number] | null}
 */
export function parseVersion(text) {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/**
 * `true`, wenn `actual` mindestens `minimum` ist.
 * @param {readonly number[]} actual
 * @param {readonly number[]} minimum
 */
export function atLeast(actual, minimum) {
  for (let i = 0; i < 3; i++) {
    const a = actual[i] ?? 0;
    const m = minimum[i] ?? 0;
    if (a !== m) return a > m;
  }
  return true;
}

/** Verzeichnisse, die beim Vergleich „Quelle neuer als Build?“ nie mitzählen. */
export const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  'perf-results',
  '__screenshots__',
  '__pycache__',
]);

/** Dateien, die den Build nicht beeinflussen (Tests, Doku-Notizen). */
const IGNORED_FILE = /\.(test|spec)\.(ts|tsx|mjs|js)$|\.tsbuildinfo$|\.log$/;

/**
 * Jüngste Änderungszeit (ms) aller Dateien unter `dir`, ohne Build-Ausgaben, Abhängigkeiten,
 * versteckte Ordner und Tests. Fehlt `dir`, ist das Ergebnis 0.
 * @param {string} dir
 * @returns {number}
 */
export function newestMtime(dir) {
  let newest = 0;
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      newest = Math.max(newest, newestMtime(path));
    } else if (entry.isFile() && !IGNORED_FILE.test(entry.name)) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}

/**
 * Änderungszeit einer Datei in ms oder `null`, wenn sie fehlt.
 * @param {string} path
 * @returns {number | null}
 */
export function mtimeOrNull(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Entscheidet, ob gebaut werden muss: wenn eine Ausgabe fehlt oder irgendeine Quelle jünger
 * ist als die älteste Ausgabe. Bewusst über Änderungszeiten statt Stempel-Datei: Dann zählt
 * auch ein vorheriges `pnpm build` (CI, Entwicklung) als aktueller Stand.
 * @param {{ outputs: readonly (number | null)[]; newestSource: number }} input
 * @returns {{ build: boolean; reason: string }}
 */
export function buildDecision({ outputs, newestSource }) {
  if (outputs.length === 0 || outputs.some((mtime) => mtime === null)) {
    return { build: true, reason: 'noch kein Build vorhanden' };
  }
  const oldestOutput = Math.min(.../** @type {number[]} */ (outputs));
  if (newestSource > oldestOutput) {
    return { build: true, reason: 'Quellen sind neuer als der letzte Build' };
  }
  return { build: false, reason: 'Build ist aktuell' };
}

/**
 * Entscheidet, ob `pnpm install --frozen-lockfile` nötig ist: ohne `node_modules` oder wenn
 * Lockfile/Manifeste jünger sind als die letzte Installation.
 * @param {{ installedAt: number | null; newestManifest: number }} input
 * @returns {{ install: boolean; reason: string }}
 */
export function installDecision({ installedAt, newestManifest }) {
  if (installedAt === null) return { install: true, reason: 'Abhängigkeiten fehlen' };
  if (newestManifest > installedAt) {
    return { install: true, reason: 'pnpm-lock.yaml oder package.json hat sich geändert' };
  }
  return { install: false, reason: 'Abhängigkeiten sind aktuell' };
}

/**
 * Liest Schalter aus Argumenten und Umgebung.
 * - Browser öffnen: Standard ja; aus mit `--no-open`, `OPEN=0` oder in CI (`CI=true`).
 * - `--rebuild` bzw. `REBUILD=1` erzwingt den Build.
 * @param {readonly string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function parseOptions(argv, env) {
  const falsy = (/** @type {string | undefined} */ value) =>
    value !== undefined && ['0', 'false', 'no', 'nein', 'off'].includes(value.toLowerCase());
  const truthy = (/** @type {string | undefined} */ value) =>
    value !== undefined && value !== '' && !falsy(value);

  let open = env.OPEN === undefined ? !truthy(env.CI) : !falsy(env.OPEN);
  if (argv.includes('--no-open')) open = false;
  if (argv.includes('--open')) open = true;
  const rebuild = argv.includes('--rebuild') || truthy(env.REBUILD);
  const help = argv.includes('--help') || argv.includes('-h');
  const unknown = argv.filter(
    (arg) => !['--no-open', '--open', '--rebuild', '--help', '-h'].includes(arg),
  );
  return { open, rebuild, help, unknown };
}

/**
 * Wo ist der Server vom PC aus erreichbar? Bindet er auf alle Adressen (Standard), über
 * `localhost`; bindet `HOST` an eine bestimmte Adresse, über diese.
 * @param {Record<string, string | undefined>} env
 * @returns {{ port: number; probeHost: string; browserHost: string } | null} `null` bei `PORT=0`/ungültig
 */
export function localTarget(env) {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  const bind = env.HOST?.trim() ?? '';
  if (bind === '' || bind === '0.0.0.0' || bind === '::' || bind === '[::]') {
    return { port, probeHost: '127.0.0.1', browserHost: 'localhost' };
  }
  const host = bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind;
  return { port, probeHost: host, browserHost: host };
}
