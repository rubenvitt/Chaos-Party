// Prüft die Lizenzen aller Laufzeit-Abhängigkeiten (ohne devDependencies) gegen eine
// Positivliste und die Lizenzhinweise in vorhandenen Builds. Neue Lizenzen bewusst prüfen
// und hier ergänzen (CLAUDE.md, Quality gates).
import { execFileSync } from 'node:child_process';
import { checkNotices } from './third-party-notices.mjs';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  // SIL Open Font License: freie Schriften (z. B. Nunito), dürfen eingebettet und weitergegeben werden.
  'OFL-1.1',
]);

const output = execFileSync('pnpm', ['-r', 'licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
});
/** @type {Record<string, { name: string; versions: string[] }[]>} */
const byLicense = output.trim() === '' ? {} : JSON.parse(output);

const violations = Object.entries(byLicense).filter(([license]) => !ALLOWED.has(license));
const total = Object.values(byLicense).reduce((sum, pkgs) => sum + pkgs.length, 0);

if (violations.length > 0) {
  console.error('Nicht freigegebene Lizenzen:');
  for (const [license, pkgs] of violations) {
    for (const pkg of pkgs) {
      console.error(`  ${license}: ${pkg.name}@${pkg.versions.join(', ')}`);
    }
  }
  process.exit(1);
}

console.log(`Lizenzen ok: ${String(total)} Laufzeit-Pakete, alle auf der Positivliste.`);

// Lizenzhinweise im Build (CHAOS-69, ADR-017): Jeder vorhandene Build muss die GPL und
// aktuelle Drittlizenz-Hinweise enthalten, damit er weitergegeben werden darf.
const notices = checkNotices();
if (notices.problems.length > 0) {
  console.error('Lizenzhinweise im Build fehlen oder sind veraltet (neu erzeugen: pnpm notices):');
  for (const problem of notices.problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  notices.checked === 0
    ? 'Lizenzhinweise: kein Build vorhanden, nicht geprüft (erst pnpm build).'
    : `Lizenzhinweise ok: ${String(notices.checked)} Builds mit LICENSE.txt und THIRD-PARTY-NOTICES.txt.`,
);
