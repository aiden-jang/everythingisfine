import { useEffect, useRef } from "react";

/*
 * A draggable edge, horizontal or vertical.
 *
 * Both sides of every edge want the space, and which one wants it more depends on what somebody is doing.
 *
 * One component for both axes, because the accessible part is worth having once: a `separator` with
 * `aria-valuenow` and arrow keys. A splitter that only answers a mouse is a control a keyboard user can see
 * and cannot touch.
 */

export interface ResizerProps {
  axis: "x" | "y";
  label: string;
  value: number;
  min: number;
  max: number;
  /** Turns a pointer position into a new value, since only the caller knows what it is measuring. */
  measure: (event: PointerEvent) => number;
  onChange: (value: number) => void;
  /** Draws a short bar across the middle instead of a hairline. For a handle nobody can hover: on a phone
   * the hairline only appears on reach, and a touch never reaches. */
  grip?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Resizer({
  axis, label, value, min, max, measure, onChange, grip = false, className, style,
}: ResizerProps): JSX.Element {
  const dragging = useRef(false);
  const latest = useRef({ measure, onChange });
  latest.current = { measure, onChange };

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!dragging.current) return;
      e.preventDefault();
      const { measure: m, onChange: change } = latest.current;
      change(Math.max(min, Math.min(max, m(e))));
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

  const horizontal = axis === "y";
  const [less, more] = horizontal ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];

  return (
    <div
      role="separator"
      aria-label={label}
      // The orientation of the separator, not of the drag: a splitter you move up and down is a
      // horizontal line. Naming it after the gesture is the reading that feels right and is wrong.
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = horizontal ? "row-resize" : "col-resize";
        document.body.style.userSelect = "none";
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === less) onChange(Math.max(min, value - step));
        else if (e.key === more) onChange(Math.min(max, value + step));
        else return;
        e.preventDefault();
      }}
      // Wider than it looks: a 1px line is the correct visual weight and an unusable target, so the
      // hit area straddles the border and only the border is painted.
      className={`group z-[2] ${horizontal ? "h-3 cursor-row-resize" : "w-3 cursor-col-resize"} ${className ?? ""}`}
      style={style}
    >
      {/* Barely there until reached for. A permanent rule through the interface is the seam the
          floating layout exists to remove, and an invisible handle is one nobody finds. */}
      <span
        className={`pointer-events-none absolute bg-hairline/40 transition-colors duration-150 group-hover:bg-dim group-focus-visible:bg-ink ${
          horizontal ? "inset-x-0 top-[6px] h-px" : "inset-y-0 left-[6px] w-px"
        }`}
      />
      {/* The bar, where hovering is not a thing that happens. Short and centred, which is what a sheet
          edge looks like everywhere else, so it reads as a handle without a label saying so. */}
      {grip ? (
        <span
          className={`pointer-events-none absolute rounded-full bg-dim ${
            horizontal
              ? "top-[4px] left-1/2 h-[4px] w-9 -translate-x-1/2"
              : "top-1/2 left-[4px] h-9 w-[4px] -translate-y-1/2"
          }`}
        />
      ) : null}
    </div>
  );
}
