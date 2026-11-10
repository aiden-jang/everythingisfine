import { useId, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import "./observatory-options.css";

export function ObservatoryOptions({
  ready,
  saving,
  saveStill,
  rotation,
}: {
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
          if (rect && panel.current) panel.current.style.insetBlockStart = `${rect.bottom + 8}px`;
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
        <p>On the landing page only. Drag to pause; rotation resumes after five idle seconds.</p>
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
        <FullscreenButton />
      </div>
    </>
  );
}
