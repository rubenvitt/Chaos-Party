/**
 * Gemeinsame Helfer für E2E-Specs mit echten Seiten (CHAOS-14): Fehler sammeln,
 * Host öffnen und per Testhaken (`window.__chaos`, ADR-004) steuern. Weitere Geräte
 * öffnet die Fixture `openDevice` (`test.ts`).
 */
import { expect, type Page } from '@playwright/test';
import type {} from '../../../apps/host/src/testHook.ts';

export interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
}

/** Sammelt Konsolenfehler und unbehandelte Ausnahmen einer Seite. */
export function collectProblems(page: Page): Problems {
  const problems: Problems = { consoleErrors: [], pageErrors: [] };
  page.on('console', (msg) => {
    // Mit Adresse: „Failed to load resource: 404“ allein sagt nicht, welche Datei fehlt.
    if (msg.type() === 'error') problems.consoleErrors.push(`${msg.text()} ${msg.location().url}`);
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  return problems;
}

export function expectNoProblems(problems: Problems, label: string) {
  expect(problems.pageErrors, `${label}: Ausnahmen`).toEqual([]);
  expect(problems.consoleErrors, `${label}: Konsolenfehler`).toEqual([]);
}

/** Host im Server-Modus öffnen und warten, bis Szene, Physik und Verbindung stehen. */
export async function openHost(page: Page, url: string) {
  await page.goto(url);
  const main = page.locator('main.host');
  await expect(main).toHaveAttribute('data-mode', 'server');
  await expect(main).toHaveAttribute('data-physics', 'ready');
  await expect(main).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
  await page.waitForFunction(() => window.__chaos?.ready === true);
}

/** Simuliert `n` Physik-Frames à 1/60 s (Testmodus: sonst steht die Welt still). */
export async function stepFrames(page: Page, n: number) {
  await page.evaluate((frames) => {
    window.__chaos?.stepFrames(frames);
  }, n);
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export async function positions(page: Page): Promise<Map<number, Position>> {
  const all = await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? []);
  return new Map(all.map((p) => [p.slot, { x: p.x, y: p.y, z: p.z }]));
}

/** Position von `slot` aus einem Schnappschuss von {@link positions}. */
export function pick(all: ReadonlyMap<number, Position>, slot: number): Position {
  const found = all.get(slot);
  if (!found) throw new Error(`Spieler ${String(slot)} fehlt in der Szene`);
  return found;
}

export async function position(page: Page, slot: number): Promise<Position> {
  return pick(await positions(page), slot);
}

/** Waagerechte Verschiebung (x/z) zwischen zwei Positionen. */
export function horizontalDistance(a: Position, b: Position): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Wartet, bis am Host für `slot` ein Stick angekommen ist, der `match` erfüllt
 * (Testhaken `lastMoves`). Ereignisgesteuert statt fester Wartezeit.
 */
export async function waitForHostStick(
  host: Page,
  slot: number,
  match: 'right' | 'left' | 'up' | 'down' | 'zero',
) {
  await host.waitForFunction(
    ({ slot: s, match: m }) => {
      const stick = window.__chaos?.lastMoves[s as 1 | 2 | 3 | 4];
      if (!stick) return false;
      switch (m) {
        case 'right':
          return stick.x > 0.8 && Math.abs(stick.y) < 0.3;
        case 'left':
          return stick.x < -0.8 && Math.abs(stick.y) < 0.3;
        case 'up':
          return stick.y > 0.8 && Math.abs(stick.x) < 0.3;
        case 'down':
          return stick.y < -0.8 && Math.abs(stick.x) < 0.3;
        case 'zero':
          return stick.x === 0 && stick.y === 0;
      }
    },
    { slot, match },
  );
}

/** Zahl der Eingaben, die der Host bisher vom Server angewandt hat. */
export async function networkInputs(host: Page): Promise<number> {
  return host.evaluate(() => window.__chaos?.networkInputs ?? 0);
}

declare global {
  interface Window {
    /** Vom Test mitgeschriebene WebSockets der Seite (nur in E2E, {@link trackWebSockets}). */
    __e2eSockets?: WebSocket[];
  }
}

/**
 * Schreibt alle WebSockets der Seite mit (Init-Skript, vor dem App-Code), damit
 * {@link cutNetwork} die laufende Verbindung abreißen kann. Die App merkt davon nichts.
 */
export async function trackWebSockets(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    window.__e2eSockets = sockets;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    };
  });
}

/**
 * Netz des Geräts weg: Der Browser-Kontext geht offline (neue Verbindungen scheitern),
 * und die bestehende WebSocket-Verbindung bricht ab. Chromium lässt bestehende
 * WebSockets beim Offline-Schalten sonst einfach weiterlaufen; der Abbruch kommt beim
 * echten Gerät durch WLAN-Verlust bzw. iOS. Voraussetzung: {@link trackWebSockets}.
 */
export async function cutNetwork(page: Page) {
  await page.context().setOffline(true);
  const closed = await page.evaluate(() => {
    const open = (window.__e2eSockets ?? []).filter(
      (socket) => socket.readyState === WebSocket.OPEN,
    );
    for (const socket of open) socket.close();
    return open.length;
  });
  expect(closed, 'offene WebSocket-Verbindungen beim Netzabbruch').toBe(1);
}

/** Netz wieder da: Der Controller verbindet sich selbst neu (Backoff, ADR-009). */
export async function restoreNetwork(page: Page) {
  await page.context().setOffline(false);
}
