import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useNarrow } from "./useNarrow";

export function MapLegend({
  open,
  onChange,
  children,
}: {
  open: boolean;
  onChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const narrow = useNarrow();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!narrow || !panel.current) return;
    const element = panel.current;
    const sync = () => {
      if (open && !element.matches(":popover-open")) onChange(false);
    };
    element.addEventListener("toggle", sync);
    if (open && !element.matches(":popover-open")) {
      element.showPopover();
      element.querySelector("button")?.focus({ preventScroll: true });
    } else if (!open && element.matches(":popover-open")) element.hidePopover();
    return () => element.removeEventListener("toggle", sync);
  }, [narrow, open, onChange]);
  const close = () => {
    onChange(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div data-ramp>
      <details open={open}>
        <summary
          ref={trigger}
          className="disclose text-[11px] text-faint hover:text-dim"
          onClick={(event) => {
            event.preventDefault();
            onChange(!open);
          }}
        >
          Map legend
        </summary>
        <div
          ref={panel}
          {...(narrow ? { popover: "auto", role: "region", "aria-label": "Map legend" } : {})}
          className={narrow ? "map-legend-popover" : undefined}
          onKeyDown={(event) => {
            if (narrow && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          {narrow && (
            <button type="button" className="map-legend-close" onClick={close}>
              Close legend
            </button>
          )}
          {children}
        </div>
      </details>
    </div>
  );
}
