import { defineConfig } from "@playwright/test";

/*
 * Browser tests, deliberately few.
 *
 * The polish doc asks for "a handful", and it is right. Everything that can be decided from pure
 * logic already is: association, eviction, filters, the front-spawning rule, the update budget.
 * What is left for a browser is the small set of claims that only exist once WebGL, real CSS and a
 * real event loop are involved, and every one of those is slow and can flake.
 *
 * So this file only contains assertions that would be dishonest to make any other way.
 *
 * The dev server is started by Playwright rather than assumed, so a failing run means the app is
 * broken rather than that somebody forgot to run `pnpm dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Generous: the first frame waits on two real network feeds, and a slow morning at an agency is
  // not a test failure.
  timeout: 45_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:31600",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:31600",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
