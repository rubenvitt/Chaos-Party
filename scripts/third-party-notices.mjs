// Lizenzhinweise für einen weitergegebenen Build (CHAOS-69, ADR-018).
//
// Chaos Party steht unter GPL-3.0-only. Wer einen fertigen Build (`apps/*/dist`) weitergibt,
// muss den GPL-Text beilegen und die Lizenzen der gebündelten Pakete nennen (Apache-2.0 für
// Babylon.js samt NOTICE, MIT, OFL-1.1 für die Schriften). Dieses Skript schreibt beides in
// jedes `dist/`:
//
//   LICENSE.txt               GPL-3.0 (Kopie von `LICENSE`)
//   THIRD-PARTY-NOTICES.txt   alle Laufzeit-Pakete der App mit Lizenz- und NOTICE-Text
//
// `pnpm build` ruft es am Ende auf; `pnpm check:licenses` prüft, ob vorhandene Builds
// aktuelle Hinweise haben (`checkNotices`).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PROJECT_LICENSE = 'GPL-3.0-only';
export const SOURCE_URL = 'https://github.com/rubenvitt/chaos-party';
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';
export const LICENSE_FILE = 'LICENSE.txt';

/** Die Apps, deren Build weitergegeben werden kann. */
export const APPS = [
  { pkg: '@chaos-party/host', dist: 'apps/host/dist' },
  { pkg: '@chaos-party/controller', dist: 'apps/controller/dist' },
  { pkg: '@chaos-party/server', dist: 'apps/server/dist' },
];

/**
 * @typedef {{ name: string; version: string; license: string; homepage?: string; author?: string; texts: { file: string; text: string }[] }} NoticePackage
 */

const LICENSE_NAME = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NOTICE_NAME = /^notice(\.(md|txt))?$/i;

/**
 * Lizenz- und NOTICE-Dateien eines Paketordners, Lizenz zuerst.
 * @param {string[]} fileNames
 * @returns {string[]}
 */
export function licenseFileNames(fileNames) {
  const licenses = fileNames.filter((f) => LICENSE_NAME.test(f)).sort();
  const notices = fileNames.filter((f) => NOTICE_NAME.test(f)).sort();
  return [...licenses, ...notices];
}

/** Zeilenenden vereinheitlichen und Leerraum am Ende entfernen, damit der Text stabil bleibt. */
function normalize(/** @type {string} */ text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

const RULE = '='.repeat(78);

/**
 * Baut den Text von THIRD-PARTY-NOTICES.txt (rein, ohne Dateizugriff).
 * @param {string} app Paketname der App
 * @param {NoticePackage[]} packages
 * @returns {string}
 */
export function renderNotices(app, packages) {
  const sorted = [...packages].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
  const lines = [
    `Chaos Party – Lizenzhinweise für Drittsoftware (${app})`,
    '',
    `Chaos Party selbst steht unter der GNU General Public License v3.0 (${PROJECT_LICENSE}),`,
    `siehe ${LICENSE_FILE}. Quellcode: ${SOURCE_URL}`,
    '',
    'Dieser Build enthält oder lädt die folgenden Pakete. Die Liste umfasst alle',
    'Laufzeit-Abhängigkeiten der App und ihrer Workspace-Pakete; Teile davon können beim',
    'Bündeln weggefallen sein. Jedes Paket steht unter seiner eigenen Lizenz:',
    '',
    ...sorted.map((p) => `  - ${p.name} ${p.version} (${p.license})`),
  ];
  for (const p of sorted) {
    lines.push('', RULE, `${p.name} ${p.version}`, `Lizenz: ${p.license}`);
    if (p.author) lines.push(`Autor: ${p.author}`);
    if (p.homepage) lines.push(`Homepage: ${p.homepage}`);
    for (const { file, text } of p.texts) {
      lines.push('', `--- ${file} ---`, '', normalize(text));
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Laufzeit-Pakete einer App samt ihrer Workspace-Pakete (`pnpm licenses list --prod`).
 * @param {string} app
 * @returns {NoticePackage[]}
 */
export function collectPackages(app) {
  const output = execFileSync(
    'pnpm',
    ['--filter', `${app}...`, 'licenses', 'list', '--prod', '--json'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  /** @type {Record<string, { name: string; versions: string[]; paths: string[]; license: string; homepage?: string; author?: string }[]>} */
  const byLicense = output.trim() === '' ? {} : JSON.parse(output);
  /** @type {NoticePackage[]} */
  const packages = [];
  for (const entries of Object.values(byLicense)) {
    for (const entry of entries) {
      entry.versions.forEach((version, i) => {
        const dir = entry.paths[i] ?? entry.paths[0];
        if (dir === undefined) throw new Error(`${entry.name}@${version}: kein Pfad`);
        const names = licenseFileNames(readdirSync(dir));
        if (!names.some((n) => LICENSE_NAME.test(n))) {
          throw new Error(`${entry.name}@${version}: keine Lizenzdatei in ${dir}`);
        }
        packages.push({
          name: entry.name,
          version,
          license: entry.license,
          ...(entry.homepage ? { homepage: entry.homepage } : {}),
          ...(entry.author ? { author: entry.author } : {}),
          texts: names.map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') })),
        });
      });
    }
  }
  return packages;
}

/**
 * Soll-Inhalte der Hinweisdateien je App.
 * @returns {{ app: string; dist: string; files: Record<string, string> }[]}
 */
export function expectedNotices() {
  const gpl = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  return APPS.map(({ pkg, dist }) => ({
    app: pkg,
    dist: join(ROOT, dist),
    files: {
      [LICENSE_FILE]: gpl,
      [NOTICES_FILE]: renderNotices(pkg, collectPackages(pkg)),
    },
  }));
}

/** Schreibt die Hinweise in jedes vorhandene `dist/`. */
export function writeNotices() {
  for (const { app, dist, files } of expectedNotices()) {
    if (!existsSync(dist)) {
      console.log(`${app}: kein Build (${dist}), übersprungen.`);
      continue;
    }
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dist, name), text);
    console.log(`${app}: ${Object.keys(files).join(', ')} geschrieben.`);
  }
}

/**
 * Prüft vorhandene Builds auf aktuelle Hinweise.
 * @returns {{ problems: string[]; checked: number }}
 */
export function checkNotices() {
  /** @type {string[]} */
  const problems = [];
  let checked = 0;
  for (const { app, dist, files } of expectedNotices()) {
    if (!existsSync(dist)) continue;
    checked += 1;
    for (const [name, text] of Object.entries(files)) {
      const path = join(dist, name);
      if (!existsSync(path)) problems.push(`${app}: ${name} fehlt im Build`);
      else if (readFileSync(path, 'utf8') !== text) problems.push(`${app}: ${name} ist veraltet`);
    }
  }
  return { problems, checked };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeNotices();
}
