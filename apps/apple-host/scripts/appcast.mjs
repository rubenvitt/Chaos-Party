// Sparkle-Feed der Mac-App (CHAOS-156): schreibt eine appcast.xml mit genau dem neuesten Release und prüft
// vorher die EdDSA-Signatur des Zips gegen den öffentlichen Schlüssel, den die App im Info.plist trägt.
// Sparkle braucht nur den neuesten Eintrag; ältere Releases bleiben auf GitHub, aber nicht im Feed.
//
//   node apps/apple-host/scripts/appcast.mjs --zip <Chaos-Party-…-macOS.zip> --version <CFBundleVersion> \
//     --short-version <x.y.z> --url <Download-URL des Zips> --signature <sign_update -p> \
//     --public-key <SUPublicEDKey> --release-url <Release-Seite> --out appcast.xml
//
// Die Signatur kommt von Sparkles `sign_update` (privater Schlüssel nur im Workflow-Secret). Danach signiert
// `sign_update` auch die fertige appcast.xml selbst (SURequireSignedFeed in config/Info-macOS.plist).
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const MINIMUM_SYSTEM_VERSION = '26.0';

/** @param {string} text */
export function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Prüft eine Sparkle-EdDSA-Signatur (ed25519, base64) mit dem öffentlichen Schlüssel aus `SUPublicEDKey`
 * (32 Byte, base64).
 * @param {{ publicKey: string; signature: string; data: Uint8Array }} input
 */
export function verifyEdSignature({ publicKey, signature, data }) {
  const raw = Buffer.from(publicKey, 'base64');
  const sig = Buffer.from(signature, 'base64');
  if (raw.length !== 32 || sig.length !== 64) return false;
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
  return verify(null, data, key, sig);
}

/**
 * @typedef {{
 *   version: string; shortVersion: string; url: string; length: number; signature: string;
 *   releaseUrl: string; pubDate: Date; minimumSystemVersion?: string; prerelease?: boolean;
 * }} AppcastItem
 */

/** @param {AppcastItem} item */
export function buildAppcast(item) {
  if (!/^\d+(\.\d+)*$/.test(item.version))
    throw new Error(`version muss numerisch sein: ${item.version}`);
  if (!/^\d+\.\d+\.\d+$/.test(item.shortVersion))
    throw new Error(`short-version muss x.y.z sein: ${item.shortVersion}`);
  if (!item.url.startsWith('https://')) throw new Error(`url muss https sein: ${item.url}`);
  if (!Number.isInteger(item.length) || item.length <= 0)
    throw new Error(`length ungültig: ${item.length}`);
  const e = escapeXml;
  const note = item.prerelease
    ? 'Vorabversion: Brett und Minispiele sind noch Grundkörper.'
    : 'Neue Version von Chaos Party für macOS.';
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Chaos Party für macOS</title>
    <link>${e(item.releaseUrl)}</link>
    <language>de</language>
    <item>
      <title>Chaos Party ${e(item.shortVersion)}</title>
      <link>${e(item.releaseUrl)}</link>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <sparkle:version>${e(item.version)}</sparkle:version>
      <sparkle:shortVersionString>${e(item.shortVersion)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${e(item.minimumSystemVersion ?? MINIMUM_SYSTEM_VERSION)}</sparkle:minimumSystemVersion>
      <description><![CDATA[<p>${note}</p><p><a href="${e(item.releaseUrl)}">Änderungen und Quelltext auf GitHub</a></p>]]></description>
      <enclosure url="${e(item.url)}" length="${item.length}" type="application/octet-stream" sparkle:edSignature="${e(item.signature)}"/>
    </item>
  </channel>
</rss>
`;
}

function main() {
  const { values } = parseArgs({
    options: {
      zip: { type: 'string' },
      version: { type: 'string' },
      'short-version': { type: 'string' },
      url: { type: 'string' },
      signature: { type: 'string' },
      'public-key': { type: 'string' },
      'release-url': { type: 'string' },
      prerelease: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  const required = [
    'zip',
    'version',
    'short-version',
    'url',
    'signature',
    'public-key',
    'release-url',
    'out',
  ];
  const missing = required.filter((name) => !values[/** @type {keyof typeof values} */ (name)]);
  if (missing.length > 0) {
    console.error(`Fehlt: ${missing.map((m) => `--${m}`).join(', ')}`);
    process.exit(2);
  }
  const zip = /** @type {string} */ (values.zip);
  const signature = /** @type {string} */ (values.signature).trim();
  const publicKey = /** @type {string} */ (values['public-key']).trim();
  if (!verifyEdSignature({ publicKey, signature, data: readFileSync(zip) })) {
    console.error(
      'Signatur des Zips passt nicht zum öffentlichen Schlüssel (SPARKLE_PUBLIC_ED_KEY ≠ privater Schlüssel?)',
    );
    process.exit(1);
  }
  const xml = buildAppcast({
    version: /** @type {string} */ (values.version),
    shortVersion: /** @type {string} */ (values['short-version']),
    url: /** @type {string} */ (values.url),
    length: statSync(zip).size,
    signature,
    releaseUrl: /** @type {string} */ (values['release-url']),
    pubDate: new Date(),
    prerelease: values.prerelease,
  });
  writeFileSync(/** @type {string} */ (values.out), xml);
  console.log(
    `appcast.xml geschrieben: ${values['short-version']} (${values.version}), Signatur geprüft`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
