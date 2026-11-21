import { Vector3, type Camera, type Matrix4 } from "three";

export function createStopMarkers() {
  const screen = new Vector3();
  let overlay: HTMLElement | null = null;
  return (canvas: HTMLCanvasElement, camera: Camera, surface: Matrix4, stops: readonly Vector3[]) => {
    if (!overlay?.isConnected) {
      overlay = canvas.closest(".zones")?.querySelector<HTMLElement>(".moonfall-stops") ?? null;
    }
    if (!overlay) return;
    const drawing = canvas.getBoundingClientRect();
    const bounds = overlay.getBoundingClientRect();
    const buttons = overlay.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((button, i) => {
      const stop = stops[i];
      if (!stop) {
        button.removeAttribute("data-visible");
        return;
      }
      screen.copy(stop).applyMatrix4(surface).project(camera);
      const x = drawing.left - bounds.left + ((screen.x + 1) / 2) * drawing.width;
      const y = drawing.top - bounds.top + ((1 - screen.y) / 2) * drawing.height;
      const fits =
        x >= 22 && x <= bounds.width - 22 && y >= 22 && y <= bounds.height - 22 && Math.abs(screen.z) < 1;
      button.toggleAttribute("data-visible", fits);
      if (fits) {
        const transform = `translate(${x}px, ${y}px)`;
        if (button.style.transform !== transform) button.style.transform = transform;
      }
    });
  };
}
