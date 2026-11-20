// Tests für scripts/asc-certificates-lib.mjs (Entwicklerzertifikate der TestFlight-Läufe).
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe as group, expect, it } from 'vitest';
import { createdAt, describe, newSince, planCleanup, token } from './asc-certificates-lib.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-20T08:00:00Z');

/** @param {string} id @param {string} type @param {number} ageMs @param {string} [name] */
function cert(id, type, ageMs, name = 'Apple Development: Created via API') {
  return {
    id,
    attributes: {
      certificateType: type,
      name,
      expirationDate: new Date(NOW - ageMs + 365 * DAY).toISOString(),
    },
  };
}

group('Aufräumen vor dem Lauf', () => {
  it('widerruft alte Entwicklerzertifikate und lässt junge stehen', () => {
    const certs = [
      cert('alt', 'DEVELOPMENT', 3 * DAY),
      cert('jung', 'DEVELOPMENT', 30 * 60 * 1000),
      cert('ios', 'IOS_DEVELOPMENT', 5 * DAY),
    ];
    const { revoke, keep } = planCleanup(certs, NOW, 2 * 60 * 60 * 1000);
    expect(revoke.map((c) => c.id)).toEqual(['alt', 'ios']);
    expect(keep.map((c) => c.id)).toEqual(['jung']);
  });

  it('fasst Verteilung und Developer ID nie an', () => {
    const certs = [
      cert('dist', 'DISTRIBUTION', 90 * DAY),
      cert('devid', 'DEVELOPER_ID_APPLICATION', 90 * DAY),
      cert('mac', 'MAC_APP_DISTRIBUTION', 90 * DAY),
    ];
    expect(planCleanup(certs, NOW, 0)).toEqual({ revoke: [], keep: [] });
  });

  it('behält Zertifikate ohne Ablaufdatum', () => {
    const odd = { id: 'x', attributes: { certificateType: 'DEVELOPMENT' } };
    expect(createdAt(odd)).toBeNull();
    expect(planCleanup([odd], NOW, 0).keep).toEqual([odd]);
  });
});

group('Widerrufen nach dem Lauf', () => {
  it('findet nur Entwicklerzertifikate, die nicht im Schnappschuss stehen', () => {
    const certs = [
      cert('vorher', 'DEVELOPMENT', DAY),
      cert('neu', 'DEVELOPMENT', 0),
      cert('dist', 'DISTRIBUTION', 0),
    ];
    expect(newSince(certs, ['vorher']).map((c) => c.id)).toEqual(['neu']);
  });
});

group('Log und Token', () => {
  it('nennt keine Namen im Log', () => {
    const text = describe(
      cert('abc', 'DEVELOPMENT', DAY, 'Apple Development: Erika Muster (TEAM)'),
    );
    expect(text).toBe('abc (DEVELOPMENT, gültig bis 2027-11-19)');
    expect(describe(cert('def', 'DEVELOPMENT', DAY))).toContain('über API angelegt');
  });

  it('signiert ein ES256-JWT für App Store Connect', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwt = token({
      keyId: 'KEY',
      issuerId: 'ISS',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      now: NOW,
    });
    const [head = '', body = '', sig = ''] = jwt.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'ISS', aud: 'appstoreconnect-v1' });
    expect(claims.exp - claims.iat).toBe(1200);
    const ok = verify(
      'sha256',
      Buffer.from(`${head}.${body}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
  });
});
