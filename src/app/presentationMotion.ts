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
  if (!panel?.getClientRects().length) return null;
  return panel.animate(
    [
      { opacity: 0, transform: "translateX(-8px)" },
      { opacity: 1, transform: "translateX(0)" },
    ],
    { delay: 60, duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
  );
}
