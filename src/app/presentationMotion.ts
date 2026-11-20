import { globeFramingRect } from "../globe/globeFraming";

export function shiftGlobe(globe: HTMLElement, from: DOMRect, id = "globe-presentation"): Animation | null {
  const to = globeFramingRect(globe);
  if (Math.min(from.width, from.height, to.width, to.height) < 1) return null;
  const scale = Math.min(from.width, from.height) / Math.min(to.width, to.height);
  const bounds = globe.getBoundingClientRect();
  const [originX = 0, originY = 0] = getComputedStyle(globe).transformOrigin.split(" ").map(parseFloat);
  const centerX = to.x + to.width / 2;
  const centerY = to.y + to.height / 2;
  const dx = from.x + from.width / 2 - centerX + (1 - scale) * (centerX - bounds.x - originX);
  const dy = from.y + from.height / 2 - centerY + (1 - scale) * (centerY - bounds.y - originY);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return null;
  const flight = globe.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "translate(0, 0) scale(1)" }],
    { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  flight.id = id;
  return flight;
}

export function revealReadings(
  panel: HTMLElement | null,
  motion: "drift" | "fade" = "drift",
  duration = 320,
): Animation | null {
  if (!panel?.getClientRects().length || !panel.animate) return null;
  const previous = panel.getAnimations().filter((motion) => motion.id === "readings-arrival");
  const style = previous.length ? getComputedStyle(panel) : null;
  const from = style ? { opacity: style.opacity, transform: style.transform } : null;
  for (const motion of previous) motion.cancel();
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const arrival = panel.animate(
    motion === "fade"
      ? [{ opacity: from?.opacity ?? 0.72 }, { opacity: 1 }]
      : [
          from ?? {
            opacity: 0.55,
            transform: matchMedia("(max-width: 899px) and (min-height: 621px), (max-width: 599px)").matches
              ? "translateY(16px)"
              : "translateX(-18px)",
          },
          { opacity: 1, transform: "translate(0, 0)" },
        ],
    { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  arrival.id = "readings-arrival";
  return arrival;
}
