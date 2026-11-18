import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAppcast, escapeXml, verifyEdSignature } from '../scripts/appcast.mjs';

/** Schlüsselpaar im Sparkle-Format: öffentlicher Schlüssel als 32 Byte base64 (SUPublicEDKey). */
function sparkleKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  return { publicKey: Buffer.from(jwk.x ?? '', 'base64url').toString('base64'), privateKey };
}

const item = {
  version: '57',
  shortVersion: '0.1.57',
  url: 'https://github.com/rubenvitt/chaos-party/releases/download/macos-v0.1.57/Chaos-Party-0.1.57-macOS.zip',
  length: 1234,
  signature: 'c2lnbmF0dXI=',
  releaseUrl: 'https://github.com/rubenvitt/chaos-party/releases/tag/macos-v0.1.57',
  pubDate: new Date('2026-11-18T12:00:00Z'),
};

describe('Sparkle-Feed (CHAOS-156)', () => {
  it('prüft eine echte ed25519-Signatur mit dem öffentlichen Schlüssel im Sparkle-Format', () => {
    const { publicKey, privateKey } = sparkleKeys();
    const data = Buffer.from('Chaos-Party-0.1.57-macOS.zip');
    const signature = sign(null, data, privateKey).toString('base64');
    expect(verifyEdSignature({ publicKey, signature, data })).toBe(true);
  });

  it('lehnt einen fremden Schlüssel, veränderte Daten und kaputte Eingaben ab', () => {
    const a = sparkleKeys();
    const b = sparkleKeys();
    const data = Buffer.from('zip');
    const signature = sign(null, data, a.privateKey).toString('base64');
    expect(verifyEdSignature({ publicKey: b.publicKey, signature, data })).toBe(false);
    expect(
      verifyEdSignature({ publicKey: a.publicKey, signature, data: Buffer.from('zip!') }),
    ).toBe(false);
    expect(verifyEdSignature({ publicKey: 'kurz', signature, data })).toBe(false);
    expect(verifyEdSignature({ publicKey: a.publicKey, signature: 'kurz', data })).toBe(false);
  });

  it('schreibt einen Eintrag mit Build-Nummer, Anzeigeversion, Mindest-macOS und Signatur', () => {
    const xml = buildAppcast(item);
    expect(xml).toContain('xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"');
    expect(xml).toContain('<sparkle:version>57</sparkle:version>');
    expect(xml).toContain('<sparkle:shortVersionString>0.1.57</sparkle:shortVersionString>');
    expect(xml).toContain('<sparkle:minimumSystemVersion>26.0</sparkle:minimumSystemVersion>');
    expect(xml).toContain(`url="${item.url}" length="1234"`);
    expect(xml).toContain('sparkle:edSignature="c2lnbmF0dXI="');
    expect(xml).toContain('<pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate>');
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  it('weist ungültige Versionen, Adressen und Längen ab', () => {
    expect(() => buildAppcast({ ...item, version: '0.1.57-beta' })).toThrow(/version/);
    expect(() => buildAppcast({ ...item, shortVersion: '0.1' })).toThrow(/short-version/);
    expect(() => buildAppcast({ ...item, url: 'http://example.com/a.zip' })).toThrow(/https/);
    expect(() => buildAppcast({ ...item, length: 0 })).toThrow(/length/);
  });

  it('maskiert XML-Sonderzeichen', () => {
    expect(escapeXml(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });
});
