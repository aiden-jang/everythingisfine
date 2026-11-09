import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");

test("the observation relay runs in workerd, caches concurrent reads and rejects redirects", async () => {
  const source = await readFile(new URL("../worker/observations.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  let calls = 0;
  let redirect = false;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      cf: false,
      modules: true,
      compatibilityDate: "2026-08-01",
      script: code + "\nexport default {fetch(request) {return relayObservation(request, caches.default)}};",
      outboundService: async (request) => {
        calls++;
        if (redirect)
          return new globalThis.Response(null, {
            status: 302,
            headers: { Location: "https://example.invalid" },
          });
        const body = request.url.includes(".csv")
          ? "time,latitude,longitude,analysed_sst\nUTC,degrees_north,degrees_east,degree_C\n"
          : new Uint8Array([67, 68, 70, 1, 0, 0, 0, 0]);
        return new globalThis.Response(body);
      },
    }),
  );
  try {
    const url = "https://example.test/api/observations/reef";
    const responses = await Promise.all([1, 2, 3].map(() => runtime.dispatchFetch(url)));
    for (const response of responses) {
      assert.equal(response.status, 200, response.ok ? "" : await response.text());
      assert.equal((await response.arrayBuffer()).byteLength, 8);
    }
    assert.equal(calls, 1);
    const hit = await runtime.dispatchFetch(url);
    assert.equal(hit.status, 200);
    await hit.arrayBuffer();
    assert.equal(calls, 1);
    assert.equal((await runtime.dispatchFetch(url + "?range=global")).status, 404);
    assert.equal(calls, 1);
    const csv = await runtime.dispatchFetch("https://example.test/api/observations/reef-temperature");
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /^time,latitude,longitude,/);
    redirect = true;
    const refused = await runtime.dispatchFetch("https://example.test/api/observations/river");
    assert.equal(refused.status, 503);
    assert.equal(calls, 3);
  } finally {
    await runtime.dispose();
  }
});
