/**
 * Das echte Bündel in einem nackten `node:vm`-Kontext (CHAOS-139): lädt ohne Node-/DOM-APIs,
 * setzt keine DOM-Globals, und eine Bot-Partie läuft bis zum ersten angenommenen Minispiel mit
 * vertragsgemäßem `renderState`. Die ganze Partie läuft in der CI über
 * `pnpm --filter @chaos-party/apple-host bots --full` (Node) und im Swift-Harness (JSC).
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { getMinigameInfo } from '@chaos-party/minigames/catalog';
import { HAVOK_WASM_SOURCE, bundle } from '../build.mjs';
import { PLAY_OVERRUN_MS } from '../../host/src/minigame/plan.ts';
import { RenderStateSchema, type RenderState } from '../src/contract.ts';
import { PROBLEM_MARKERS, loadBundle, runBotMatch, seededBytes, settle } from './botMatch.ts';

let code = '';
let wasm: Uint8Array = new Uint8Array();

beforeAll(async () => {
  code = await bundle({ write: false });
  wasm = readFileSync(HAVOK_WASM_SOURCE);
}, 60_000);

describe('Bündel', () => {
  it('lädt im nackten Kontext und setzt nur ChaosHost, ChaosHostInternals und Polyfills', () => {
    const { api, internals } = loadBundle(code);
    expect(typeof api.create).toBe('function');
    expect(internals.rotation.length).toBeGreaterThan(0);
    expect(code).not.toMatch(/require\(["']node:/);
  });

  it('enthält kein `ws` und keinen Node-Import', () => {
    expect(code).not.toContain('WebSocketServer');
    expect(code).not.toContain('node:crypto');
  });

  it('liefert schon vor dem ersten tick einen gültigen Lobby-Zustand', async () => {
    const { api } = loadBundle(code);
    const logs: string[] = [];
    const host = api.create({
      send: () => undefined,
      close: () => undefined,
      log: (line) => logs.push(line),
      randomBytes: seededBytes(7),
      havokWasm: wasm,
      joinUrl: 'http://10.0.0.5:8787/?code=WXYZ',
      joinCode: 'WXYZ',
    });
    await settle();
    const state = RenderStateSchema.parse(JSON.parse(host.renderState()));
    expect(state.phase).toBe('lobby');
    expect(state.lobby).toEqual({
      joinUrl: 'http://10.0.0.5:8787/?code=WXYZ',
      joinCode: 'WXYZ',
      players: [],
      // Die Host-Rolle hat die erste `lobby` schon in `create` (Verbindung im Prozess).
      settings: { rounds: 10, roundPresets: [10, 16, 20], moreReactionTime: false },
    });
    expect(logs).toContain('Havok geladen');
    host.hostCommand('gibt-es-nicht');
    expect(logs.some((line) => line.includes('Unbekannter Host-Befehl: gibt-es-nicht'))).toBe(true);
  });

  it('schaltet die Regel Rückenwind nur mit HostEnv.tailwind ein (CHAOS-188)', async () => {
    const { api } = loadBundle(code);
    const logsOf = (tailwind: boolean | undefined) => {
      const logs: string[] = [];
      api.create({
        send: () => undefined,
        close: () => undefined,
        log: (line) => logs.push(line),
        randomBytes: seededBytes(4),
        havokWasm: wasm,
        joinUrl: 'http://10.0.0.5:8787/?code=WXYZ',
        joinCode: 'WXYZ',
        ...(tailwind === undefined ? {} : { tailwind }),
      });
      return logs;
    };
    const on = logsOf(true);
    const off = logsOf(false);
    const missing = logsOf(undefined);
    await settle();
    expect(on).toContain('Regel Rückenwind an');
    expect(off).not.toContain('Regel Rückenwind an');
    expect(missing).not.toContain('Regel Rückenwind an');
  });

  it('übernimmt configure in der Lobby und meldet Ungültiges (CHAOS-166)', async () => {
    const { api } = loadBundle(code);
    const logs: string[] = [];
    const host = api.create({
      send: () => undefined,
      close: () => undefined,
      log: (line) => logs.push(line),
      randomBytes: seededBytes(9),
      havokWasm: wasm,
      joinUrl: 'http://10.0.0.5:8787/?code=WXYZ',
      joinCode: 'WXYZ',
    });
    await settle();
    const settings = () => RenderStateSchema.parse(JSON.parse(host.renderState())).lobby.settings;

    host.hostCommand('configure:rounds=12');
    await settle();
    expect(settings()).toEqual({ rounds: 12, roundPresets: [10, 16, 20], moreReactionTime: false });

    host.hostCommand('configure:moreReactionTime=1');
    await settle();
    expect(settings()).toEqual({ rounds: 12, roundPresets: [10, 16, 20], moreReactionTime: true });

    host.hostCommand('configure:rounds=3,moreReactionTime=0');
    await settle();
    expect(settings()).toEqual({ rounds: 3, roundPresets: [10, 16, 20], moreReactionTime: false });

    host.hostCommand('configure:rounds=21');
    host.hostCommand('configure:moreReactionTime=ja');
    await settle();
    expect(settings()?.rounds).toBe(3);
    expect(logs).toContain('Ungültiger Host-Befehl: configure:rounds=21');
    expect(logs).toContain('Ungültiger Host-Befehl: configure:moreReactionTime=ja');
    expect(logs.filter((line) => PROBLEM_MARKERS.some((m) => line.includes(m)))).toEqual([]);
  });

  it('spielt mit den Lobby-Einstellungen aus configure; danach geht configure ins Leere', async () => {
    const lines: string[] = [];
    let boardState: RenderState | undefined;
    const result = await runBotMatch({
      code,
      wasm,
      full: false,
      seed: 11,
      beforeStart: ['configure:rounds=12', 'configure:moreReactionTime=1'],
      afterStart: ['configure:rounds=4'],
      log: (line) => lines.push(line),
      onPhase: (key, state) => {
        if (key === 'board') boardState ??= state;
      },
    });
    expect(result.exceptions).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.serverErrors).toEqual([]);
    expect(result.contractErrors).toEqual([]);
    expect(result.ok).toBe(true);
    // Die Partie nutzt die Werte: 12 Runden, Schalter an.
    expect(boardState?.board?.rounds).toBe(12);
    expect(boardState?.lobby.settings).toEqual({
      rounds: 12,
      roundPresets: [10, 16, 20],
      moreReactionTime: true,
    });
    expect(lines).toContain('  js: Host-Befehl configure:rounds=4 ignoriert: nur in der Lobby');
  }, 60_000);

  it('spielt mit zwei Bot-Controllern bis zum ersten angenommenen Minispiel', async () => {
    const phases: string[] = [];
    const result = await runBotMatch({
      code,
      wasm,
      full: false,
      seed: 3,
      onPhase: (key) => phases.push(key),
    });
    expect(result.exceptions).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.serverErrors).toEqual([]);
    expect(result.contractErrors).toEqual([]);
    expect(result.resultsAccepted).toBe(1);
    expect(phases.slice(0, 2)).toEqual(['lobby', 'board']);
    expect(phases).toContain('minigame-play');
    expect(result.ok).toBe(true);
  }, 60_000);

  it('richtet ein spät aufgebautes Minispiel am Spielstart des Servers aus (CHAOS-206)', async () => {
    // Anleitung 7 s, die Bühne ist erst 5 s nach dem Spielstart beim Server fertig.
    const lines: string[] = [];
    const result = await runBotMatch({
      code,
      wasm,
      full: false,
      seed: 3,
      stageDelayMs: 7_000 + 5_000,
      log: (line) => lines.push(line),
    });
    expect(result.exceptions).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.serverErrors).toEqual([]);
    expect(result.resultsAccepted).toBe(1);
    expect(result.ok).toBe(true);
    const id = result.minigamesBuilt[0] ?? '';
    const playMs = getMinigameInfo(id)?.durationMs ?? 0;
    expect(playMs).toBeGreaterThan(5_000);
    // Ohne Ausrichtung käme das Ergebnis erst 5 s nach dem Ende beim Server (CHAOS-206).
    expect(result.resultAfterPlayMs[0]).toBeLessThanOrEqual(playMs + PLAY_OVERRUN_MS + 200);
    expect(lines.some((line) => line.includes('Spielzeit des Servers vorbei'))).toBe(true);
  }, 60_000);

  it('schickt host-ready mit deferSceneReady erst nach sceneReady() und spielt dann normal', async () => {
    const phases: string[] = [];
    const result = await runBotMatch({
      code,
      wasm,
      full: false,
      seed: 5,
      deferSceneReady: true,
      onPhase: (key) => phases.push(key),
    });
    expect(result.exceptions).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.serverErrors).toEqual([]);
    expect(phases.slice(0, 2)).toEqual(['lobby', 'board']);
    expect(result.ok).toBe(true);
  }, 60_000);
});
