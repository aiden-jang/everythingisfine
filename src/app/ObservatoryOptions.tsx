import { RecordButton } from "./capture/ClipControls";
import type { Clip } from "./capture/useClip";
import { useId, useRef, type ReactNode } from "react";
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
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next) && next !== trigger.current)
            panel.current?.hidePopover();
        }}
      >
        <button
          autoFocus
          type="button"
          aria-pressed={rotation.enabled}
          onClick={() => rotation.set(!rotation.enabled)}
        >
          Auto-rotate globe <span>{rotation.enabled ? "On" : "Off"}</span>
        </button>
        <p>Landing page only. Drag to pause rotation.</p>
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
        {!ready && <p id={`${id}-capture-note`}>Image capture is unavailable for this view.</p>}
        <RecordButton clip={clip} ready={ready} close={() => panel.current?.hidePopover()} />
        <FullscreenButton />
        <div
          className="explorer-view-options"
          onClick={(event) => {
            if ((event.target as Element).closest("button")) panel.current?.hidePopover();
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
