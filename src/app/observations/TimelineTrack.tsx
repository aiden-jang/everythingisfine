import type { CSSProperties, ReactNode } from "react";

interface Landmark {
  at: number;
  label: string;
  select: () => void;
}

export function TimelineTrack({
  min = 0,
  max,
  current,
  landmark,
  valueLabel,
  kept = [],
  children,
}: {
  min?: number;
  max: number;
  current: number;
  landmark?: Landmark | undefined;
  valueLabel?: string | undefined;
  kept?: readonly number[] | undefined;
  children: ReactNode;
}) {
  const position = (at: number) =>
    ({
      "--timeline-position": Math.max(0, Math.min(1, (at - min) / Math.max(1, max - min))),
    }) as CSSProperties;
  return (
    <div className="timeline-track" data-landmark={!!landmark || undefined}>
      {children}
      {valueLabel && (
        <span className="timeline-value" style={position(current)} aria-hidden="true">
          {valueLabel}
        </span>
      )}
      {kept
        .filter((at) => at >= min && at <= max)
        .map((at) => (
          <span
            key={at}
            className="timeline-kept"
            style={position(at)}
            data-current={at === Math.floor(current) || undefined}
            aria-hidden="true"
          />
        ))}
      {landmark && (
        <button
          type="button"
          className="timeline-landmark"
          data-align={landmark.at > (min + max) / 2 ? "end" : "start"}
          data-edge={landmark.at === min ? "start" : landmark.at === max ? "end" : undefined}
          style={position(landmark.at)}
          aria-label={landmark.label}
          onClick={landmark.select}
        >
          <span className="timeline-landmark-label" aria-hidden="true">
            {landmark.label}
          </span>
        </button>
      )}
      {kept.includes(Math.floor(current)) && <span className="sr-only">Saved moment at the playhead</span>}
    </div>
  );
}
