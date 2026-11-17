/**
 * Das echte Bündel in einem nackten `node:vm`-Kontext (CHAOS-139): lädt ohne Node-/DOM-APIs,
 * setzt keine DOM-Globals, und eine Bot-Partie läuft bis zum ersten angenommenen Minispiel mit
 * vertragsgemäßem `renderState`. Die ganze Partie läuft in der CI über
 * `pnpm --filter @chaos-party/apple-host bots --full` (Node) und im Swift-Harness (JSC).
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { HAVOK_WASM_SOURCE, bundle } from '../build.mjs';
import { RenderStateSchema } from '../src/contract.ts';
import { loadBundle, runBotMatch, seededBytes, settle } from './botMatch.ts';

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
    });
    expect(logs).toContain('Havok geladen');
    host.hostCommand('gibt-es-nicht');
    expect(logs.some((line) => line.includes('Unbekannter Host-Befehl: gibt-es-nicht'))).toBe(true);
  });

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
});
