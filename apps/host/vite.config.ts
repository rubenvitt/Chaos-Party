import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Im LAN erreichbar, damit echte Geräte den Dev-Server öffnen können.
    host: true,
  },
  preview: {
    // Fester Port für Playwright (E2E gegen den Production-Build).
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    // Havok nicht vorbündeln: Das Modul sucht seine WASM-Datei relativ zu sich selbst.
    // Wir übergeben die URL zwar per `locateFile` (src/scene/havok.ts), halten das
    // Modul aber trotzdem unverändert, damit Dev und Build gleich laden (ADR-004).
    exclude: ['@babylonjs/havok'],
  },
  build: {
    target: 'es2022',
    // Babylon.js ist auch tree-geshakt groß; für den PC-Host unkritisch (ADR-001).
    chunkSizeWarningLimit: 2500,
  },
});
