import { useSyncExternalStore } from "react";
import { geographicCoordinates } from "../../globe/orbitReadout";
import type { FloatDiveView } from "./floatPlayback";

export function FloatChapter({ view, onBegin }: { view: FloatDiveView; onBegin: () => void }) {
  const stage = useSyncExternalStore(view.subscribe, () => view.read().stage);
  if (stage !== "locate") return null;
  const { profile } = view;
  const deepest = Math.round(profile.samples[0]!.depth).toLocaleString();
  return (
    <div className="float-discovery">
      <p>
        One float. {profile.samples.length.toLocaleString()} measured samples. Follow its rise from {deepest}{" "}
        metres to the surface.
      </p>
      <p className="float-location">
        {geographicCoordinates(profile)} · WMO {profile.wmo}
      </p>
      <button type="button" className="float-begin" onClick={onBegin}>
        Follow the rise
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

export function FloatTitle({ view }: { view: FloatDiveView }) {
  const stage = useSyncExternalStore(view.subscribe, () => view.read().stage);
  return (
    <h2 className={stage === "notice" ? "sr-only" : undefined}>
      {stage === "locate"
        ? "Below the blue."
        : stage === "rise"
          ? "Follow the rise."
          : "What the float found."}
    </h2>
  );
}
