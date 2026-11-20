import type { FloatDiveView } from "../app/float/floatPlayback";
import type { CameraState, Controls } from "./controlsTypes";
import type { createFloatSurface } from "./floatSurface";

const RETURN_SECONDS = 1.48;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function createFloatDeparture(
  controls: Controls,
  canvas: HTMLCanvasElement,
  surface: ReturnType<typeof createFloatSurface>,
) {
  let pin: HTMLDivElement | undefined;
  let location: FloatDiveView["profile"] | undefined;
  let flight: { from: CameraState; to: CameraState; ascent: number; reveal: number; elapsed: number } | null =
    null;
  const input = new AbortController();

  function place(opacity: number) {
    if (!location || !pin) return undefined;
    const point = controls.project(location.lon, location.lat);
    const box = canvas.getBoundingClientRect();
    if (!point || box.width < 1 || box.height < 1) {
      pin.hidden = true;
      return undefined;
    }
    const x = (point.x - box.left) / box.width;
    const bottom = (box.bottom - point.y) / box.height;
    pin.hidden = opacity === 0 || x < 0.025 || x > 0.975 || bottom < 0.04 || bottom > 0.96;
    pin.toggleAttribute("data-label-left", x > 0.7);
    pin.style.left = `${x * 100}%`;
    pin.style.bottom = `${bottom * 100}%`;
    pin.style.opacity = String(opacity);
    return { x, y: bottom };
  }

  function finish() {
    flight = null;
    surface.departure(0);
    surface.draw(0, 0, 0, false);
    place(1);
  }

  const interrupt = () => {
    if (flight) finish();
  };
  canvas.addEventListener("pointerdown", interrupt, { signal: input.signal });
  canvas.addEventListener("wheel", interrupt, { passive: true, signal: input.signal });
  window.addEventListener(
    "keydown",
    (event) => {
      // Camera input listens on the window. Panel shortcuts and scrubber arrows leave the shot alone.
      if (
        (document.activeElement === document.body ||
          document.activeElement === canvas ||
          document.activeElement?.id === "globe-view") &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "0"].includes(event.key)
      )
        interrupt();
    },
    { signal: input.signal },
  );

  return {
    get active() {
      return flight !== null;
    },
    begin(view: FloatDiveView, reveal: number, to: CameraState) {
      location = view.profile;
      if (!pin) {
        pin = document.createElement("div");
        pin.className = "float-return-pin";
        pin.hidden = true;
        pin.setAttribute("aria-hidden", "true");
        pin.append(document.createElement("span"));
        canvas.parentElement?.append(pin);
      }
      pin.firstElementChild!.textContent = `Argo ${location.wmo}`;
      if (reveal < 0.1 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        place(1);
        return false;
      }
      const from = controls.state();
      const first = location.samples[0]!.depth;
      const last = location.samples.at(-1)!.depth;
      flight = { from, to, ascent: (first - view.depth()) / (first - last), reveal, elapsed: 0 };
      // Replace the destination spring that navigation started with the authored shot.
      controls.setView(from);
      return true;
    },
    step(elapsed: number, reduced: boolean) {
      if (!flight) return false;
      flight.elapsed += elapsed;
      const t = Math.min(1, flight.elapsed / RETURN_SECONDS);
      const { from, to, ascent, reveal } = flight;
      if (t === 1 || reduced) {
        controls.setView(to);
        finish();
        return false;
      }
      const travel = smooth((t - 0.12) / 0.88);
      const lon = to.lon - from.lon;
      controls.setView({
        lon: from.lon + (lon - Math.round(lon / 360) * 360) * travel,
        lat: mix(from.lat, to.lat, travel),
        zoom: mix(from.zoom, to.zoom, travel),
      });
      surface.departure(t, place(smooth((t - 0.49) / 0.32)));
      surface.draw(reveal, mix(ascent, 1, smooth(t * 1.7)), 0, reduced);
      return true;
    },
    place() {
      if (location && !flight) place(1);
    },
    clear() {
      interrupt();
      location = undefined;
      if (pin) pin.hidden = true;
    },
    dispose() {
      input.abort();
      pin?.remove();
    },
  };
}
