import { defineConfig } from "@playwright/test";

const againstBuild = process.env["EIF_BUILD"] === "1";
const ci = Boolean(process.env["CI"]);
const rawShard = process.env["E2E_SHARD"];
const shard = rawShard ? /^(\d+)\/(\d+)$/.exec(rawShard) : null;
if (rawShard && (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2]))) {
  throw new Error(`E2E_SHARD should name a valid shard, such as 1/6, got ${rawShard}`);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // WebGL falls back to software on CI. Separate runners avoid competing renderers.
  workers: ci ? 1 : 2,
  timeout: ci ? 90_000 : 45_000,
  expect: { timeout: ci ? 30_000 : 15_000 },
  reporter: ci ? [["github"], ["list"], ["json", { outputFile: "test-results/results.json" }]] : [["list"]],
  shard: shard ? { current: Number(shard[1]), total: Number(shard[2]) } : null,
  use: {
    baseURL: "http://localhost:31600",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  retries: 1,
  webServer: {
    command: againstBuild ? "pnpm run build && pnpm run preview" : "pnpm run dev",
    url: "http://localhost:31600",
    // A manual dev server must never stand in for the server owned by this test run.
    reuseExistingServer: false,
    timeout: againstBuild ? 120_000 : 60_000,
  },
});
