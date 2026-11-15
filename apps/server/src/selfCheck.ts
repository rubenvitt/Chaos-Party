/**
 * Selbstprüfung nach dem Start (CHAOS-48): Antwortet unter `localhost:<Port>` wirklich
 * dieser Server?
 *
 * Hintergrund: macOS (und andere Systeme) erlauben, dass ein anderes Programm auf
 * `127.0.0.1:<Port>` lauscht, während Chaos Party auf `0.0.0.0:<Port>` bindet. Der
 * Browser landet bei `http://localhost:<Port>/host/` dann beim fremden Programm.
 * Wir fragen deshalb `/health` über die Loopback-Adressen ab und vergleichen die
 * Instanz-Kennung.
 */

/** Ergebnis je geprüfter Adresse. */
export type LoopbackStatus =
  /** Dieser Server antwortet. */
  | 'own'
  /** Etwas anderes antwortet (anderes Programm oder ein zweiter Chaos-Server). */
  | 'foreign'
  /** Keine Antwort (z. B. IPv6-Loopback nicht gebunden) – unkritisch. */
  | 'unreachable';

export interface LocalhostCheck {
  /** `false`, sobald eine Loopback-Adresse von einem fremden Programm beantwortet wird. */
  readonly ok: boolean;
  readonly results: readonly { readonly url: string; readonly status: LoopbackStatus }[];
}

/** Abfragefunktion (Standard: globales `fetch`), injizierbar für Tests. */
export type HealthFetch = (url: string, signal: AbortSignal) => Promise<Response>;

export interface LocalhostCheckOptions {
  readonly port: number;
  readonly instanceId: string;
  /** Standard: `127.0.0.1` und `[::1]`. */
  readonly hosts?: readonly string[];
  readonly timeoutMs?: number;
  readonly fetch?: HealthFetch;
}

const DEFAULT_HOSTS = ['127.0.0.1', '[::1]'] as const;

async function probe(
  url: string,
  instanceId: string,
  fetchHealth: HealthFetch,
  timeoutMs: number,
): Promise<LoopbackStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchHealth(url, controller.signal);
    if (!res.ok) return 'foreign';
    const body: unknown = await res.json().catch(() => null);
    const instance =
      typeof body === 'object' && body !== null && 'instance' in body ? body.instance : undefined;
    return instance === instanceId ? 'own' : 'foreign';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prüft `/health` auf allen Loopback-Adressen. `ok` ist nur `false`, wenn eine Adresse
 * **fremd** antwortet; nicht erreichbare Adressen (z. B. kein IPv6) sind in Ordnung.
 */
export async function checkLocalhost(options: LocalhostCheckOptions): Promise<LocalhostCheck> {
  const fetchHealth: HealthFetch =
    options.fetch ?? ((url, signal) => fetch(url, { signal, redirect: 'manual' }));
  const timeoutMs = options.timeoutMs ?? 1500;
  const hosts = options.hosts ?? DEFAULT_HOSTS;
  const results = await Promise.all(
    hosts.map(async (host) => {
      const url = `http://${host}:${String(options.port)}/health`;
      return { url, status: await probe(url, options.instanceId, fetchHealth, timeoutMs) };
    }),
  );
  return { ok: results.every((result) => result.status !== 'foreign'), results };
}
