/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `npm run dev` forwards /api to a backend. Default: one on this machine. To work on the
  // frontend with no Python at all, point API_TARGET at any running VITAL server.
  server: { port: 5173, proxy: { '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:7860', changeOrigin: true } } },
  // No manual chunks on purpose: the body scan is a dynamic import, so Rollup keeps three.js
  // in its own lazy chunk and the first paint does not wait for it.
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], globals: false },
});
