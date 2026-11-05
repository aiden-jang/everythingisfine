import type { SectionHinge, SectionLine } from "../app/section";
import type { Controls } from "./controls";

export type SectionCommit = (line: SectionLine | null, hinge?: SectionHinge) => void;

export function attachSectionDrawing(
  canvas: HTMLCanvasElement,
  controls: Controls,
  draft: { current: SectionLine | null },
  commit: { current: SectionCommit | undefined },
  wake: () => void,
): () => void {
  let endDrag = (): void => {};
  const down = (event: PointerEvent): void => {
    if (!event.shiftKey || event.button !== 0 || controls.morph() !== 1 || !commit.current) return;
    const start = controls.pick(event.clientX, event.clientY);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    endDrag();

    const move = (next: PointerEvent): void => {
      if (next.pointerId !== event.pointerId) return;
      const end = controls.pick(next.clientX, next.clientY);
      if (!end) return;
      draft.current = { fromLon: start.lon, fromLat: start.lat, toLon: end.lon, toLat: end.lat };
      wake();
    };
    const cancel = (next: PointerEvent): void => {
      if (next.pointerId === event.pointerId) endDrag();
    };
    const up = (next: PointerEvent): void => {
      if (next.pointerId !== event.pointerId) return;
      const line = draft.current;
      endDrag();
      if (controls.morph() !== 1) return;
      // A short shift-click clears the section. The chart always starts on the map's left.
      if (!line || Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) <= 12) {
        commit.current?.(null);
        return;
      }
      const ordered =
        next.clientX < event.clientX
          ? { fromLon: line.toLon, fromLat: line.toLat, toLon: line.fromLon, toLat: line.fromLat }
          : line;
      const from = controls.project(ordered.fromLon, ordered.fromLat);
      const to = controls.project(ordered.toLon, ordered.toLat);
      commit.current?.(ordered, from && to ? { from, to } : undefined);
    };
    endDrag = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      draft.current = null;
      endDrag = () => {};
      wake();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  canvas.addEventListener("pointerdown", down, { capture: true });
  return () => {
    endDrag();
    canvas.removeEventListener("pointerdown", down, { capture: true });
  };
}
