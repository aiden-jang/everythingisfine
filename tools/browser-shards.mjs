import { basename } from "node:path";
import costs from "./browser-costs.json" with { type: "json" };

// Rounded per-file means from Ubuntu software-WebGL run 43289885155 (50c5702).
// Estimates only schedule work; new files still run with the typical fallback cost.
export const estimatedSeconds = (test) => costs[basename(test.location.file)] ?? 15;

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
