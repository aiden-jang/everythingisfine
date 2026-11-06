import type { SourceId } from "../data/types";
import type { SourceStatus } from "../sources/types";
import { clock, SOURCE_NAMES } from "./format";

interface Props {
  statuses: Record<SourceId, SourceStatus>;
  archiveDay: string | null;
  cursor: number | null;
  staleCursor: boolean;
  earthquakeNotice: string | null;
  hazardNotice: string | null;
}

export function ViewNotices({
  statuses,
  archiveDay,
  cursor,
  staleCursor,
  earthquakeNotice,
  hazardNotice,
}: Props): JSX.Element {
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
              <span className="text-ink">{SOURCE_NAMES[id]}</span> is not answering. Retrying at{" "}
              {clock(status.retryAt)}.
            </div>
          ))}
          <div className="mt-1 text-faint">Previously loaded reports remain visible.</div>
        </div>
      )}
      {staleCursor && (
        <p data-rail="notice" className={notice} role="status">
          {archiveDay
            ? cursor === null
              ? "This link’s time is outside the archived day. Showing the full day."
              : "This link’s time is before the archived day. Showing the start of that day."
            : cursor === null
              ? "This link’s time is outside the live window. Showing the live view."
              : "This link’s time is older than the live window. Showing the start of the window."}
        </p>
      )}
      {[earthquakeNotice, hazardNotice].filter(Boolean).map((message) => (
        <p key={message} data-rail="notice" className={notice} role="status">
          {message}
        </p>
      ))}
    </>
  );
}
