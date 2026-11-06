import { useLayoutEffect, useRef } from "react";
import type { SectionHinge } from "./section";

const DURATION = 840;
const SETTLE = "cubic-bezier(0.2, 0.78, 0.28, 1)";

export function useSectionFold(hinge?: SectionHinge) {
  const panelRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const plot = plotRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!hinge || !panel || !plot || motion.matches || !panel.animate) return;

    const { from, to } = hinge;
    const box = plot.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (box.width === 0 || span < 2) return;

    const origin = `${box.left - panelBox.left}px ${box.top - panelBox.top}px`;
    const translate = `translate(${from.x - box.left}px, ${from.y - box.top}px)`;
    const rotate = `rotate(${Math.atan2(to.y - from.y, to.x - from.x)}rad)`;
    const width = span / box.width;
    const atHinge = `${translate} ${rotate} scale(${width}, 0.62) perspective(900px)`;
    panel.setAttribute("data-folding", "");
    const fold = panel.animate(
      [
        { transform: `${atHinge} rotateX(89.7deg)`, transformOrigin: origin, easing: SETTLE },
        { transform: `${atHinge} rotateX(48deg)`, transformOrigin: origin, offset: 0.35, easing: SETTLE },
        {
          transform: "translate(0px, 0px) rotate(0rad) scale(1, 1) perspective(900px) rotateX(0deg)",
          transformOrigin: origin,
        },
      ],
      DURATION,
    );
    const ink = Array.from(panel.querySelectorAll("[data-section-ink]"), (node) =>
      node.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.18 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }],
        DURATION,
      ),
    );
    const datum = plot.querySelector("[data-section-datum]");
    if (datum) {
      const rest = getComputedStyle(datum).stroke;
      ink.push(
        datum.animate(
          [{ stroke: "var(--color-ink)" }, { stroke: "var(--color-ink)", offset: 0.35 }, { stroke: rest }],
          DURATION,
        ),
      );
    }
    const detach = (): void => {
      panel.removeAttribute("data-folding");
      window.removeEventListener("resize", cancel);
      motion.removeEventListener("change", cancel);
    };
    const cancel = (): void => {
      detach();
      fold.cancel();
      ink.forEach((animation) => animation.cancel());
    };
    fold.addEventListener("finish", detach, { once: true });
    window.addEventListener("resize", cancel);
    motion.addEventListener("change", cancel);
    return cancel;
  }, [hinge]);

  return { panelRef, plotRef };
}
