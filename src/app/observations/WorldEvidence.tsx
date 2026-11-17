import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./world-evidence.css";

export function WorldEvidence({ children, state }: { children: ReactNode; state: string }) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(0);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const from =
      animation.current?.playState === "running" ? element.getBoundingClientRect().height : previous.current;
    animation.current?.cancel();
    const height = element.getBoundingClientRect().height;
    previous.current = height;
    if (
      from > 0 &&
      height > 0 &&
      Math.abs(from - height) > 1 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      animation.current = element.animate([{ height: `${from}px` }, { height: `${height}px` }], {
        duration: 550,
        easing: "cubic-bezier(.16,1,.3,1)",
      });
  }, [state]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = new ResizeObserver(() => {
      if (animation.current?.playState !== "running")
        previous.current = element.getBoundingClientRect().height;
    });
    resize.observe(element);
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (preference.matches || document.hidden) animation.current?.cancel();
    };
    preference.addEventListener("change", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      resize.disconnect();
      preference.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", stop);
      animation.current?.cancel();
    };
  }, []);
  return (
    <div ref={root} className="world-evidence">
      {children}
    </div>
  );
}
