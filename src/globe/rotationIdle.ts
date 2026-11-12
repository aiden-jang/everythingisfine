const RESUME_AFTER_MS = 1500;

export function createRotationIdle() {
  const pointers = new Set<number>();
  let until = 0;
  return {
    get interacted() {
      return until > 0;
    },
    hold(id: number) {
      pointers.add(id);
    },
    defer(now: number) {
      until = now + RESUME_AFTER_MS;
    },
    release(id: number, now: number) {
      if (!pointers.delete(id)) return false;
      until = now + RESUME_AFTER_MS;
      return true;
    },
    clear(now: number) {
      pointers.clear();
      until = now + RESUME_AFTER_MS;
    },
    remaining(now: number) {
      return pointers.size ? Infinity : Math.max(0, until - now);
    },
  };
}
