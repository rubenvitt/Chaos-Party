/**
 * Gemeinsame Werte für `playwright.config.ts` und die Host-/Lobby-Specs (CHAOS-11).
 * Keine Testdatei (kein `.spec.ts`), damit Playwright sie nicht als Test sammelt.
 */

/** Port des Node-Servers für E2E (nicht 8787, damit ein laufender Spiel-Server nicht stört). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4180);

/** Fester Join-Code der E2E-Session (`JOIN_CODE`). */
export const E2E_JOIN_CODE = 'E2ETEST';

/** Erwarteter Join-Link: `PUBLIC_HOST=127.0.0.1`, Port wie der Server. */
export const E2E_JOIN_URL = `http://127.0.0.1:${String(E2E_PORT)}/?code=${E2E_JOIN_CODE}`;

/** WebSocket-Endpunkt für synthetische Controller aus dem Testprozess. */
export const E2E_WS_URL = `ws://127.0.0.1:${String(E2E_PORT)}/ws`;
