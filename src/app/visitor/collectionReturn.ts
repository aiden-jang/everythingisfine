import { restorePanel } from "../panelReturn";

export interface CollectionPosition {
  focus: string;
  scroll: number;
  disclosures: string[];
}

export function captureCollection(focus: string): CollectionPosition | undefined {
  const panel = document.getElementById("saved-observations");
  if (!panel || !focus.startsWith("saved-entry-")) return;
  return {
    focus,
    scroll: panel.scrollTop,
    disclosures: Array.from(panel.querySelectorAll<HTMLDetailsElement>("details[open][id]"), (el) => el.id),
  };
}

export function restoreCollection(position: CollectionPosition) {
  for (const id of position.disclosures) {
    const details = document.getElementById(id);
    if (details instanceof HTMLDetailsElement) details.open = true;
  }
  restorePanel({ scrollTarget: "saved-observations", ...position, fallback: "saved-heading" });
}
