// Sample continuous motion only. Feed refreshes, background tabs and one-off shader stalls are not pacing.
export function createFrameBudget() {
  let last = 0,
    samples = 0,
    slow = 0,
    fast = 0,
    changed = -Infinity;
  let scale = 1;
  return {
    scale: () => scale,
    sample(now: number, reduced: boolean, hidden: boolean) {
      const gap = now - last;
      if (gap >= 0 && gap < 8 && !reduced && !hidden) return false;
      last = now;
      if (reduced) {
        const changed = scale !== 1;
        scale = 1;
        samples = slow = fast = 0;
        return changed;
      }
      if (hidden || gap < 0 || gap > 250) {
        samples = slow = fast = 0;
        return false;
      }
      samples++;
      if (gap > 28) slow++;
      if (gap < 19) fast++;
      if (samples < 120) return false;
      const previous = scale;
      if (now - changed >= 10_000) {
        if (slow / samples > 0.65) scale = Math.max(0.6, scale - 0.2);
        else if (fast / samples > 0.95) scale = Math.min(1, scale + 0.2);
      }
      samples = slow = fast = 0;
      if (scale === previous) return false;
      changed = now;
      return true;
    },
  };
}
