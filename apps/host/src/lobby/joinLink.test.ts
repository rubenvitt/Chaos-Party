import { describe, expect, it } from 'vitest';
import { joinUrlForDevice } from './joinLink.ts';

describe('joinUrlForDevice', () => {
  const base = 'http://192.168.178.20:8787/?code=ABCD';

  it('lässt den iPhone-Link unverändert', () => {
    expect(joinUrlForDevice(base, 'phone')).toBe(base);
  });

  it('hängt für das geteilte iPad seats=2 an und behält den Code', () => {
    const url = new URL(joinUrlForDevice(base, 'ipad'));
    expect(url.searchParams.get('code')).toBe('ABCD');
    expect(url.searchParams.get('seats')).toBe('2');
    expect(url.host).toBe('192.168.178.20:8787');
    expect(joinUrlForDevice(base, 'ipad')).toBe(`${base}&seats=2`);
  });

  it('ersetzt vorhandene seats/mode-Angaben statt sie zu doppeln', () => {
    const odd = 'http://10.0.0.5:8787/?code=ABCD&seats=4&mode=ipad';
    expect(joinUrlForDevice(odd, 'ipad')).toBe('http://10.0.0.5:8787/?code=ABCD&seats=2');
    expect(joinUrlForDevice(odd, 'phone')).toBe('http://10.0.0.5:8787/?code=ABCD');
  });

  it('funktioniert mit IPv6-Adressen', () => {
    expect(joinUrlForDevice('http://[fd00::1]:8787/?code=ABCD', 'ipad')).toBe(
      'http://[fd00::1]:8787/?code=ABCD&seats=2',
    );
  });

  it('gibt ungültige URLs unverändert zurück', () => {
    expect(joinUrlForDevice('kein link', 'ipad')).toBe('kein link');
  });
});
