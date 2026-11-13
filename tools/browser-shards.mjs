import { basename } from "node:path";
import costs from "./browser-costs.json" with { type: "json" };
import cases from "./browser-case-costs.json" with { type: "json" };

// Ubuntu software-WebGL run 43464908433 (f5e6144): file means plus cases ≥10s from their mean.
// Estimates only schedule work; renamed and new tests still run with the file or typical cost.
export const estimatedSeconds = (test) => {
  const file = basename(test.location.file);
  const title = test.title?.replace(/ @dev$/, "");
  return cases[`${file} › ${title}`] ?? costs[file] ?? 15;
};

export default class BrowserShards {
  async preprocess({ config, suite, testRun }) {
    if (!config.shard) return;
    const { current, total } = config.shard;
    const tests = suite.allTests();
    const loads = Array.from({ length: total }, () => ({ seconds: 0, count: 0 }));
    const assignments = new Map();
    // Place expensive cases first; filtering afterward preserves each runner's declaration order.
    // Equal estimates retain inventory order, and ties favor fewer cases then the lower shard.
    for (const test of [...tests].sort((a, b) => estimatedSeconds(b) - estimatedSeconds(a))) {
      const target = loads.reduce((best, load, index) => {
        const previous = loads[best];
        return load.seconds < previous.seconds ||
          (load.seconds === previous.seconds && load.count < previous.count)
          ? index
          : best;
      }, 0);
      loads[target].seconds += estimatedSeconds(test);
      loads[target].count++;
      assignments.set(test, target);
    }
    testRun.skipSharding();
    tests.forEach((test) => {
      if (assignments.get(test) !== current - 1) testRun.exclude(test);
    });
  }

  printsToStdio() {
    return false;
  }
}
