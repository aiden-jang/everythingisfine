import assert from "node:assert/strict";
import test from "node:test";
import BrowserShards from "./browser-shards.mjs";

test("browser shards cover every test exactly once and spread adjacent expensive cases", async () => {
  const tests = Array.from({ length: 275 }, (_, id) => ({ id }));
  const groups = [];
  for (let current = 1; current <= 6; current++) {
    const excluded = new Set();
    let replaced = false;
    await new BrowserShards().preprocess({
      config: { shard: { current, total: 6 } },
      suite: { allTests: () => tests },
      testRun: {
        skipSharding: () => (replaced = true),
        exclude: (entry) => excluded.add(entry),
      },
    });
    assert.equal(replaced, true);
    groups.push(tests.filter((entry) => !excluded.has(entry)));
  }
  assert.deepEqual(
    groups.flat().sort((a, b) => a.id - b.id),
    tests,
  );
  assert.equal(new Set(groups.flat()).size, tests.length);
  assert.ok(Math.max(...groups.map((g) => g.length)) - Math.min(...groups.map((g) => g.length)) <= 1);
  for (const group of groups)
    assert.equal(group.filter((entry) => entry.id >= 138 && entry.id < 144).length, 1);
});

test("an unsharded local run retains the complete suite", async () => {
  await new BrowserShards().preprocess({
    config: { shard: null },
    suite: { allTests: () => assert.fail("unsharded tests must not be filtered") },
    testRun: {
      skipSharding: () => assert.fail("unsharded runs must not change"),
      exclude: () => assert.fail("unsharded tests must not be excluded"),
    },
  });
});
