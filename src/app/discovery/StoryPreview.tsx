import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { storyPlace, type StoryPlace } from "./places";
import { refreshAnnotations } from "../../globe/annotationInput";
import "./discovery.css";

export function StoryPreview({ children }: { children: ReactNode }) {
  const touch = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout>; held: boolean } | null>(
    null,
  );
  const cancelTouch = () => {
    if (touch.current) clearTimeout(touch.current.timer);
  };
  useEffect(() => cancelTouch, []);
  const [place, setPlace] = useState<StoryPlace | null>(null);
  useLayoutEffect(() => refreshAnnotations(), [place]);
  const preview = (target: EventTarget | null) => {
    if (target instanceof Element && target.closest(".discovery-preview")) return;
    const button = target instanceof Element ? target.closest("button[id]") : null;
    setPlace(button ? (storyPlace(button.id) ?? null) : null);
  };
  const stage = document.querySelector(".zones");
  return (
    <div
      onPointerOver={(event) => {
        if (event.pointerType !== "touch") preview(event.target);
      }}
      onFocusCapture={(event) => {
        if (!touch.current) preview(event.target);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        const button = event.target instanceof Element ? event.target.closest("button[id]") : null;
        const region = button ? storyPlace(button.id) : null;
        if (!region) return;
        cancelTouch();
        touch.current = {
          x: event.clientX,
          y: event.clientY,
          held: false,
          timer: setTimeout(() => {
            if (touch.current) {
              touch.current.held = true;
              setPlace(region);
            }
          }, 400),
        };
      }}
      onPointerMove={(event) => {
        const start = touch.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelTouch();
      }}
      onPointerUp={cancelTouch}
      onPointerCancel={() => {
        cancelTouch();
        touch.current = null;
      }}
      onContextMenu={(event) => {
        if (touch.current?.held) event.preventDefault();
      }}
      onPointerLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Element && event.relatedTarget.closest(".discovery-preview")) &&
          !document.activeElement?.closest("#stories-panel")
        )
          setPlace(null);
      }}
      onBlurCapture={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node) &&
          !(event.relatedTarget instanceof Element && event.relatedTarget.closest(".discovery-preview"))
        )
          setPlace(null);
      }}
      onClickCapture={(event) => {
        if (touch.current?.held) {
          event.preventDefault();
          event.stopPropagation();
        } else if (!(event.target instanceof Element && event.target.closest(".discovery-preview")))
          setPlace(null);
        touch.current = null;
      }}
    >
      {children}
      {place &&
        stage &&
        createPortal(
          <div className="discovery-preview" aria-label="Story location preview">
            <span
              className="discovery-pin"
              data-observation-anchor=""
              data-lon={place.lon}
              data-lat={place.lat}
              aria-hidden="true"
            >
              <i />
              {place.label}
            </span>
            <div className="discovery-preview-caption">
              <span>
                {place.label}
                <small>Story region · preview</small>
              </span>
              <button type="button" onClick={() => refreshAnnotations(place)}>
                Locate
              </button>
              <button type="button" aria-label="Dismiss location preview" onClick={() => setPlace(null)}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 3 10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
          </div>,
          stage,
        )}
    </div>
  );
}
