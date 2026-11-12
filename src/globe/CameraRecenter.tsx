import { useSyncExternalStore } from "react";
import type { CameraGuidance } from "./cameraGuidance";

export function CameraRecenter({ guide, wake }: { guide: CameraGuidance; wake: () => void }) {
  const manual = useSyncExternalStore(guide.subscribe, guide.read);
  if (!manual) return null;
  return (
    <button
      type="button"
      className="absolute right-4 top-[calc(var(--scene-hud-top)+48px)] min-h-11 rounded-[7px] border border-hairline bg-deck px-3 text-sm text-ink hover:bg-raised"
      title="Return to this view’s framing without resetting its time"
      onClick={(event) => {
        event.currentTarget.closest<HTMLElement>("#globe-view")?.focus({ preventScroll: true });
        guide.recenter();
        wake();
      }}
    >
      Recenter
    </button>
  );
}
