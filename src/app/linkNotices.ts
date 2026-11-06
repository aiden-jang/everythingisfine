import type { History } from "../sources/history";
import type { FeedSnapshot } from "./feed";
import type { LayerAnswer } from "./feedStatus";
import { earlierReportsUnavailable } from "./earthquakeStatus";
import { SOURCE_NAMES, type HazardLayer } from "./format";

export function sharedEarthquakeNotice(
  event: string | null,
  snapshot: Pick<FeedSnapshot, "archive" | "covered" | "seedFailed" | "statuses">,
  day: string | null,
  busy: boolean,
): string | null {
  if (!event || busy) return null;
  const source = event.startsWith("usgs:") ? "usgs" : "emsc";
  const agency = SOURCE_NAMES[source];
  if (snapshot.archive && day) {
    if (snapshot.archive.answered?.[source] === null)
      return `${agency} archive reports couldn’t be reached for ${day}.`;
    return `Couldn’t find this earthquake in the archive reports for ${day}.`;
  }
  if (snapshot.covered[source] !== null)
    return "Couldn’t find this earthquake in the available live reports.";
  if (earlierReportsUnavailable(snapshot, source))
    return `Earlier earthquake reports from ${agency} are unavailable.`;
  return null;
}

const hazardKinds = {
  cyclone: ["cyclones", "storm"],
  fire: ["fires", "wildfire"],
  flood: ["floods", "flood"],
  volcano: ["volcanoes", "volcano"],
} as const;

export function sharedHazardNotice(
  mark: string | null,
  archived: boolean,
  history: History | null,
  answers: Record<HazardLayer, LayerAnswer>,
): string | null {
  if (!mark) return null;
  const kind = mark.split(":", 1)[0] as keyof typeof hazardKinds;
  const [layer, name] = hazardKinds[kind];
  if (archived) {
    if (!history) return null;
    if (!history.answered) return `Archive reports for this ${name} couldn’t be reached.`;
    return `Couldn’t find this ${name} in the available archive reports.`;
  }
  if (answers[layer] === "pending") return null;
  if (answers[layer] === "failed") return `Live reports for this ${name} couldn’t be reached.`;
  return `Couldn’t find this ${name} in the available live reports.`;
}
