// Bot-Controller gegen die laufende App (Sichtprüfung am Mac, CHAOS-166): zwei Spieler über echtes
// WebSocket – join → pick-character → ready, dann erste Option jeder Frage, im Minispiel Stick im
// Kreis und A im Wechsel (wie `test/botMatch.ts`). Mit `--autostart` startet die App von selbst.
// `--spieler <1–4>` (Standard 2); `--bunt` (CHAOS-143) entscheidet abwechslungsreich statt immer die erste
// Option: Items, Trophäe kaufen, Schild, mal zu spät reagieren, damit eine Partie alle Brett-Ereignisse zeigt.
//   node apps/apple-host/scripts/live-bots.mjs 'http://<ip>:<port>/?code=ABCD' [--sekunden 600] [--spieler 4] [--bunt]
// Join-Link aus dem Log der App (`JOIN-URL …`). Node ≥ 22 (globales WebSocket).
const PROTOCOL_VERSION = 4; // packages/protocol/src/version.ts
const BOTS = [
  { name: 'Anna', character: 'raccoon' },
  { name: 'Ben', character: 'sock' },
  { name: 'Cleo', character: 'robot' },
  { name: 'Dana', character: 'cactus' },
];

const args = process.argv.slice(2);
const joinUrl = new URL(args[0] ?? '');
const secondsArg = args.indexOf('--sekunden');
const seconds = secondsArg >= 0 ? Number(args[secondsArg + 1]) : 600;
const playersArg = args.indexOf('--spieler');
const players = Math.min(4, Math.max(1, playersArg >= 0 ? Number(args[playersArg + 1]) : 2));
const colorful = args.includes('--bunt');
const joinCode = joinUrl.searchParams.get('code') ?? '';

/**
 * `--bunt`: Antwort auf eine Frage, `null` = nicht antworten (die Zeit läuft ab).
 * @param {{ options: { id: string }[] }} prompt
 * @returns {string | null}
 */
function decide(prompt) {
  const ids = prompt.options.map((o) => o.id);
  const pick = (/** @type {string[]} */ list) =>
    list[Math.floor(Math.random() * list.length)] ?? null;
  const items = ids.filter((id) => id.startsWith('item:'));
  if (ids.includes('roll')) return items.length > 0 && Math.random() < 0.6 ? pick(items) : 'roll';
  if (ids.includes('buy')) return 'buy';
  if (ids.includes('shield')) return 'shield';
  if (ids.includes('brace')) return Math.random() < 0.5 ? 'brace' : null;
  const targets = ids.filter((id) => id !== 'cancel');
  return pick(targets.length > 0 ? targets : ids);
}
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
      const prompt = m.prompt;
      if (actions.includes('choose') && prompt?.options?.length && !answered.has(prompt.id)) {
        answered.add(prompt.id);
        const option = colorful ? decide(prompt) : prompt.options[0].id;
        // Bunt: kurz „überlegen“, damit Status und Countdown im Bild stehen.
        if (option !== null) {
          const answer = () => send('choose', { slot, seq: ++seq, promptId: prompt.id, option });
          if (colorful) setTimeout(answer, 700);
          else answer();
        }
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

const stops = BOTS.slice(0, players).map(bot);
setTimeout(() => {
  for (const stop of stops) stop();
}, seconds * 1000);
