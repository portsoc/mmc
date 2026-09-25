// Browser tests (WP-H). Need the Emulator Suite running from the repo root:
//   firebase emulators:start --project mission-mmc-4476
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5000',
    browserName: 'chromium'
  }
});
