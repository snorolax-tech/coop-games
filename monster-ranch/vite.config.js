import { defineConfig } from 'vite';

// base: './' makes the build work from any sub-path (GitHub Pages, Netlify, itch.io...)
// __BUILD_ID__ is a unique id per build: host and guest must match to play together.
export default defineConfig({
  base: './',
  server: { port: 5174, host: true },
  build: { chunkSizeWarningLimit: 2000 },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')),
  },
});
