import type { SourceId } from "../data/types";
import type { SourceStatus } from "../sources/types";
import { clock, SOURCE_NAMES } from "./format";

interface Props {
  statuses: Record<SourceId, SourceStatus>;
  archiveDay: string | null;
  cursor: number | null;
  staleCursor: boolean;
  missingEvent: boolean;
}

export function ViewNotices({ statuses, archiveDay, cursor, staleCursor, missingEvent }: Props): JSX.Element {
  const sources = ["usgs", "emsc"] as const;
  const failing = archiveDay
    ? []
    : sources.flatMap((id) => {
        const status = statuses[id];
        return status.kind === "failing" ? [{ id, status }] : [];
      });
  const notice = "border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim";

  return (
    <>
      {failing.length > 0 && (
        <div data-rail="notice" className={notice} role="status">
          {failing.map(({ id, status }) => (
            <div key={id}>
              <span className="text-ink">{SOURCE_NAMES[id]}</span> is not answering: {status.reason}. Retrying
              at {clock(status.retryAt)}.
            </div>
          ))}
          <div className="mt-1 text-faint">The globe keeps what it has.</div>
        </div>
      )}
      {staleCursor && (
        <p data-rail="notice" className={notice} role="status">
          {cursor === null
            ? "The moment in this link is outside the window, so this is the present instead."
            : "The moment in this link is older than the window, so this is the oldest moment the buffer still holds."}
        </p>
      )}
      {missingEvent && (
        <p data-rail="notice" className={notice} role="status">
          {archiveDay
            ? `The available archive readings for ${archiveDay} don’t include this event.`
            : "The event in this link is no longer in the window of available readings."}
        </p>
      )}
    </>
  );
}
