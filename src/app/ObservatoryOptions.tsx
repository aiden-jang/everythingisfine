import { RecordButton } from "./capture/ClipControls";
import type { Clip } from "./capture/useClip";
import { useId, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import "./observatory-options.css";

export function ObservatoryOptions({
  clip,
  ready,
  saving,
  saveStill,
  rotation,
}: {
  clip: Clip;
  ready: boolean;
  saving: boolean;
  saveStill: () => void;
  rotation: { enabled: boolean; set: (enabled: boolean) => void };
}): JSX.Element {
  const id = useId();
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
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (rect && panel.current) {
            panel.current.style.insetBlockStart = `${rect.bottom + 8}px`;
            panel.current.style.maxBlockSize = `calc(100dvh - ${rect.bottom + 20}px)`;
          }
        }}
      >
        View options
      </button>
      <div
        ref={panel}
        id={id}
        {...{ popover: "auto" }}
        data-view-popover=""
        className="observatory-options"
        role="region"
        aria-label="View options"
      >
        <button type="button" aria-pressed={rotation.enabled} onClick={() => rotation.set(!rotation.enabled)}>
          Auto-rotate globe <span>{rotation.enabled ? "On" : "Off"}</span>
        </button>
        <p>On the landing page only. Drag to pause; rotation resumes after 1.5 idle seconds.</p>
        <button
          type="button"
          id="capture-still"
          onClick={() => {
            panel.current?.hidePopover();
            saveStill();
          }}
          disabled={saving || !ready}
        >
          {saving ? "Saving image" : "Save image"}
        </button>
        <RecordButton clip={clip} ready={ready} close={() => panel.current?.hidePopover()} />
        <FullscreenButton />
        <nav className="observatory-policy-links" aria-label="Legal">
          <a href="https://accounts.aidenjang.com/privacy#legal-cookies-and-analytics">Privacy</a>
          <a href="https://accounts.aidenjang.com/terms">Terms</a>
        </nav>
      </div>
    </>
  );
}
