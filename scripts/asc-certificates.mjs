#!/usr/bin/env node
// Entwicklerzertifikate der TestFlight-Läufe aufräumen (App Store Connect API, Rolle Admin).
//
//   node scripts/asc-certificates.mjs cleanup --snapshot <datei> [--dry-run]
//     vor dem Archivieren: widerruft alle Entwicklerzertifikate, die älter als MIN_AGE_HOURS (Standard 2) sind,
//     und merkt sich die übrigen in <datei>.
//   node scripts/asc-certificates.mjs revoke-new --snapshot <datei> [--dry-run]
//     nach dem Lauf (auch bei Fehlern): widerruft die Entwicklerzertifikate, die seit `cleanup` dazugekommen sind,
//     also das, das Xcode für diesen Lauf angelegt hat. Andere neue Zertifikate meldet es nur als Warnung.
//   node scripts/asc-certificates.mjs list
//
// Umgebung: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (.p8). Verteilungs- und Developer-ID-Zertifikate bleiben stehen.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  describe,
  DEVELOPMENT_TYPES,
  newSince,
  planCleanup,
  token,
} from './asc-certificates-lib.mjs';

const API = 'https://api.appstoreconnect.apple.com/v1';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { snapshot: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
});
const [command] = positionals;
const dryRun = values['dry-run'];

for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_PATH']) {
  if (!process.env[name]) fail(`${name} fehlt`);
}
const auth = `Bearer ${token({
  keyId: String(process.env.ASC_KEY_ID),
  issuerId: String(process.env.ASC_ISSUER_ID),
  privateKey: readFileSync(String(process.env.ASC_KEY_PATH), 'utf8'),
})}`;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`asc-certificates: ${message}`);
  process.exit(1);
}

/** @returns {Promise<import('./asc-certificates-lib.mjs').Certificate[]>} */
async function allCertificates() {
  const certs = [];
  /** @type {string | undefined} */
  let url = `${API}/certificates?limit=200&fields[certificates]=name,certificateType,expirationDate`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) fail(`Zertifikate lesen: HTTP ${res.status} ${await res.text()}`);
    const body = /** @type {{ data: any[], links?: { next?: string } }} */ (await res.json());
    certs.push(...body.data);
    url = body.links?.next;
  }
  return certs;
}

/** @param {import('./asc-certificates-lib.mjs').Certificate[]} certs */
async function revoke(certs) {
  for (const cert of certs) {
    if (dryRun) {
      console.log(`würde widerrufen: ${describe(cert)}`);
      continue;
    }
    const res = await fetch(`${API}/certificates/${cert.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    // 404: schon weg, etwa durch einen parallelen Lauf.
    if (res.status === 204 || res.status === 404) console.log(`widerrufen: ${describe(cert)}`);
    else fail(`Widerrufen ${cert.id}: HTTP ${res.status} ${await res.text()}`);
  }
}

const all = await allCertificates();
const certs = all.filter((c) => DEVELOPMENT_TYPES.has(c.attributes.certificateType));
if (command === 'list') {
  for (const cert of certs) console.log(describe(cert));
} else if (command === 'cleanup') {
  if (!values.snapshot) fail('--snapshot fehlt');
  const minAgeMs = Number(process.env.MIN_AGE_HOURS ?? 2) * 60 * 60 * 1000;
  const { revoke: old, keep } = planCleanup(certs, Date.now(), minAgeMs);
  console.log(`${certs.length} Entwicklerzertifikate, ${old.length} alt, ${keep.length} bleiben`);
  await revoke(old);
  // Alle Zertifikate merken, nicht nur die Entwicklerzertifikate: So fallen nach dem Lauf auch neue
  // Verteilungszertifikate auf, und ein Probelauf meldet die alten nicht noch einmal als neu.
  writeFileSync(values.snapshot, JSON.stringify(all.map((c) => c.id)));
} else if (command === 'revoke-new') {
  if (!values.snapshot) fail('--snapshot fehlt');
  if (!existsSync(values.snapshot)) {
    // Ohne Schnappschuss (cleanup lief nicht) ließe sich nicht sagen, welches Zertifikat neu ist.
    console.log('kein Schnappschuss, nichts zu tun');
  } else {
    const known = new Set(
      /** @type {string[]} */ (JSON.parse(readFileSync(values.snapshot, 'utf8'))),
    );
    const created = newSince(certs, known);
    console.log(`${created.length} neue Entwicklerzertifikate`);
    await revoke(created);
    for (const other of all.filter(
      (c) => !known.has(c.id) && !DEVELOPMENT_TYPES.has(c.attributes.certificateType),
    )) {
      // Verteilungszertifikate bleiben: Ohne sie ließe sich der hochgeladene Build nicht zuordnen. Melden, damit
      // auffällt, wenn jeder Lauf eines anlegt.
      console.log(`::warning::neues Zertifikat bleibt stehen: ${describe(other)}`);
    }
  }
} else {
  fail('Befehl: cleanup | revoke-new | list');
}
