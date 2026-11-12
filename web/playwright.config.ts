import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (npm run build first), served with the same headers
// Cloudflare Pages sends. E2E_BASE_URL points it at a deployed site instead.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173", trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
    // Production headers (public/_headers: strict CSP, COOP/COEP), not Vite's preview.
    command: "node scripts/serve.mjs 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
