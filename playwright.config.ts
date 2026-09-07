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
   * Two locally, one in CI, and each number is measured rather than picked.
   *
   * Each worker runs a WebGL globe. Four saturated this machine at 584% CPU and failed three tests on the
   * entrance spring taking longer than its poll allowed. Two is fine for a single spec - `design.spec.ts`
   * alone runs 27 tests green in 2.0m - and is still too many for the whole suite: a full run put two
   * design tests red that both pass in isolation in 32s, so the suite was load-testing itself.
   *
   * A CI runner has fewer cores than this and no GPU at all, so WebGL falls back to software rendering.
   * One worker there removes the contention rather than betting the build on it.
   */
  workers: process.env["CI"] ? 1 : 2,
  /*
   * Longer in CI for the same reason. These are wall-clock budgets on a spring settling and a canvas
   * painting, and software rendering makes both slower without making either wrong.
   */
  timeout: process.env["CI"] ? 90_000 : 45_000,
  expect: { timeout: process.env["CI"] ? 30_000 : 15_000 },
  /* Named, because the CI default is `dot`, which writes middots to one unterminated line: GitHub
     renders nothing until it breaks at eighty, so a 14-minute run reads as hung. */
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  /* From the environment, not a flag: a forwarded `--shard` gets dropped and every shard then runs the
     whole suite. One string, `1/3`, so the workflow's matrix is the only place the count is written. */
  shard: (() => {
    const raw = process.env["E2E_SHARD"];
    if (!raw) return null;
    const [current, total] = raw.split("/").map(Number);
    if (!current || !total) throw new Error(`E2E_SHARD should look like 1/3, got ${raw}`);
    return { current, total };
  })(),
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
