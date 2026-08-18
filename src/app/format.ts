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
