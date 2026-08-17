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
const includeLive = process.env["FIRSTMOTION_LIVE"] === "1";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ...(includeLive ? [] : ["**/*.live.test.ts"]),
    ],
  },
});
