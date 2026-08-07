import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // The E2E files share one disposable database and create/delete
  // relational fixtures. Run them serially so one file cannot remove
  // a fixture while another page is still reading it.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npm run dev -- -H 127.0.0.1 -p ${e2ePort}`,
    env: {
      ...process.env,
      APP_URL: e2eBaseUrl,
      VISITOR_HASH_KEY:
        process.env.VISITOR_HASH_KEY ??
        "e2e-visitor-hash-key-at-least-32-characters"
    },
    url: `${e2eBaseUrl}/login`,
    reuseExistingServer: !process.env.CI
  }
});
