export function shiftGlobe(globe: HTMLElement, from: DOMRect): Animation | null {
  const to = globe.getBoundingClientRect();
  if (Math.min(from.width, from.height, to.width, to.height) < 1) return null;
  const scale = Math.min(from.width, from.height) / Math.min(to.width, to.height);
  const dx = from.x + from.width / 2 - to.x - to.width / 2;
  const dy = from.y + from.height / 2 - to.y - to.height / 2;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return null;
  const flight = globe.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "translate(0, 0) scale(1)" }],
    { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  flight.id = "globe-presentation";
  return flight;
}

export function revealReadings(panel: HTMLElement | null): Animation | null {
  if (!panel?.getClientRects().length || !panel.animate) return null;
  const previous = panel.getAnimations().filter((motion) => motion.id === "readings-arrival");
  const style = previous.length ? getComputedStyle(panel) : null;
  const from = style ? { opacity: style.opacity, transform: style.transform } : null;
  for (const motion of previous) motion.cancel();
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const arrival = panel.animate(
    [
      from ?? {
        opacity: 0.72,
        transform: matchMedia("(max-width: 767px)").matches ? "translateY(8px)" : "translateX(-10px)",
      },
      { opacity: 1, transform: "translate(0, 0)" },
    ],
    { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
  arrival.id = "readings-arrival";
  return arrival;
}
