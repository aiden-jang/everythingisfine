import type { Quake, Reading, SourceId } from "../data/types";

/*
 * Turning data into words, under DESIGN.md section 10.
 *
 * Every function here exists because the obvious formatting would have been a small lie.
 */

/** `M 5.2 (Mww)`. Never a bare number: the two feeds disagree and the scale is why. */
export function magnitude(reading: Reading): string {
  return `M ${reading.magnitude.toFixed(1)}`;
}

/**
 * Relative time, rounded honestly.
 *
 * "2 minutes ago", never "2m 14s ago". Origin time is itself an agency's estimate, so second-level
 * precision on top of it is precision the number does not have.
 */
export function ago(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"} ago`;
}

/** 24-hour clock in the viewer's own zone. UTC would be correct and unreadable at a glance. */
export function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** `41.82 N 141.31 E`. Signed decimals read as coordinates; hemispheres read as places. */
export function coordinates(reading: Reading): string {
  const ns = `${Math.abs(reading.lat).toFixed(2)} ${reading.lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(reading.lon).toFixed(2)} ${reading.lon >= 0 ? "E" : "W"}`;
  return `${ns} ${ew}`;
}

/** Depth, or an explicit absence. Zero is a real seabed value and cannot stand in for missing. */
export function depth(reading: Reading): string {
  return Number.isFinite(reading.depthKm) ? `${Math.round(reading.depthKm)} km` : "not given";
}

/**
 * Place names, evened out for display only.
 *
 * USGS writes "72 km E of Petropavlovsk-Kamchatsky, Russia"; EMSC writes "OFF EAST COAST OF
 * KAMCHATKA". Listed together the shouting one looks like an error, and the eye reads the case
 * difference as meaning rather than as two organisations' house styles.
 *
 * Case is not content: this changes how a name is set, never what it says. The detail panel and the
 * screen reader get the same normalised string, so nothing differs between what is seen and what is
 * read aloud. Anything already mixed-case is left exactly as the agency wrote it.
 */
export function place(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s(,\-/])([a-z])/g, (_, lead: string, c: string) =>
    lead + c.toUpperCase());
}

export const SOURCE_NAMES: Record<SourceId, string> = { usgs: "USGS", emsc: "EMSC" };

/**
 * The window's left edge, in words.
 *
 * Reads the coverage the sources brought, not the earliest arrival held. Until coverage reaches the
 * requested window this says when it actually starts instead. DESIGN.md treats the difference as the
 * one between a demo and a claim.
 *
 * The null case is unreachable from the rail, which shows what it is waiting on instead of a label
 * for an absence, and is kept for any caller that has no such alternative.
 */
export function windowLabel(
  now: number, windowMs: number, coveredSince: number | null,
): string {
  if (coveredSince === null) return "nothing yet";
  if (coveredSince <= now - windowMs) {
    const hours = Math.round(windowMs / 3_600_000);
    // "Last 720 hours" is arithmetically fine and nobody reads a month that way.
    if (hours >= 48) {
      const days = Math.round(hours / 24);
      return `last ${days} day${days === 1 ? "" : "s"}`;
    }
    return `last ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `since ${clock(coveredSince)}`;
}

/**
 * The same thing as `ago`, in the space a table column has.
 *
 * Extracted when the rail's largest-event row needed it too. Two copies of a string transform is how
 * "5h" and "21 hours" end up side by side in one panel, each correct on its own.
 */
export function agoShort(then: number, now: number): string {
  return ago(then, now)
    .replace(" ago", "")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d");
}

/** Which agencies reported an event, for the panel's header line. */
export function reportedBy(quake: Quake): string {
  return quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" and ");
}

/**
 * A window length in the space a chip has. `24h`, `7d`, `30d`.
 *
 * Same threshold as the strip's own axis, so 48 hours reads as days in both places rather than as
 * hours in one and days in the other.
 */
export function compactSpan(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`;
}

/**
 * How far back one agency's backlog reaches, for the label under its own button.
 *
 * Three states, and the third is the one that was missing. A source that vouches for the whole window
 * shows the window; one that vouches for less shows how much less; one that has fetched no backlog at
 * all says so rather than showing a zero, because no backlog and a backlog of nothing are different
 * facts and only one of them is the source's fault.
 */
export function reach(from: number | null, now: number, windowMs: number): string {
  if (from === null) return "no backlog";
  if (from <= now - windowMs) return compactSpan(windowMs);
  return agoShort(from, now);
}

/**
 * The sentence that stops `USGS 30d · EMSC 18h` reading as a bug.
 *
 * Null when every agency vouches for the whole window, which is the common case at a day and the
 * reason this is not a permanent line in the rail. Written the same way as the strip's note about
 * unobserved blocks: it appears exactly when the thing it explains is on screen.
 *
 * Truncated and missing are separate clauses, because they are separate facts with separate causes.
 * A source that returned a short page was capped by the endpoint; a source that returned nothing
 * failed, and it has its own notice elsewhere saying so. One sentence covering both would pin the
 * cap on a feed that never got as far as being capped.
 *
 * The mechanism is stated without the row limit in it. The number lives in the source module, and a
 * second copy here is a number that goes stale in the place nobody thinks to check.
 */
export function reachNote(
  covered: Record<SourceId, number | null>, now: number, windowMs: number,
): string | null {
  const ids = Object.keys(covered) as SourceId[];
  const edge = now - windowMs;
  // Before the first seed lands nothing has reached anywhere, and the rail is already saying that it
  // is asking. A note about short backlogs on top of that describes a state nobody is in yet.
  if (ids.every((id) => covered[id] === null)) return null;

  const truncated = ids.filter((id) => covered[id] !== null && covered[id]! > edge);
  const missing = ids.filter((id) => covered[id] === null);
  if (truncated.length === 0 && missing.length === 0) return null;

  const named = (list: SourceId[]): string => list.map((id) => SOURCE_NAMES[id]).join(" and ");
  const parts: string[] = [];

  if (truncated.length > 0) {
    // The furthest back any truncated source got. Naming the shallowest would understate what is held.
    const deepest = Math.min(...truncated.map((id) => covered[id]!));
    parts.push(truncated.length === 1
      ? `${named(truncated)} returns its most recent page whatever the window, so it reaches only as `
        + `far back as ${agoShort(deepest, now)}.`
      : `${named(truncated)} return their most recent page whatever the window, so they reach only `
        + `as far back as ${agoShort(deepest, now)}.`);
  }
  if (missing.length > 0) {
    parts.push(`${named(missing)} ${missing.length === 1 ? "has" : "have"} returned no backlog.`);
  }

  const full = ids.filter((id) => !truncated.includes(id) && !missing.includes(id));
  if (full.length > 0) parts.push(`Older events are ${named(full)} alone.`);
  return parts.join(" ");
}

/**
 * A share of released energy, as a percentage that never rounds to a whole truth it does not have.
 *
 * One large event in a busy month comes out at 99.94 percent, and "100%" would be a different and false
 * claim: the rest of the catalogue is not nothing, it is four thousand events. So anything above 99.9
 * prints as "over 99.9%" rather than rounding up, and the ordinary range keeps one decimal only while it
 * is doing work.
 */
export function energyPercent(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "none";
  const pct = share * 100;
  if (pct > 99.9) return "over 99.9%";
  if (pct >= 99) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}
