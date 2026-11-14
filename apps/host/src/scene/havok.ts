import HavokPhysics from '@babylonjs/havok';
// Vite kopiert die WASM-Datei in Dev und Build an eine feste URL (mit Hash im Build).
// Über `locateFile` bekommt Havok genau diese URL – unabhängig davon, wohin Vite
// das JS-Modul von Havok vorbündelt (ADR-004, Annahme C1).
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

export type HavokInstance = Awaited<ReturnType<typeof HavokPhysics>>;

let havokPromise: Promise<HavokInstance> | undefined;

/** Lädt und instanziiert Havok genau einmal pro Seite; weitere Aufrufe teilen das Ergebnis. */
export function loadHavok(): Promise<HavokInstance> {
  havokPromise ??= HavokPhysics({
    locateFile: (file: string) => (file.endsWith('.wasm') ? havokWasmUrl : file),
  }).catch((error: unknown) => {
    // Beim nächsten Versuch neu laden statt den Fehler für immer zu cachen.
    havokPromise = undefined;
    throw error;
  });
  return havokPromise;
}
