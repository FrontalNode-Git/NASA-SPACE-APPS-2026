import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks. By default they run against a local server on port 7860:
 *
 *     (frontend)  npm run build
 *     (backend)   python -m uvicorn app.main:app --port 7860
 *     (frontend)  npm run e2e
 *
 * To test the deployed Space in a fresh context, set BASE_URL to its full https URL.
 * PW_CHANNEL picks an installed browser (msedge, chrome) instead of a Playwright download.
 */
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:7860',
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'desktop', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
