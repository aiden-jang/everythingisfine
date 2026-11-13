import { useSyncExternalStore } from "react";
import type { CameraGuidance } from "./cameraGuidance";

export function CameraRecenter({ guide, wake }: { guide: CameraGuidance; wake: () => void }) {
  const manual = useSyncExternalStore(guide.subscribe, guide.read);
  const tracking = useSyncExternalStore(guide.subscribe, guide.tracking);
  if (!manual && !tracking) return null;
  return (
    <button
      type="button"
      className="absolute right-4 top-[calc(var(--scene-hud-top)+48px)] min-h-11 rounded-[7px] border border-hairline bg-deck px-3 text-sm text-ink hover:bg-raised"
      title={
        manual
          ? "Return to this view’s framing without resetting its time"
          : "Keep this camera position while playback continues"
      }
      aria-pressed={tracking ? !manual : undefined}
      onClick={(event) => {
        event.currentTarget.closest<HTMLElement>("#globe-view")?.focus({ preventScroll: true });
        if (tracking && !manual) guide.interrupt();
        else guide.recenter();
        wake();
      }}
    >
      {manual ? "Recenter" : "Following camera · release"}
    </button>
  );
}
