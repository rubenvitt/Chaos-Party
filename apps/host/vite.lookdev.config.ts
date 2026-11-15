/**
 * Eigenständiger Build der Look-Dev-Vitrine (CHAOS-56/57) für die interaktive 3D-Fassung als
 * Artefakt: relative Pfade (`base: './'`), Eingang `src/lookdev/lookdev.html`, Assets aus
 * `public/lookdev-assets/` (vorher `node scripts/fetch-lookdev-assets.mjs`).
 *
 *   pnpm --filter @chaos-party/host exec vite build -c vite.lookdev.config.ts --outDir <ziel>
 */
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // Ein einziges Skript statt hunderter Shader-Chunks (Artefakte begrenzen die Dateizahl).
    rolldownOptions: { input: 'src/lookdev/lookdev.html', output: { inlineDynamicImports: true } },
  },
});
