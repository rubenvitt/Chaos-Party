import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Port des Session-Servers (`pnpm --filter @chaos-party/server dev`). */
const SERVER_PORT = Number(process.env.CHAOS_SERVER_PORT ?? 8787);

export default defineConfig({
  // Der Node-Server liefert den Host-Build unter /host/ aus (ADR-007); Dev und Preview
  // laufen unter demselben Pfad, damit Asset-URLs (auch Havok-WASM, C1) überall gleich sind.
  base: '/host/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Im LAN erreichbar, damit echte Geräte den Dev-Server öffnen können.
    host: true,
    // Der Host verbindet sich immer mit `/ws` am eigenen Ursprung; im Dev-Server
    // leitet Vite das an den Session-Server weiter (ADR-007, Dev-Topologie).
    proxy: {
      '/ws': { target: `ws://localhost:${String(SERVER_PORT)}`, ws: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/ws': { target: `ws://localhost:${String(SERVER_PORT)}`, ws: true },
    },
  },
  optimizeDeps: {
    // Havok nicht vorbündeln: Das Modul sucht seine WASM-Datei relativ zu sich selbst.
    // Wir übergeben die URL zwar per `locateFile` (src/scene/havok.ts), halten das
    // Modul aber trotzdem unverändert, damit Dev und Build gleich laden (ADR-004).
    exclude: ['@babylonjs/havok'],
  },
  build: {
    target: 'es2022',
    // Szenen sind eigene Chunks (CHAOS-53, ADR-004 Nachtrag 1); der größte geteilte Babylon-Chunk
    // liegt bei ≈ 950 kB. Das Start-Bundle prüft `pnpm check:bundle` gesondert.
    chunkSizeWarningLimit: 1200,
  },
});
