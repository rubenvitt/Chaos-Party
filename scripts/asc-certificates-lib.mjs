// Entwicklerzertifikate über die App Store Connect API aufräumen (CI der TestFlight-Workflows).
// Xcode legt beim Archivieren mit `-allowProvisioningUpdates` und API-Key ein neues „Apple Development“-Zertifikat
// an und lässt es liegen; Apple erlaubt nur wenige, danach scheitert jeder Lauf („maximum number of certificates“).
// Reine Hilfsfunktionen ohne Seiteneffekte beim Import (scripts/asc-certificates-lib.test.mjs); die CLI ist
// scripts/asc-certificates.mjs.
import { sign } from 'node:crypto';

/** Zertifikatsarten für Entwicklung. Verteilung und Developer ID bleiben unangetastet. */
export const DEVELOPMENT_TYPES = new Set(['DEVELOPMENT', 'IOS_DEVELOPMENT', 'MAC_APP_DEVELOPMENT']);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {{ id: string, attributes: { certificateType: string, expirationDate?: string, name?: string } }} Certificate
 */

/**
 * Ungefährer Anlegezeitpunkt: Entwicklerzertifikate gelten ein Jahr, die API nennt nur das Ablaufdatum.
 * @param {Certificate} cert
 * @returns {number | null} Millisekunden seit 1970, `null` ohne Ablaufdatum
 */
export function createdAt(cert) {
  const expires = Date.parse(cert.attributes.expirationDate ?? '');
  return Number.isNaN(expires) ? null : expires - 365 * DAY_MS;
}

/**
 * Entwicklerzertifikate, die vor dem Lauf weg können: alle, die älter als `minAgeMs` sind. Jüngere könnten einem
 * gleichzeitig laufenden Workflow gehören und bleiben stehen.
 * @param {readonly Certificate[]} certs
 * @param {number} now
 * @param {number} minAgeMs
 * @returns {{ revoke: Certificate[], keep: Certificate[] }}
 */
export function planCleanup(certs, now, minAgeMs) {
  const revoke = [];
  const keep = [];
  for (const cert of certs) {
    if (!DEVELOPMENT_TYPES.has(cert.attributes.certificateType)) continue;
    const created = createdAt(cert);
    if (created !== null && now - created >= minAgeMs) revoke.push(cert);
    else keep.push(cert);
  }
  return { revoke, keep };
}

/**
 * Entwicklerzertifikate, die während des Laufs entstanden sind: alle, die nicht im Schnappschuss stehen.
 * @param {readonly Certificate[]} certs
 * @param {Iterable<string>} snapshotIds
 * @returns {Certificate[]}
 */
export function newSince(certs, snapshotIds) {
  const known = new Set(snapshotIds);
  return certs.filter(
    (c) => DEVELOPMENT_TYPES.has(c.attributes.certificateType) && !known.has(c.id),
  );
}

/**
 * Kurzbeschreibung fürs Log ohne Namen: Die Logs öffentlicher Repos sind öffentlich.
 * @param {Certificate} cert
 */
export function describe(cert) {
  const via = /created via api/i.test(cert.attributes.name ?? '') ? ', über API angelegt' : '';
  const expires = cert.attributes.expirationDate?.slice(0, 10) ?? '?';
  return `${cert.id} (${cert.attributes.certificateType}, gültig bis ${expires}${via})`;
}

/**
 * JWT (ES256) für die App Store Connect API, 20 Minuten gültig.
 * @param {{ keyId: string, issuerId: string, privateKey: string, now?: number }} options
 */
export function token({ keyId, issuerId, privateKey, now = Date.now() }) {
  const b64 = (/** @type {object} */ value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const head = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: issuerId, iat, exp: iat + 1200, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(head), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${head}.${signature.toString('base64url')}`;
}
