import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Adresse des lokalen Session-Servers (apps/server), der `/ws` bedient. */
const SESSION_SERVER = 'ws://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // Im LAN erreichbar, damit echte Geräte den Dev-Server öffnen können.
    host: true,
    // Der Controller verbindet sich immer mit `/ws` auf dem eigenen Ursprung (ADR-006);
    // im Dev-Betrieb leitet Vite das an den Session-Server weiter.
    proxy: {
      '/ws': { target: SESSION_SERVER, ws: true },
    },
  },
  preview: {
    // Fester Port für Playwright (E2E gegen den Production-Build, ADR-006).
    port: 4174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
