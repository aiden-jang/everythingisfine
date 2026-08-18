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
  /*
   * Parallel, now that both feeds are served from the test.
   *
   * Serial was the right call while every test shared two live agencies: parallel workers would have
   * multiplied the request rate against somebody else's servers and turned one slow morning into a
   * suite-wide failure. `e2e/feeds.ts` removed the shared dependency, so the reason went with it.
   */
  fullyParallel: true,
  /*
   * Two, not four. Each worker runs a WebGL globe, and four of them saturated the machine at 584% CPU
   * and failed three tests on the entrance spring taking longer than its poll allowed. Two halves the
   * wall clock without turning the suite into its own load test.
   */
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:31600",
    trace: "retain-on-failure",
  },
  /*
   * One retry, for the browser rather than for the app.
   *
   * Two workers each hold a WebGL context, and a run occasionally loses one to a "session closed"
   * protocol error partway through a test. That is the browser dying, not an assertion failing, and it
   * is the one thing a retry is legitimately for. A logic failure fails twice.
   */
  retries: 1,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:31600",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
