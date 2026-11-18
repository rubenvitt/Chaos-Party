// Nächste Version der Mac-App aus den Commits (semantic-release im Probelauf, CHAOS-156).
// Aufruf im Wurzelverzeichnis des Repos (dort liegt release.config.mjs). Legt keinen Tag an und veröffentlicht nichts.
//
//   node apps/apple-host/scripts/next-version.mjs [--notes <Datei>]
//
// Gibt `version=<x.y.z>` aus (leer, wenn seit dem letzten `macos-v…` kein feat/fix/perf/Breaking-Commit kam)
// und schreibt es in $GITHUB_OUTPUT, falls gesetzt. Mit --notes landen die Release-Notizen in der Datei.
// Braucht die volle Git-Historie mit Tags (actions/checkout mit fetch-depth: 0) und in der CI GITHUB_TOKEN.
import { appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import semanticRelease from 'semantic-release';

const { values } = parseArgs({ options: { notes: { type: 'string' } } });

// Logs von semantic-release nach stderr, damit stdout nur das Ergebnis trägt.
const result = await semanticRelease(
  { dryRun: true },
  { cwd: process.cwd(), stdout: process.stderr, stderr: process.stderr },
);
const version = result ? result.nextRelease.version : '';
const notes = result ? result.nextRelease.notes : '';

if (values.notes) writeFileSync(values.notes, notes ?? '');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`version=${version}`);
if (!version)
  console.error('Kein feat/fix/perf/Breaking-Commit seit dem letzten Release: kein neuer Release.');
