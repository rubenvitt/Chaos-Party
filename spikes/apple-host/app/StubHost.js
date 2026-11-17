// Platzhalter mit der API aus CONTRACT.md, solange jscore/dist/chaos-host.js fehlt (prepare.sh kopiert ihn dann
// als chaos-host.js). Spricht kein Controller-Protokoll: Jede Verbindung wird ein Spieler, Nachrichten kommen als Echo zurück.
globalThis.ChaosHost = {
  create(env) {
    const conns = [];
    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#eab308'];
    const spaces = Array.from({ length: 16 }, (_, i) => ({
      id: 's' + i,
      x: Math.cos((i / 16) * 2 * Math.PI) * 8,
      z: Math.sin((i / 16) * 2 * Math.PI) * 5,
      kind: ['plus', 'minus', 'event', 'plus'][i % 4],
    }));
    let phase = 'lobby';
    let started = 0;
    let now = 0;
    env.log(
      'StubHost aktiv, ' +
        env.havokWasm.length +
        ' Byte Havok, Zufall ' +
        env.randomBytes(4).join(','),
    );
    const seconds = () => (now - started) / 1000;
    return {
      open(id) {
        conns.push(id);
        env.send(id, JSON.stringify({ type: 'stub', connId: id }));
      },
      message(id, text) {
        if (text === 'close') env.close(id, 4000, 'stub');
        else env.send(id, text);
      },
      closed(id) {
        conns.splice(conns.indexOf(id), 1);
        env.log('closed ' + id);
      },
      tick(ms) {
        now = ms;
        if (phase !== 'lobby') phase = seconds() % 20 < 10 ? 'board' : 'minigame';
      },
      hostCommand(cmd) {
        if (cmd === 'start' && phase === 'lobby') {
          phase = 'board';
          started = now;
        }
      },
      renderState() {
        const s = seconds();
        const players = conns.map((id, i) => ({
          slot: i + 1,
          name: 'Verbindung ' + id,
          color: colors[i % 4],
          connected: true,
          ready: false,
          character: 'robot',
        }));
        const pawns = [1, 2].map((slot) => {
          const space = spaces[(Math.floor(s) + slot * 3) % 16];
          return { slot, spaceId: space.id, x: space.x, z: space.z, character: 'robot' };
        });
        const bodies = [
          {
            id: 'floor',
            shape: 'box',
            pos: [0, -0.5, 0],
            rot: [0, 0, 0, 1],
            size: [16, 1, 10],
            color: '#475569',
          },
        ];
        for (let i = 0; i < 12; i++) {
          bodies.push({
            id: 'b' + i,
            shape: i % 3 === 0 ? 'box' : 'sphere',
            pos: [
              (i % 6) * 2 - 5,
              Math.abs(Math.sin(s * 3 + i)) * 3 + 0.5,
              Math.floor(i / 6) * 3 - 1.5,
            ],
            rot: [0, Math.sin(s + i), 0, Math.cos(s + i)],
            size: [1, 1, 1],
            color: colors[i % 4],
          });
        }
        bodies.push({
          id: 'spinner',
          shape: 'cylinder',
          pos: [0, 0.25, 0],
          rot: [0, Math.sin(s), 0, Math.cos(s)],
          size: [8, 0.5, 0.4],
          color: '#f97316',
        });
        return JSON.stringify({
          phase,
          lobby: { joinUrl: env.joinUrl, joinCode: env.joinCode, players },
          board:
            phase === 'lobby'
              ? null
              : {
                  round: 1 + Math.floor(s / 20),
                  rounds: 5,
                  activeSlot: 1 + (Math.floor(s) % 2),
                  spaces,
                  pawns,
                  messages: ['Stub: Brett ' + s.toFixed(0) + ' s'],
                },
          minigame:
            phase === 'minigame'
              ? {
                  id: 'stub-gerangel',
                  stage: 'play',
                  elapsedMs: (s % 10) * 1000,
                  bodies,
                  hud: 'Stub-Minispiel',
                }
              : null,
        });
      },
    };
  },
};
