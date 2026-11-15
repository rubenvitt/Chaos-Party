/** Anzeigehilfen für die Debug-Anzeigen (CHAOS-45). Reine Funktionen. */

/**
 * Bytes für die Anzeige (CHAOS-39): ab 1 MiB in MB mit einer Nachkommastelle, darunter in kB;
 * `null` → „–“ (z. B. Safari ohne `performance.memory`).
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '–';
  const mib = 1024 * 1024;
  if (Math.abs(bytes) >= mib) return `${(bytes / mib).toFixed(1)} MB`;
  return `${String(Math.round(bytes / 1024))} kB`;
}

/**
 * Millisekunden für die Anzeige: unter 10 ms mit einer Nachkommastelle, sonst ganzzahlig;
 * `null` → „–“. Punkt als Dezimaltrenner, damit kopierte Werte eindeutig bleiben.
 */
export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–';
  return Math.abs(value) < 10 ? value.toFixed(1) : String(Math.round(value));
}

/**
 * Kurzform eines User-Agents: „Browser Version / System“, z. B. „Safari 18.2 / iOS 18.2“
 * oder „Chrome 139 / Windows“. Nur grobe Erkennung für Gerätetest-Notizen; der volle
 * String steht zusätzlich in der kopierten Zusammenfassung.
 */
export function shortUserAgent(ua: string): string {
  return `${detectBrowser(ua)} / ${detectOs(ua)}`;
}

function detectOs(ua: string): string {
  const ios = /(iPhone|iPad|iPod).*? OS (\d+)_(\d+)/.exec(ua);
  if (ios) return `${ios[1] === 'iPad' ? 'iPadOS' : 'iOS'} ${ios[2] ?? ''}.${ios[3] ?? ''}`;
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1] ?? ''}`;
  if (ua.includes('Windows NT')) return 'Windows';
  if (ua.includes('CrOS')) return 'ChromeOS';
  // iPadOS im Desktop-Modus meldet sich als Mac; unterscheiden lässt sich das hier nicht.
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua);
  if (mac) return `macOS ${mac[1] ?? ''}.${mac[2] ?? ''}`;
  if (ua.includes('Linux')) return 'Linux';
  return 'unbekannt';
}

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
];

function detectBrowser(ua: string): string {
  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(ua);
    if (match) return `${name} ${match[1] ?? ''}`;
  }
  const safari = /Version\/(\d+(?:\.\d+)?).*Safari\//.exec(ua);
  if (safari) return `Safari ${safari[1] ?? ''}`;
  if (ua.includes('AppleWebKit')) return 'WebKit';
  return 'Browser ?';
}
