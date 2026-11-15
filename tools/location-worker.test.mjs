import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");

test("workerd returns only coarse per-request coordinates without an outbound lookup", async () => {
  const source = await readFile(new URL("../worker/location.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  let outbound = 0;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      cf: false,
      modules: true,
      compatibilityDate: "2026-08-01",
      script: code + "\nexport default {fetch: approximateLocation};",
      outboundService: async () => {
        outbound++;
        return new globalThis.Response("Unexpected lookup", { status: 500 });
      },
    }),
  );
  try {
    const url = "https://example.test/api/location";
    for (const [cf, expected] of [
      [
        { longitude: "-73.9857", latitude: "40.7484", city: "New York" },
        { lon: -74, lat: 40.7 },
      ],
      [
        { longitude: "151.2093", latitude: "-33.8688", city: "Sydney" },
        { lon: 151.2, lat: -33.9 },
      ],
      [{ longitude: null, latitude: null }, null],
    ]) {
      const response = await runtime.dispatchFetch(url, { cf });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
      assert.deepEqual(await response.json(), { location: expected });
    }
    assert.equal((await runtime.dispatchFetch(url + "?city=London")).status, 400);
    const options = await runtime.dispatchFetch(url, { method: "OPTIONS" });
    assert.equal(options.status, 405);
    assert.equal(options.headers.get("Allow"), "GET");
    assert.equal(options.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(outbound, 0);
  } finally {
    await runtime.dispose();
  }
});
