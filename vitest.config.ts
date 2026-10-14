import { defineConfig } from "vitest/config";

/*
 * Live-API tests are opt-in, never default.
 *
 * The polish doc is blunt about this and it is right: a suite that fails on a train, or when an
 * agency is doing maintenance, gets ignored, and an ignored suite is worse than no suite. Recorded
 * fixtures cover behaviour. `pnpm test:live` covers whether the world still looks the way the
 * fixtures say, and it is run deliberately rather than on every push.
 *
 * Gated on an environment variable rather than a CLI filter, so the default run cannot include
 * these by accident from a stray path argument.
 */
const includeLive = process.env["EIF_LIVE"] === "1";

export default defineConfig({
  /*
   * The same react-to-preact aliases vite.config.ts declares, because this file replaces that one.
   *
   * vitest reads its own config and never sees the app's, so removing `react` from the dependencies
   * broke three unit files the instant they imported a module importing it - `Cannot find package
   * 'react'`, resolved through Node with no alias in sight. Duplicated deliberately: the alternative is
   * importing vite.config.ts here for two lines and inheriting a plugin list the tests do not want.
   *
   * Two entries cover four specifiers: a string alias matches the whole name or a `name/` prefix and
   * rewrites only that part, so `react/jsx-runtime` and `react-dom/client` follow without being listed.
   */
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  test: {
    /*
     * One file at a time.
     *
     * The performance gate measures wall-clock work, and running it beside five other files on a
     * shared machine measured the scheduler as much as the code: the same 50,000-event sync came
     * out at 6.9ms alone and 15.3ms under contention, which is a gate that passes or fails
     * depending on what else is running. The whole suite takes under a second, so serialising it
     * costs nothing and makes the number mean something.
     */
    fileParallelism: false,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Playwright owns these; vitest would import @playwright/test and fail on the first line.
      "**/e2e/**",
      "tools/**/*.test.mjs",
      ...(includeLive ? [] : ["**/*.live.test.ts"]),
    ],
  },
});
