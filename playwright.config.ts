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
const againstBuild = process.env["EIF_BUILD"] === "1";

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
  /*
   * Against `dist` when asked, against `pnpm dev` by default.
   *
   * The suite exercised the dev server for its whole life, which meant a bundler-only failure could not
   * be caught by it: a dynamic import that resolves in dev and splits wrong in a build, or a Tailwind
   * arbitrary class that survives dev and is purged from production CSS. Both of those shipped this
   * project recently, so the gap stopped being theoretical.
   *
   * Opt-in rather than the default because a build is slower than a dev boot and the suite is already the
   * slow gate. `reuseExistingServer` is off in build mode on purpose: with it on, a dev server left
   * running on the port would be silently reused and the run would test dev while claiming to test the
   * build, which is worse than not running it.
   */
  webServer: {
    command: againstBuild ? "pnpm build && pnpm preview" : "pnpm dev",
    url: "http://localhost:31600",
    reuseExistingServer: !againstBuild,
    timeout: againstBuild ? 120_000 : 60_000,
  },
});
