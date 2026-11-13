export type CameraGuidance = ReturnType<typeof createCameraGuidance>;

/** Camera ownership survives frame updates, but never leaks into the next story. */
export function createCameraGuidance() {
  const listeners = new Set<() => void>();
  let key: unknown = null;
  let manual = false;
  let tracking = false;
  let restore = () => {};
  const publish = () => {
    for (const listener of listeners) listener();
  };
  return {
    configure(next: unknown, recenter: () => void, moving = false) {
      restore = recenter;
      const trackingChanged = tracking !== moving;
      tracking = moving;
      if (key === next) {
        if (trackingChanged) publish();
        return;
      }
      key = next;
      const changed = manual;
      manual = false;
      if (changed || trackingChanged) publish();
    },
    interrupt() {
      if (key === null || manual) return false;
      manual = true;
      publish();
      return true;
    },
    following: () => !manual,
    read: () => manual,
    tracking: () => tracking,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recenter() {
      if (key === null) return false;
      manual = false;
      restore();
      publish();
      return true;
    },
  };
}
