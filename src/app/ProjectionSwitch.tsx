import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useNarrow } from "./useNarrow";

export function ProjectionSwitch({
  flat,
  setFlat,
  visible,
}: {
  flat: boolean;
  setFlat: Dispatch<SetStateAction<boolean>>;
  visible: boolean;
}) {
  const narrow = useNarrow();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const next = narrow ? document.querySelector<HTMLElement>(".canvas-information") : null;
    if (next === target) return;
    restoreFocus.current = document.activeElement === button.current;
    setTarget(next);
  }, [narrow, target]);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    button.current?.focus({ preventScroll: true });
  }, [target]);
  const control = (
    <div
      className="projection-switch"
      role="group"
      aria-label="Projection"
      data-flat={flat}
      hidden={!visible}
    >
      <span className="projection-current" aria-current="true">
        {flat ? "Map" : "Globe"}
      </span>
      <button
        ref={button}
        type="button"
        id="view-projection"
        className="observatory-save"
        onClick={() => setFlat((value) => !value)}
        aria-description={flat ? "Switch to globe" : "Switch to map"}
      >
        {flat ? "Globe" : "Map"}
      </button>
    </div>
  );
  return target ? createPortal(control, target) : control;
}
