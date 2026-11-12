export function EarthquakeHeadline({
  time,
  loading,
  count,
  coverage,
  moment,
  replaying,
}: {
  time: string;
  loading: string | null;
  count: number;
  coverage: string;
  moment: string | null;
  replaying: boolean;
}): JSX.Element {
  return (
    <div className="titleblock">
      <p className="view-mode">
        Earthquakes · <span className="sr-only">View time </span>
        {time}
      </p>
      <div className="tb-cell tb-wide" data-rail="headline">
        {loading ? (
          <div className="mt-2 max-w-[30ch] text-[14px] leading-snug text-dim">{loading}</div>
        ) : (
          <>
            <div
              data-event-count
              className="mt-1.5 text-[38px] leading-none font-[650] tracking-[-0.015em] tabular-nums"
            >
              {count.toLocaleString("en-GB")}
            </div>
            {moment ? (
              <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                <span className="font-mono text-ink">{moment}</span>
                <span className="text-faint">{replaying ? "Replaying" : "Paused"}</span>
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] text-dim">{coverage}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
