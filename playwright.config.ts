import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const ci = Boolean(process.env["CI"]);
const webkit = process.env["EIF_WEBKIT"] === "1";
const rawShard = process.env["E2E_SHARD"];
const shard = rawShard ? /^(\d+)\/(\d+)$/.exec(rawShard) : null;
if (rawShard && (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2]))) {
  throw new Error(`E2E_SHARD should name a valid shard, such as 1/6, got ${rawShard}`);
}

const preview = {
  command:
    process.env["EIF_BUILD_READY"] === "1"
      ? "pnpm run preview"
      : ci && shard
        ? "pnpm exec vite build && pnpm run preview"
        : "pnpm run build && pnpm run preview",
  url: "http://localhost:31600",
  reuseExistingServer: false,
  timeout: 120_000,
};
const resilience = "**/resilience.spec.ts";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: ci,
  fullyParallel: true,
  // WebGL falls back to software on CI. Separate runners avoid competing renderers.
  workers: 1,
  timeout: ci ? 90_000 : 45_000,
  expect: { timeout: ci ? 30_000 : 15_000 },
  reporter: [
    [fileURLToPath(new URL("./tools/browser-shards.mjs", import.meta.url))],
    ...(ci
      ? ([["github"], ["list"], ["json", { outputFile: "test-results/results.json" }]] as const)
      : ([["list"]] as const)),
  ],
  shard: shard ? { current: Number(shard[1]), total: Number(shard[2]) } : null,
  use: {
    baseURL: "http://localhost:31600",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  retries: 1,
  projects: webkit
    ? [{ name: "webkit", testMatch: resilience, use: { ...devices["iPhone 13"], deviceScaleFactor: 1 } }]
    : [
        { name: "release", grepInvert: /@dev/, testIgnore: resilience },
        { name: "development", grep: /@dev/, use: { baseURL: "http://localhost:31601" } },
      ],
  webServer: webkit
    ? preview
    : [
        preview,
        {
          command: "pnpm run dev --port 31601",
          url: "http://localhost:31601",
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
