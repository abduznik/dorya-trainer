import { defineConfig } from 'vite';

// base: './' makes the build relocatable (itch.io, Electron, Tauri, file://)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { port: 5173 }
});
