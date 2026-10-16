import type { Quake } from "../data/types";
import type { MarkSubject } from "./MarkCard";
import { SOURCE_NAMES } from "./format";
import { EMSC_CATALOGUE } from "../sources/emsc";
import { listUrl } from "../sources/gdacs";

export function quakeCitation(quake: Quake, link: string): string {
  return (
    quake.readings
      .map((reading) =>
        [
          `${SOURCE_NAMES[reading.source]} · ${reading.id}`,
          `${reading.place} · M ${reading.magnitude} ${reading.scale}`,
          `Origin: ${new Date(reading.time).toISOString()}`,
          `Received: ${new Date(reading.receivedAt).toISOString()}`,
          `Source: ${reading.source === "usgs" ? `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(reading.id)}` : `${EMSC_CATALOGUE}?eventid=${encodeURIComponent(reading.id)}&format=json`}`,
        ].join("\n"),
      )
      .join("\n\n") + `\n\nView: ${link}`
  );
}

export function markCitation(
  found: MarkSubject,
  details: { title: string; note: string; lines: { label: string; value: string }[] },
  link: string,
): string {
  const subject = found.subject;
  const kind = { cyclone: "TC", volcano: "VO", fire: "WF", flood: "FL" }[found.kind];
  const dates =
    found.kind === "volcano"
      ? [["Episode ended", found.subject.endedAt] as const]
      : [
          ["First reported", found.subject.startedAt] as const,
          ["Last reported", found.subject.endedAt] as const,
        ];
  return [
    `${details.title} · ${found.kind} · ${subject.id}`,
    details.note,
    `Provider: ${subject.source ? `${subject.source} via GDACS` : "GDACS"}`,
    ...dates
      .filter(([, time]) => time !== null)
      .map(([label, time]) => `${label}: ${new Date(time!).toISOString()}`),
    ...details.lines
      .filter((line) => line.label !== "Since" && line.label !== "Episode ended")
      .map((line) => `${line.label}: ${line.value}`),
    `Source: ${listUrl(kind)}`,
    `View: ${link}`,
  ].join("\n");
}
