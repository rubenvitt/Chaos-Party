/**
 * Host-Befehle als Zeichenkette (`ChaosHostInstance.hostCommand`, CHAOS-139/166). Swift kennt
 * nur Text; hier wird daraus ein Befehl der Host-Rolle (`HostCommand` aus `apps/host`).
 *
 * - `start`, `pause`, `resume`, `end-game`, `rematch` (`HOST_COMMANDS`)
 * - `configure:rounds=12`, `configure:moreReactionTime=1` (`0`/`1`/`true`/`false`), beides
 *   mit Komma verbunden: `configure:rounds=12,moreReactionTime=1` (Lobby-Einstellungen, CHAOS-166)
 *
 * Alles andere ist ungültig (`null`): unbekannte oder doppelte Schlüssel, Runden außerhalb
 * 1–`MAX_ROUNDS`, leeres `configure:`.
 */
import { MAX_ROUNDS } from '@chaos-party/protocol';
import type { HostCommand } from '../../host/src/net/hostConnection.ts';
import { CONFIGURE_PREFIX, HOST_COMMANDS, type HostCommandName } from './contract.ts';

export type ParsedHostCommand = { readonly type: 'start' } | HostCommand;

type ConfigureCommand = Extract<HostCommand, { type: 'configure' }>;

const BOOLEANS: Readonly<Record<string, boolean>> = {
  '1': true,
  true: true,
  '0': false,
  false: false,
};

function parseConfigure(spec: string): ConfigureCommand | null {
  let rounds: number | undefined;
  let moreReactionTime: boolean | undefined;
  for (const pair of spec.split(',')) {
    const [key, value, ...rest] = pair.split('=');
    if (value === undefined || rest.length > 0) return null;
    if (key === 'rounds' && rounds === undefined) {
      if (!/^[1-9]\d?$/.test(value)) return null;
      rounds = Number(value);
      if (rounds < 1 || rounds > MAX_ROUNDS) return null;
    } else if (key === 'moreReactionTime' && moreReactionTime === undefined) {
      if (!Object.hasOwn(BOOLEANS, value)) return null;
      moreReactionTime = BOOLEANS[value];
    } else {
      return null;
    }
  }
  return {
    type: 'configure',
    ...(rounds === undefined ? {} : { rounds }),
    ...(moreReactionTime === undefined ? {} : { moreReactionTime }),
  };
}

/** Zeichenkette → Befehl; `null` bei Unbekanntem oder Ungültigem. */
export function parseHostCommand(cmd: string): ParsedHostCommand | null {
  if (cmd.startsWith(CONFIGURE_PREFIX)) return parseConfigure(cmd.slice(CONFIGURE_PREFIX.length));
  return (HOST_COMMANDS as readonly string[]).includes(cmd)
    ? { type: cmd as HostCommandName }
    : null;
}
