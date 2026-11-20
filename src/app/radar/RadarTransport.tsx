import { useLayoutEffect, useRef, type ReactNode, type KeyboardEventHandler } from "react";
import { createPortal } from "react-dom";
import { StoryDock } from "../observations/StoryDock";
import { useMedia } from "../useNarrow";

export function RadarTransport({
  layer,
  dock,
  children,
}: {
  layer: boolean;
  dock: KeyboardEventHandler<HTMLElement> | undefined;
  children: ReactNode;
}): JSX.Element {
  // The fixed dock would leave too little of the inspector visible on a short phone.
  const roomForDock = useMedia("(max-width: 767px) and (min-height: 700px)");
  const target = layer && dock && roomForDock ? document.querySelector<HTMLElement>(".frame") : null;
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
  if (!layer) return <StoryDock label="Radar playback">{children}</StoryDock>;
  const controls = (
    <div
      ref={container}
      className={target ? "radar-dock" : undefined}
      role="group"
      aria-label="Radar scan controls"
      onKeyDown={target ? dock : undefined}
    >
      {children}
    </div>
  );
  return target ? createPortal(controls, target) : controls;
}
