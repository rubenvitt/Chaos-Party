/**
 * Erstes Modul des Bündels: installiert die Polyfills auf `globalThis`, bevor Babylon, Session
 * oder Host-Code ausgewertet werden (ESM wertet Importe in Reihenfolge aus).
 */
import { createClock, installPolyfills } from './polyfills.ts';

export const clock = createClock();
installPolyfills(globalThis, clock);
