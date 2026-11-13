import { useState } from "react";
import type { ObservationFrame } from "./types";
import { layerTime } from "../layerTime";
import { refreshAnnotations } from "../../globe/annotationInput";

export function comparableFrames(frames: readonly ObservationFrame[]): boolean {
  const first = frames[0],
    last = frames.at(-1);
  return (
    !!first &&
    !!last &&
    !frames.some((frame) => frame.sequence || frame.reconstruction) &&
    last.at - first.at >= 60_000
  );
}

export function FrameComparison({
  frames,
  index,
  select,
}: {
  frames: readonly ObservationFrame[];
  index: number;
  select: (index: number) => void;
}) {
  const [pair, setPair] = useState<{
    before: number;
    after: number;
    first: ObservationFrame;
    last: ObservationFrame;
  } | null>(null);
  if (!comparableFrames(frames)) return null;
  const valid = pair && frames.includes(pair.first) && frames.includes(pair.last) ? pair : null;
  const choose = (at: number) => {
    refreshAnnotations({ camera: "hold" });
    select(at);
  };
  return (
    <details
      className="frame-comparison"
      onToggle={(event) => {
        if (!event.currentTarget.open) setPair(null);
      }}
    >
      <summary>Compare dates</summary>
      <p>Switch between two available times at the same framing.</p>
      <div className="observatory-actions">
        <button
          type="button"
          onClick={() => {
            const after = index > 0 ? index : frames.length - 1;
            const next = { before: 0, after, first: frames[0]!, last: frames[after]! };
            setPair(next);
            choose(next.after);
          }}
        >
          {valid ? "Use current moment" : "Compare with first moment"}
        </button>
      </div>
      {valid && (
        <div className="frame-pair" role="group" aria-label="Date comparison">
          {(["before", "after"] as const).map((side) => (
            <button
              type="button"
              key={side}
              aria-pressed={index === valid[side]}
              onClick={() => choose(valid[side])}
            >
              <strong>{side === "before" ? "Earlier" : "Selected"}</strong>
              <time dateTime={new Date(frames[valid[side]]!.at).toISOString()}>
                {frames[valid[side]]!.timeLabel ?? layerTime(frames[valid[side]]!.at)}
              </time>
            </button>
          ))}
        </div>
      )}
    </details>
  );
}
