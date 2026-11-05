import { useLayoutEffect, type RefObject } from "react";

export function usePlaybackBoundary(
  active: boolean,
  panel: RefObject<HTMLElement>,
  trigger: RefObject<HTMLElement>,
  close: (restoreFocus?: boolean) => void,
): void {
  useLayoutEffect(() => {
    if (!active) return;
    panel.current?.focus();
    const outside = (event: PointerEvent | WheelEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !panel.current?.contains(target) &&
        !trigger.current?.contains(target) &&
        target.closest("button, a, input, select, summary, canvas")
      )
        close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
      } else if (
        !(event.target instanceof Node && panel.current?.contains(event.target)) &&
        /^(Arrow.*|Home|End|Enter| |\+|-|,|\.|\[|\])$/.test(event.key)
      )
        close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [active, close, panel, trigger]);
}
