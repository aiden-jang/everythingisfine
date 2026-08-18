import { useEffect, useRef } from "react";

/*
 * The edge between the rail and the globe, draggable.
 *
 * Both sides genuinely want the space and which one wants it more depends on what somebody is doing:
 * reading the list wants a wide rail, watching a sequence wants none of one. A fixed 356px is a guess
 * that is wrong half the time, and it is a guess this app is in no position to make for someone.
 *
 * A `separator` with `aria-valuenow`, not a bare div with a pointer handler. A splitter that only
 * answers a mouse is a control a keyboard user can see and cannot touch, which is the same gap the
 * globe had before the camera keys.
 */

export interface ResizerProps {
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}

export function Resizer({ width, min, max, onChange }: ResizerProps): JSX.Element {
  const dragging = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!dragging.current) return;
      e.preventDefault();
      latest.current(Math.max(min, Math.min(max, e.clientX)));
    };
    const onUp = (): void => {
      dragging.current = false;
      document.body.style.cursor = "";
      // Text selection is off during a drag, because dragging across a list of place names otherwise
      // highlights all of them and the drag ends with half the rail selected.
      document.body.style.userSelect = "";
    };
    // On window, not on the handle: a pointer moving faster than the layout updates leaves a 4px
    // handle behind, and the drag would stop the moment the cursor overtook it.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [min, max]);

  return (
    <div
      role="separator"
      aria-label="Rail width"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") onChange(Math.max(min, width - step));
        else if (e.key === "ArrowRight") onChange(Math.min(max, width + step));
        else return;
        e.preventDefault();
      }}
      // Wider than it looks: a 1px line is the correct visual weight and an unusable target, so the
      // hit area straddles the border and only the border is painted.
      className="absolute inset-y-0 z-[2] hidden w-3 cursor-col-resize xl:block"
      style={{ left: width - 6 }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-[6px] w-px bg-hairline transition-colors" />
    </div>
  );
}
