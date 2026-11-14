import { createRng } from '@chaos-party/game-core';
import { PROTOCOL_VERSION } from '@chaos-party/protocol';

/** Platzhalter, bis CHAOS-8 die Babylon.js-Szene und CHAOS-11 die Lobby bringt. */
export function App() {
  const demoRoll = createRng(2026).int(1, 6);
  return (
    <main className="host">
      <h1>Chaos Party</h1>
      <p>PC-Host · Protokoll v{PROTOCOL_VERSION}</p>
      <p data-testid="demo-roll">Testwurf mit Seed 2026: {demoRoll}</p>
    </main>
  );
}
