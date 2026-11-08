import { defineConfig } from 'vite';

// base: './' makes the build work from any sub-path (GitHub Pages, Netlify, itch.io...)
export default defineConfig({
  base: './',
  server: { port: 5174, host: true },
  build: { chunkSizeWarningLimit: 2000 },
});
