import { useLayoutEffect, useRef, type ReactNode, type KeyboardEventHandler } from "react";
import { createPortal } from "react-dom";
import { StoryDock } from "../observations/StoryDock";
import { useNarrow } from "../useNarrow";

export function RadarTransport({
  layer,
  dock,
  children,
}: {
  layer: boolean;
  dock: KeyboardEventHandler<HTMLElement> | undefined;
  children: ReactNode;
}): JSX.Element {
  const narrow = useNarrow();
  const target = layer && dock && narrow ? document.querySelector<HTMLElement>(".frame") : null;
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!target || !element) return;
    const reserve = () => target.style.setProperty("--radar-dock-height", `${element.offsetHeight}px`);
    const resize = new ResizeObserver(reserve);
    resize.observe(element);
    reserve();
    return () => {
      resize.disconnect();
      target.style.removeProperty("--radar-dock-height");
    };
  }, [target]);
  if (target)
    return createPortal(
      <div
        ref={container}
        className="radar-dock"
        role="group"
        aria-label="Radar scan controls"
        onKeyDown={dock}
      >
        {children}
      </div>,
      target,
    );
  return layer ? <>{children}</> : <StoryDock label="Radar playback">{children}</StoryDock>;
}
