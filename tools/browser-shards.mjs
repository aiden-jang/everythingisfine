export default class BrowserShards {
  async preprocess({ config, suite, testRun }) {
    if (!config.shard) return;
    const { current, total } = config.shard;
    // Adjacent tests exercise the same expensive scene. Interleave them across runners rather than
    // giving one runner the entire responsive and motion suite. Every test still runs exactly once.
    testRun.skipSharding();
    suite.allTests().forEach((test, index) => {
      if (index % total !== current - 1) testRun.exclude(test);
    });
  }

  printsToStdio() {
    return false;
  }
}
