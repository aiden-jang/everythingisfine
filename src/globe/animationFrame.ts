// WebGL can stall the compositor while visible. Keep a pending archive frame recoverable
// through the main thread, with only one callback owning the next step.
const FALLBACK_MS = 250;

export function createAnimationFrame(fallback: () => boolean) {
  let draw: FrameRequestCallback | undefined;
  let animation: number | undefined;
  let timer: number | undefined;
  function cancel() {
    if (animation !== undefined) window.cancelAnimationFrame(animation);
    if (timer !== undefined) window.clearTimeout(timer);
    draw = animation = timer = undefined;
  }
  function run(now: number) {
    const next = draw;
    cancel();
    if (!document.hidden) next?.(now);
  }
  function watch() {
    if (draw && timer === undefined && fallback()) {
      timer = window.setTimeout(() => {
        timer = undefined;
        run(performance.now());
      }, FALLBACK_MS);
    }
  }
  return {
    cancel,
    watch,
    request(callback: FrameRequestCallback) {
      draw = callback;
      animation = window.requestAnimationFrame((now) => {
        animation = undefined;
        run(now);
      });
      watch();
    },
  };
}
