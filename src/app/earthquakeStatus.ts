import type { Filters, SourceId } from "../data/types";
import type { FeedSnapshot } from "./feed";
import { reachFraction, reachNote, reachWords, SOURCE_NAMES, windowLabel } from "./format";

export function earlierReportsUnavailable(
  snapshot: Pick<FeedSnapshot, "statuses" | "seedFailed">,
  id: SourceId,
) {
  // EMSC's live socket can disconnect while its separate catalogue request is still pending.
  return snapshot.seedFailed[id] === true || (id === "usgs" && snapshot.statuses[id].kind === "failing");
}

export function earthquakeCoverage(
  snapshot: Pick<FeedSnapshot, "archive" | "covered" | "statuses" | "seedFailed">,
  filters: Filters,
  now: number,
) {
  const sources = [...filters.sources];
  const starts = sources.flatMap((id) => {
    const start = snapshot.covered[id];
    return start === null ? [] : [start];
  });
  const from = starts.length ? Math.min(...starts) : null;
  const partial = sources.some((id) => {
    if (snapshot.archive) {
      const answer = snapshot.archive.answered?.[id];
      return snapshot.archive.answered !== undefined && (!answer || answer.truncated);
    }
    const start = snapshot.covered[id];
    return start === null || start > now - filters.windowMs || snapshot.statuses[id].kind === "failing";
  });
  const waiting =
    !snapshot.archive && from === null && sources.some((id) => !earlierReportsUnavailable(snapshot, id));
  const label =
    sources.length === 0
      ? "No earthquake sources selected"
      : snapshot.archive
        ? partial
          ? "Partial source coverage · UTC day"
          : "Full UTC day"
        : from === null
          ? waiting
            ? "Loading report coverage"
            : "Coverage unavailable"
          : `${partial ? "Partial source coverage · " : ""}${windowLabel(now, filters.windowMs, from)}`;
  return { from, partial, waiting, label };
}

export function earthquakeReach(
  snapshot: Pick<FeedSnapshot, "archive" | "covered" | "statuses" | "seedFailed">,
  now: number,
  windowMs: number,
) {
  const reports = (["usgs", "emsc"] as const).map((id) => {
    const from = snapshot.covered[id];
    const unavailable = snapshot.archive
      ? snapshot.archive.answered?.[id] === null
      : earlierReportsUnavailable(snapshot, id);
    return { id, from, unavailable };
  });
  return {
    rows: reports.map(({ id, from, unavailable }) => ({
      id,
      label: SOURCE_NAMES[id],
      fraction: reachFraction(from, now, windowMs),
      words: snapshot.archive?.answered?.[id]?.truncated
        ? "Incomplete"
        : reachWords(from, unavailable, now, windowMs),
    })),
    note: snapshot.archive ? null : reachNote(reports, now, windowMs),
  };
}

export function earthquakeEmpty({
  waiting,
  unavailable,
  reported,
  earlierUnavailable,
  archived,
  partial,
  hasSources,
}: {
  waiting: boolean;
  unavailable: boolean;
  reported: number;
  earlierUnavailable: boolean;
  archived: boolean;
  partial: boolean;
  hasSources: boolean;
}) {
  if (!hasSources)
    return {
      kind: "filtered",
      short: "No sources selected",
      text: "No earthquake sources selected.",
    } as const;
  if (!waiting && reported > 0)
    return {
      kind: "filtered",
      short: "No filter matches",
      text: "No earthquakes match the current filters.",
    } as const;
  if (unavailable)
    return {
      kind: "unavailable",
      short: "Feeds unavailable",
      text: "Earthquake feeds unavailable. Retrying automatically.",
    } as const;
  if (earlierUnavailable)
    return {
      kind: "unavailable",
      short: "Earlier reports unavailable",
      text: "Earlier earthquake reports are unavailable.",
    } as const;
  if (waiting)
    return { kind: "loading", short: "Loading reports…", text: "Loading earthquake reports…" } as const;
  return {
    kind: "empty",
    short: partial ? "No available reports" : "No earthquakes reported",
    text: partial
      ? "No earthquakes in available reports."
      : `No earthquakes reported ${archived ? "on this day" : "in this window"}.`,
  } as const;
}
