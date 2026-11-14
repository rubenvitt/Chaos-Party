import { describe, expect, it } from 'vitest';
import { formatMs, shortUserAgent } from './format.ts';

describe('formatMs', () => {
  it('zeigt „–“ ohne Messwert', () => {
    expect(formatMs(null)).toBe('–');
    expect(formatMs(Number.NaN)).toBe('–');
  });

  it('zeigt kleine Werte mit einer Nachkommastelle, große ganzzahlig', () => {
    expect(formatMs(0)).toBe('0.0');
    expect(formatMs(4.26)).toBe('4.3');
    expect(formatMs(16.67)).toBe('17');
    expect(formatMs(123.4)).toBe('123');
  });
});

describe('shortUserAgent', () => {
  it('erkennt Safari auf dem iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
    expect(shortUserAgent(ua)).toBe('Safari 18.2 / iOS 18.2');
  });

  it('erkennt Safari auf dem iPad', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(shortUserAgent(ua)).toBe('Safari 17.5 / iPadOS 17.5');
  });

  it('erkennt Chrome unter Windows und Edge vor Chrome', () => {
    expect(
      shortUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 139 / Windows');
    expect(
      shortUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
      ),
    ).toBe('Edge 139 / Windows');
  });

  it('erkennt Firefox unter macOS und Chrome unter Linux', () => {
    expect(
      shortUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
      ),
    ).toBe('Firefox 133 / macOS 10.15');
    expect(
      shortUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 140 / Linux');
  });

  it('fällt bei Unbekanntem nicht um', () => {
    expect(shortUserAgent('')).toBe('Browser ? / unbekannt');
  });
});
