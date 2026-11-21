import type { CSSProperties } from "react";

export function TimelineCues({
  cues,
  max,
  index,
}: {
  cues: readonly { index: number; label: string }[];
  max: number;
  index: number;
}) {
  return (
    <span className="time-cues" aria-hidden="true">
      {cues.map((cue) => (
        <span
          key={cue.label}
          title={cue.label}
          data-passed={index >= cue.index || undefined}
          style={{ "--cue-position": cue.index / Math.max(max, 1) } as CSSProperties}
        />
      ))}
    </span>
  );
}
