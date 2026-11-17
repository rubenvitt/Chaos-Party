// Bot-Partie gegen das gebaute Bündel in einem nackten `node:vm`-Kontext (CHAOS-139).
//   pnpm --filter @chaos-party/apple-host bots          # bis zum ersten angenommenen Minispiel
//   pnpm --filter @chaos-party/apple-host bots --full   # ganze Partie, alle Minispiele der Rotation
// Vorher `pnpm --filter @chaos-party/apple-host build`. Exit 1, wenn die Partie nicht sauber läuft.
import { readFileSync } from 'node:fs';
import { BUNDLE_FILE, WASM_FILE } from '../build.mjs';
import { runBotMatch } from '../test/botMatch.ts';

const full = process.argv.includes('--full');
const verbose = process.argv.includes('--verbose');
const started = performance.now();
const result = await runBotMatch({
  code: readFileSync(BUNDLE_FILE, 'utf8'),
  wasm: readFileSync(WASM_FILE),
  full,
  validateEvery: 30,
  log: verbose ? (line) => console.log(line) : undefined,
});
const { ok, phases, ...rest } = result;
console.log(JSON.stringify({ ...rest, phases: phases.length }, null, 2));
console.log(
  `${ok ? 'OK' : 'NICHT OK'}: ${String(result.roundsPlayed)} Runden, Minispiele ${result.minigamesBuilt.join(', ')}, ` +
    `${String(Math.round(performance.now() - started))} ms Rechenzeit`,
);
process.exit(ok ? 0 : 1);
