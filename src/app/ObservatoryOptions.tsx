import { RecordButton } from "./capture/ClipControls";
import type { Clip } from "./capture/useClip";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FullscreenButton } from "./FullscreenButton";
import "./observatory-options.css";

export function ObservatoryOptions({
  children,
  clip,
  ready,
  saving,
  saveStill,
  rotation,
}: {
  children?: ReactNode;
  clip: Clip;
  ready: boolean;
  saving: boolean;
  saveStill: () => void;
  rotation: { enabled: boolean; set: (enabled: boolean) => void };
}): JSX.Element {
  const id = `view-options-${useId()}`;
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return (
    <>
      <button
        id="observatory-options"
        ref={trigger}
        type="button"
        className="observatory-save"
        {...{ popovertarget: id }}
        aria-controls={id}
        aria-label="View options"
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (rect && panel.current) {
            panel.current.style.insetBlockStart = `${rect.bottom + 8}px`;
            panel.current.style.maxBlockSize = `calc(100dvh - ${rect.bottom + 20}px)`;
          }
        }}
      >
        View options
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        {...{ popover: "auto" }}
        data-view-popover=""
        className="observatory-options"
        role="region"
        aria-label="View options"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          panel.current?.hidePopover();
          trigger.current?.focus({ preventScroll: true });
        }}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next) && next !== trigger.current)
            panel.current?.hidePopover();
        }}
      >
        <section className="view-option-group" aria-label="Motion">
          <h2>Motion</h2>
          <button
            autoFocus
            type="button"
            aria-pressed={rotation.enabled}
            onClick={() => rotation.set(!rotation.enabled)}
          >
            Auto-rotate globe <span>{rotation.enabled ? "On" : "Off"}</span>
          </button>
          <p>
            {rotation.enabled && reduced
              ? "Enabled for the landing page. Paused by reduced motion."
              : "Landing page only. Drag to pause rotation."}
          </p>
        </section>
        <section className="view-option-group" aria-label="Capture">
          <h2>Capture</h2>
          <button
            type="button"
            id="capture-still"
            onClick={() => {
              panel.current?.hidePopover();
              saveStill();
            }}
            disabled={saving || !ready}
            aria-describedby={!ready ? `${id}-capture-note` : undefined}
          >
            {saving ? "Saving image" : "Save image"}
          </button>
          <RecordButton
            clip={clip}
            ready={ready}
            unavailableNote={`${id}-capture-note`}
            close={() => panel.current?.hidePopover()}
          />
          {!ready && <p id={`${id}-capture-note`}>Image and video capture are unavailable for this view.</p>}
          <FullscreenButton />
        </section>
        <section className="view-option-group" aria-label="Globe controls">
          <h2>Globe controls</h2>
          <div
            className="explorer-view-options"
            onClick={(event) => {
              if ((event.target as Element).closest("button")) panel.current?.hidePopover();
            }}
          >
            {children}
          </div>
        </section>
      </div>
    </>
  );
}
