import { PROTOCOL_VERSION } from '@chaos-party/protocol';

/** Platzhalter, bis CHAOS-10 (iPhone) und CHAOS-13 (iPad-Zonen) die echten Layouts bringen. */
export function App() {
  return (
    <main className="controller">
      <h1>Chaos Party</h1>
      <p>Controller · Protokoll v{PROTOCOL_VERSION}</p>
    </main>
  );
}
