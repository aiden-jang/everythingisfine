interface Point {
  x: number;
  y: number;
}
interface CameraInput {
  blocked: () => boolean;
  grab: () => void;
  begin: () => void;
  drag: (from: Point, to: Point, velocityFrom: Point, elapsed: number) => void;
  release: (stale: boolean, remaining: number) => void;
  zoom: (factor: number, x: number, y: number) => void;
  nudge: (lon: number, lat: number, factor?: number) => void;
  reset: () => void;
  change: () => void;
}

export function attachCameraInput(canvas: HTMLCanvasElement, input: CameraInput) {
  const pointers = new Map<number, Point>();
  let start: Point | null = null;
  let dragging = false;
  let lastMove = { x: 0, y: 0, t: 0 };
  let pinchDist = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const down = (event: PointerEvent) => {
    if (input.blocked() || event.button !== 0) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) {
      start = point;
      dragging = false;
    }
    input.grab();
    lastMove = { ...point, t: performance.now() };
    if (pointers.size === 2) {
      pinchDist = spread();
      input.begin();
      dragging = true;
    }
  };
  const move = (event: PointerEvent) => {
    const prev = pointers.get(event.pointerId);
    if (!prev || input.blocked()) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const now = spread();
      if (pinchDist > 0 && now > 0) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        input.zoom(now / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = now;
        input.change();
      }
      return;
    }
    if (!dragging) {
      if (!start || Math.hypot(point.x - start.x, point.y - start.y) <= 5) return;
      input.begin();
      dragging = true;
    }
    const t = performance.now();
    const elapsed = (t - lastMove.t) / 1000;
    input.drag(prev, point, lastMove, elapsed);
    if (elapsed > 0.004) lastMove = { ...point, t };
    input.change();
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pinchDist = 0;
    input.release(performance.now() - lastMove.t > 90 || event.type === "pointercancel", pointers.size);
    if (pointers.size === 0) start = null;
  };
  const wheel = (event: WheelEvent) => {
    if (input.blocked()) return;
    event.preventDefault();
    input.zoom(Math.exp(-event.deltaY * 0.0011), event.clientX, event.clientY);
    input.change();
  };
  const reset = () => {
    if (input.blocked()) return;
    input.reset();
    input.change();
  };
  const key = (event: KeyboardEvent) => {
    if (input.blocked() || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.id !== "globe-view") return;
    const step = event.shiftKey ? 24 : 8;
    switch (event.key) {
      case "ArrowLeft":
        input.nudge(-step, 0);
        break;
      case "ArrowRight":
        input.nudge(step, 0);
        break;
      case "ArrowUp":
        input.nudge(0, step);
        break;
      case "ArrowDown":
        input.nudge(0, -step);
        break;
      case "+":
      case "=":
        input.nudge(0, 0, 1.25);
        break;
      case "-":
      case "_":
        input.nudge(0, 0, 1 / 1.25);
        break;
      case "0":
        input.reset();
        break;
      default:
        return;
    }
    event.preventDefault();
    input.change();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("dblclick", reset);
  window.addEventListener("keydown", key);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("dblclick", reset);
    window.removeEventListener("keydown", key);
  };
}
