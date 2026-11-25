import { defineConfig, devices } from '@playwright/test';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `${npm} --prefix apps/server run dev`,
      url: 'http://127.0.0.1:3101/health',
      env: {
        PORT: '3101',
        NODE_ENV: 'test',
        KABEMJUNTO_E2E_FIXTURE: '1',
        // "Jogar agora": espera curta para os bots entrarem rápido nos testes.
        QUICKPLAY_WAIT_MS: '6000',
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${npm} --prefix apps/web run dev -- --host 127.0.0.1 --port 5175`,
      url: 'http://127.0.0.1:5175',
      env: { VITE_SOCKET_URL: 'http://127.0.0.1:3101' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
