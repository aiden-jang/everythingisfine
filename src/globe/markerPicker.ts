import "./marker-picker.css";
import type { MarkerTarget } from "./markerInspection";

export type MarkerChoice = { target: MarkerTarget; place: string; time: string };

const GAP = 12;

export function createMarkerPicker(
  canvas: HTMLCanvasElement,
  select: (target: MarkerTarget) => void,
  redraw: () => void,
  signal: AbortSignal,
) {
  const panel = document.createElement("div");
  panel.className = "marker-picker";
  panel.popover = "manual";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Nearby observations");
  canvas.parentElement?.append(panel);

  let open = false;
  const close = (returnFocus = false) => {
    if (!open) return;
    open = false;
    panel.hidePopover();
    canvas.removeAttribute("data-marker-picker");
    redraw();
    if (returnFocus) {
      const world = canvas.tabIndex >= 0 ? canvas : canvas.closest<HTMLElement>("#globe-view");
      world?.focus({ preventScroll: true });
    }
  };

  const heading = document.createElement("div");
  heading.className = "marker-picker-heading";
  const title = document.createElement("strong");
  title.textContent = "Nearby observations";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Close observations");
  dismiss.onclick = () => close(true);
  heading.append(title, dismiss);

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (open && !panel.contains(event.target as Node)) close();
    },
    { capture: true, signal },
  );
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  document.addEventListener(
    "focusin",
    (event) => {
      if (open && !panel.contains(event.target as Node)) close();
    },
    { signal },
  );
  window.addEventListener("resize", () => close(), { signal });
  window.addEventListener("blur", () => close(), { signal });

  return {
    get open() {
      return open;
    },
    show(x: number, y: number, choices: readonly MarkerChoice[]) {
      if (!panel.isConnected || typeof panel.showPopover !== "function") return false;
      const options = choices.map(({ target, place, time }) => {
        const button = document.createElement("button");
        button.type = "button";
        const label = document.createElement("span");
        label.textContent = place;
        button.append(label);
        if (time) {
          const detail = document.createElement("small");
          detail.textContent = time;
          button.append(detail);
        }
        button.onclick = () => {
          close();
          select(target);
        };
        return button;
      });
      panel.replaceChildren(heading, ...options);
      panel.showPopover();
      open = true;
      canvas.setAttribute("data-marker-picker", "");
      const { width, height } = panel.getBoundingClientRect();
      const left = Math.max(GAP, Math.min(window.innerWidth - width - GAP, x + GAP));
      const top = Math.max(GAP, Math.min(window.innerHeight - height - GAP, y + GAP));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      options[0]?.focus({ preventScroll: true });
      redraw();
      return true;
    },
    close,
    dispose() {
      if (open) canvas.removeAttribute("data-marker-picker");
      panel.remove();
    },
  };
}
