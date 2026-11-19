// Bot-Controller gegen die laufende App (Sichtprüfung am Mac, CHAOS-166): zwei Spieler über echtes
// WebSocket – join → pick-character → ready, dann erste Option jeder Frage, im Minispiel Stick im
// Kreis und A im Wechsel (wie `test/botMatch.ts`). Mit `--autostart` startet die App von selbst.
//   node apps/apple-host/scripts/live-bots.mjs 'http://<ip>:<port>/?code=ABCD' [--sekunden 600]
// Join-Link aus dem Log der App (`JOIN-URL …`). Node ≥ 22 (globales WebSocket).
const PROTOCOL_VERSION = 4; // packages/protocol/src/version.ts
const BOTS = [
  { name: 'Anna', character: 'raccoon' },
  { name: 'Ben', character: 'sock' },
];

const args = process.argv.slice(2);
const joinUrl = new URL(args[0] ?? '');
const secondsArg = args.indexOf('--sekunden');
const seconds = secondsArg >= 0 ? Number(args[secondsArg + 1]) : 600;
const joinCode = joinUrl.searchParams.get('code') ?? '';
const wsUrl = `ws://${joinUrl.host}/ws`;

/** @param {{ name: string, character: string }} bot */
function bot({ name, character }) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  /** @type {number | null} */
  let slot = null;
  /** @type {string[]} */
  let actions = [];
  let picked = false;
  let pressed = false;
  const answered = new Set();
  /** @type {(type: string, fields?: Record<string, unknown>) => void} */
  const send = (type, fields = {}) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type, ...fields }));
  };
  ws.addEventListener('open', () => {
    send('join', { joinCode, seats: 1, names: [name] });
  });
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data));
    if (m.type === 'welcome') {
      slot = m.players[0]?.slot ?? null;
      console.log(`${name}: Slot ${String(slot)}`);
    } else if (m.type === 'context' && slot !== null) {
      actions = m.actions ?? [];
      if (actions.includes('pick-character') && !picked) {
        picked = true;
        send('pick-character', { slot, seq: ++seq, character });
      } else if (actions.includes('ready') && picked) {
        send('ready', { slot, seq: ++seq });
      }
      const option = m.prompt?.options?.[0]?.id;
      if (actions.includes('choose') && option && !answered.has(m.prompt.id)) {
        answered.add(m.prompt.id);
        send('choose', { slot, seq: ++seq, promptId: m.prompt.id, option });
      }
    } else if (m.type === 'error') {
      console.log(`${name}: error ${String(m.code)} ${String(m.message)}`);
    }
  });
  ws.addEventListener('close', () => {
    console.log(`${name}: Verbindung zu`);
  });
  const timer = setInterval(() => {
    if (slot === null) return;
    const now = Date.now();
    if (actions.includes('move')) {
      const angle = now / 700 + slot;
      send('move', { slot, seq: ++seq, x: Math.cos(angle), y: Math.sin(angle) });
    }
    if (actions.includes('button-a') && Math.floor(now / 100) % 4 === slot) {
      pressed = !pressed;
      send(pressed ? 'press' : 'release', { slot, seq: ++seq, button: 'a' });
    }
  }, 100);
  const heartbeat = setInterval(() => {
    send('heartbeat', { t: Date.now() });
  }, 5000);
  return () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    ws.close();
  };
}

const stops = BOTS.map(bot);
setTimeout(() => {
  for (const stop of stops) stop();
}, seconds * 1000);
