import assert from "node:assert/strict";
import test from "node:test";
import BrowserShards, { estimatedSeconds } from "./browser-shards.mjs";
import costs from "./browser-costs.json" with { type: "json" };
import cases from "./browser-case-costs.json" with { type: "json" };

async function shard(tests, total) {
  const groups = [];
  for (let current = 1; current <= total; current++) {
    const excluded = new Set();
    let replaced = false;
    await new BrowserShards().preprocess({
      config: { shard: { current, total } },
      suite: { allTests: () => tests },
      testRun: {
        skipSharding: () => (replaced = true),
        exclude: (entry) => excluded.add(entry),
      },
    });
    assert.equal(replaced, true);
    groups.push(tests.filter((entry) => !excluded.has(entry)));
  }
  return groups;
}

const entry = (id, file = "new-view.spec.ts") => ({
  id,
  location: { file: `/repo/e2e/${file}` },
});

test("browser shards cover every test once, retain order and balance known and new files", async () => {
  const files = [...Object.keys(costs), "new-view.spec.ts"];
  const tests = Array.from({ length: 289 }, (_, id) => entry(id, files[id % files.length]));
  const originalOrder = [...tests];
  const groups = await shard(tests, 6);
  assert.deepEqual(
    groups.flat().sort((a, b) => a.id - b.id),
    tests,
  );
  assert.equal(new Set(groups.flat()).size, tests.length);
  assert.deepEqual(tests, originalOrder);
  for (const group of groups)
    assert.deepEqual(
      group,
      [...group].sort((a, b) => a.id - b.id),
    );
  const seconds = groups.map((group) => group.reduce((sum, test) => sum + estimatedSeconds(test), 0));
  assert.ok(Math.max(...seconds) - Math.min(...seconds) <= Math.max(...tests.map(estimatedSeconds)));
  assert.deepEqual(await shard(tests, 6), groups);
});

test("periodic slow cases cannot all land on one count-based shard", async () => {
  const tests = Array.from({ length: 60 }, (_, id) =>
    entry(id, id % 6 === 0 ? "megaflash-replay.spec.ts" : "story-search.spec.ts"),
  );
  const groups = await shard(tests, 6);
  const seconds = groups.map((group) => group.reduce((sum, test) => sum + estimatedSeconds(test), 0));
  assert.ok(Math.max(...seconds) - Math.min(...seconds) <= estimatedSeconds(tests[0]));
});

test("unknown files remain evenly distributed and more runners than tests leave only empty groups", async () => {
  const tests = Array.from({ length: 13 }, (_, id) => entry(id));
  assert.equal(estimatedSeconds(tests[0]), 15);
  const groups = await shard(tests, 6);
  assert.deepEqual(
    groups.map((group) => group.length),
    [3, 2, 2, 2, 2, 2],
  );
  assert.deepEqual((await shard(tests.slice(0, 2), 6)).flat(), tests.slice(0, 2));
  assert.deepEqual(await shard([], 6), [[], [], [], [], [], []]);
});

test("every recorded estimate is a positive finite cost", () => {
  for (const [file, seconds] of Object.entries(costs)) {
    assert.match(file, /\.spec\.ts$/);
    assert.ok(Number.isFinite(seconds) && seconds > 0, file);
    assert.equal(estimatedSeconds(entry(file, file)), seconds);
  }
  for (const [key, seconds] of Object.entries(cases)) {
    const [file, title] = key.split(" › ");
    assert.ok(file in costs && title, key);
    assert.ok(Number.isFinite(seconds) && seconds > 0, key);
    assert.equal(estimatedSeconds({ ...entry(key, file), title }), seconds);
    assert.equal(estimatedSeconds({ ...entry(key, file), title: `${title} @dev` }), seconds);
    assert.equal(estimatedSeconds({ ...entry(key, file), title: "renamed case" }), costs[file]);
  }
});

test("slow and fast cases in the same file are balanced independently", async () => {
  const tests = Object.entries(cases).map(([key], id) => {
    const [file, title] = key.split(" › ");
    return { ...entry(id, file), title };
  });
  const groups = await shard(tests, 6);
  assert.equal(new Set(groups.flat()).size, tests.length);
  const seconds = groups.map((group) => group.reduce((sum, test) => sum + estimatedSeconds(test), 0));
  assert.ok(Math.max(...seconds) - Math.min(...seconds) <= Math.max(...tests.map(estimatedSeconds)));
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
