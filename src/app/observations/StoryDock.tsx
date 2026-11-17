import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./story-controls.css";

const DockTarget = createContext<HTMLElement | null>(null);

export function StoryDockProvider({ children }: { children: ReactNode }): JSX.Element {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <DockTarget.Provider value={target}>
      {children}
      <div className="story-dock-host" ref={setTarget} />
    </DockTarget.Provider>
  );
}

export function StoryDock({
  children,
  label = "Story playback",
}: {
  children: ReactNode;
  label?: string;
}): JSX.Element | null {
  const target = useContext(DockTarget);
  const dock = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = dock.current;
    const zones = element?.closest<HTMLElement>(".zones");
    if (!element || !zones) return;
    const measure = () => zones.style.setProperty("--story-dock-height", `${element.offsetHeight}px`);
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    measure();
    return () => {
      resize.disconnect();
      zones.style.removeProperty("--story-dock-height");
    };
  }, [target]);
  return target
    ? createPortal(
        <div ref={dock} className="story-dock" role="group" aria-label={label}>
          {children}
        </div>,
        target,
      )
    : null;
}
