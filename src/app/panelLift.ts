/** Lift a focused event clear of the phone detail panel, using the same layout contract. */
export function liftForPanel(): number {
  if (window.matchMedia("(min-width: 768px)").matches) return 0;
  const canvas = document.querySelector("canvas");
  const zones = document.querySelector(".zones");
  if (!canvas || !zones) return 0;
  /* Where the sheet's top edge will be, worked out rather than measured: the first pin is the one that
       opens it, so there is nothing to measure yet. Do not go back to a fraction of the canvas. Twice
       tried: the bar is the same size on every phone and the canvas is not, so a quarter of a short one put
       the event 6px under the bar. See ARCHITECTURE.md#srcapppanelliftts. */
  const box = canvas.getBoundingClientRect();
  const zoneBox = zones.getBoundingClientRect();
  const share = Number(getComputedStyle(document.documentElement).getPropertyValue("--panel-share")) || 0.7;
  const rail = document.getElementById("chrome-rail");
  const footer = rail ? parseFloat(getComputedStyle(rail).marginBottom) || 0 : 0;
  const sheetTop = zoneBox.bottom - footer - Math.min(share * window.innerHeight, zoneBox.height - footer);
  return Math.max(0, Math.round((box.bottom - Math.min(box.bottom, sheetTop)) / 2));
}
