import { clock } from "./format";

export function eventTimestamp(at: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
    timeZone,
  }).format(at);
}

export function EventTime({ at, compact = false }: { at: number; compact?: boolean }): JSX.Element {
  const label = eventTimestamp(at);
  return (
    <time dateTime={new Date(at).toISOString()} title={label}>
      {compact ? clock(at) : label}
    </time>
  );
}
