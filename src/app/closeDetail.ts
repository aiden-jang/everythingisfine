export function closeDetail(kind: "quake" | "hazard" | "section", close: () => void) {
  const selector =
    kind === "quake"
      ? '#recent-earthquakes [aria-current="true"]'
      : kind === "hazard"
        ? '[data-hazard-row][aria-current="true"]'
        : null;
  const returnTo = selector ? document.querySelector<HTMLElement>(selector) : null;
  close();
  requestAnimationFrame(() =>
    (returnTo?.checkVisibility() ? returnTo : document.getElementById("globe-view"))?.focus({
      preventScroll: true,
    }),
  );
}
