import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // Im LAN erreichbar, damit echte Geräte den Dev-Server öffnen können.
    host: true,
  },
  build: {
    target: 'es2022',
  },
});
