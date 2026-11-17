import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const consumer = (from, name) => createRequire(from.resolve(name));
const vite = consumer(require, "vite");
const preset = consumer(require, "@preact/preset-vite");
const refresh = consumer(preset, "@prefresh/vite");
const rollup = consumer(refresh, "@rollup/pluginutils");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the single advisory exception requires both installed security patches", () => {
  assert.deepEqual(manifest.pnpm.auditConfig.ignoreCves, ["CVE-2026-112366"]);
  for (const version of ["2.3.2", "4.0.7"]) {
    const path = manifest.pnpm.patchedDependencies[`picomatch@${version}`];
    assert.ok(path, `Missing patch for picomatch ${version}`);
    assert.match(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), /CVE-2026-112366/);
  }
});

for (const [name, loader] of [
  ["Vite", vite],
  ["Rollup plugin utilities", rollup],
]) {
  test(`${name} rejects reported repeated-wildcard attacks without hanging`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
      const assert = require('node:assert/strict');
      const match = require(process.argv[1]);
      for (const pattern of ['+(*)b', '+(*a)b', '*(*a)b', '+(?*a)b'])
        assert.equal(match(pattern)('a'.repeat(38) + '!'), false);
      assert.equal(match('**/*.{ts,tsx}')('src/app/TongaStage.tsx'), true);
      assert.equal(match('**/*.{ts,tsx}')('src/app/TongaStage.css'), false);
      assert.equal(match('+(foo).js')('foofoo.js'), true);
      assert.equal(match('+(foo|bar).js')('foobar.js'), true);
    `,
        loader.resolve("picomatch"),
      ],
      { timeout: 1500, encoding: "utf8" },
    );
    assert.equal(result.error, undefined, `Matcher exceeded its limit: ${result.error}`);
    assert.equal(result.status, 0, result.stderr);
  });
}
