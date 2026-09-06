import type { Quake, Reading, SourceId } from "../data/types";

/* Turning data into words. Each one exists because the obvious formatting would be a small lie. */

/** `M 5.2 (Mww)`. Never a bare number: the two feeds disagree and the scale is why. */
export function magnitude(reading: Reading): string {
  return `M ${reading.magnitude.toFixed(1)}`;
}

/** "2 minutes ago", never "2m 14s": origin time is an estimate, so seconds are precision it lacks. */
export function ago(then: number, now: number, archived = false): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  // Never "just now" on a finished day. The newest row is the one read, so the lie lands there first.
  if (s < 45) return archived ? "at the day's end" : "just now";
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
  return latLon(reading.lon, reading.lat);
}

export function latLon(lon: number, lat: number): string {
  const ns = `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lon).toFixed(2)} ${lon >= 0 ? "E" : "W"}`;
  return `${ns} ${ew}`;
}

/** Depth, or an explicit absence. Zero is a real seabed value and cannot stand in for missing. */
export function depth(reading: Reading): string {
  return Number.isFinite(reading.depthKm) ? `${Math.round(reading.depthKm)} km` : "not given";
}

/** USGS writes "72 km E of Petropavlovsk", EMSC SHOUTS. Case is how a name is set, never what it says. */
export function place(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s(,\-/])([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
}

export const SOURCE_NAMES: Record<SourceId, string> = { usgs: "USGS", emsc: "EMSC" };

/** The coverage the sources brought, not the earliest arrival held. The difference is a demo against a claim. */
export function windowLabel(
  now: number,
  windowMs: number,
  coveredSince: number | null,
  archived = false,
): string {
  if (coveredSince === null) return "nothing yet";
  // An archived day is that day, not "the last 24 hours". Every age is measured from the day's end.
  if (archived) return "the whole day";
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

export function agoShort(then: number, now: number, archived = false): string {
  return ago(then, now, archived)
    .replace("at the day's end", "end")
    .replace(" ago", "")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d");
}

/** Which agencies reported an event, for the panel's header line. */
export function reportedBy(quake: Quake): string {
  return quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" and ");
}

/** A window length in a chip: `24h`, `7d`, `30d`. Same day threshold as the strip's axis. */
export function compactSpan(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`;
}

/** Three states. A feed with no backlog at all is not a feed with a backlog of nothing: say so. */
export function reach(from: number | null, now: number, windowMs: number): string {
  if (from === null) return "no backlog";
  if (from <= now - windowMs) return compactSpan(windowMs);
  return agoShort(from, now);
}

/**
 * Stops `USGS 30d · EMSC 18h` reading as a bug. Null when every agency covers the whole window.
 *
 * Truncated and missing are different facts and get different words.
 */
export function reachNote(
  covered: Record<SourceId, number | null>,
  now: number,
  windowMs: number,
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
    parts.push(
      truncated.length === 1
        ? `${named(truncated)} returns its most recent page whatever the window, so it reaches only as ` +
            `far back as ${agoShort(deepest, now)}.`
        : `${named(truncated)} return their most recent page whatever the window, so they reach only ` +
            `as far back as ${agoShort(deepest, now)}.`,
    );
  }
  if (missing.length > 0) {
    parts.push(`${named(missing)} ${missing.length === 1 ? "has" : "have"} returned no backlog.`);
  }

  const full = ids.filter((id) => !truncated.includes(id) && !missing.includes(id));
  if (full.length > 0) parts.push(`Older events are ${named(full)} alone.`);
  return parts.join(" ");
}

/** Anything over 99.9% prints as "over 99.9%". Rounding to 100% claims the rest is nothing. */
export function energyPercent(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "none";
  const pct = share * 100;
  if (pct > 99.9) return "over 99.9%";
  if (pct >= 99) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/** One distance formatter, not two: a second differing only in rounding is how "500 m" meets "0.5 km". */
export function distanceLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km).toLocaleString("en-GB")} km`;
}

/** The proportion of the window covered, not its duration. A fortieth against a full bar is instant. */
export function reachFraction(from: number | null, now: number, windowMs: number): number {
  if (from === null || windowMs <= 0) return 0;
  const covered = now - from;
  return Math.max(0, Math.min(1, covered / windowMs));
}

/** A feed still being waited for and one that refused are different facts. `reach` alone says neither. */
export function reachWords(from: number | null, failing: boolean, now: number, windowMs: number): string {
  if (from !== null) return reach(from, now, windowMs);
  // One word: the column is 38px and "no answer" wraps, which pushes both coverage rows taller.
  return failing ? "silent" : "waiting";
}

/**
 * Two agencies can only agree where both were looking, so the denominator is the span they share.
 * Against the window's total the same overlap reads as 0.9% instead of 19%.
 */
export function corroborationNote(
  overlap: { events: number; both: number } | null,
  overlapFrom: number | null,
  now: number,
  windowMs: number,
): string | null {
  if (overlap === null || overlapFrom === null || overlap.events === 0) return null;
  const covered = now - overlapFrom;
  // Within a whisker of the whole window: nothing to explain, and the header is already right.
  if (covered >= windowMs * 0.98) return null;
  const pct = Math.round((overlap.both / overlap.events) * 100);
  return (
    `Both feeds only overlap for the last ${compactSpan(covered)}. Inside it, ` +
    `${overlap.both.toLocaleString("en-GB")} of ${overlap.events.toLocaleString("en-GB")} events ` +
    `(${pct}%) were reported by both.`
  );
}

export function auroraNote(peak: number, forecastAt: number, now: number): string {
  const strength = peak >= 40 ? "strong" : peak >= 15 ? "active" : "quiet";
  const age = Math.max(0, Math.round((now - forecastAt) / 60_000));
  const when = age < 1 ? "for this minute" : `forecast ${age} minute${age === 1 ? "" : "s"} ago`;
  return (
    `the green is the aurora. ` +
    `Only where it is dark enough to see it, ${strength} tonight, peaking at ` +
    `${Math.round(peak)}% chance, ${when}.`
  );
}

export function cycloneNote(
  storms: readonly { name: string; peakKmh: number | null }[],
  categoryOf: (kmh: number | null) => string | null,
  archived = false,
): string | null {
  if (storms.length === 0) return null;
  // Tense follows the clock. "Running now" is false on an archived day.
  const count =
    `${storms.length} tropical cyclone${storms.length === 1 ? "" : "s"} ` +
    `${archived ? "that day" : "running"}`;
  const strongest = [...storms].sort((a, b) => (b.peakKmh ?? 0) - (a.peakKmh ?? 0))[0]!;
  const named =
    strongest.peakKmh === null
      ? ""
      : ` Strongest is ${strongest.name} at ${Math.round(strongest.peakKmh)} km/h` +
        `${categoryOf(strongest.peakKmh) ? `, ${categoryOf(strongest.peakKmh)}` : ""} at its peak.`;
  return (
    `the spirals are storms, ${count}. ` +
    `The tail behind each is where it has been, and none of them are on the equator: the spin that ` +
    `starts one is zero there.${named}`
  );
}

/** Lead with the age: GDACS flags no volcano current, and one that looks live and is not would mislead. */
export function volcanoNote(
  count: number,
  newest: number | null,
  now: number,
  archived = false,
): string | null {
  if (count === 0) return null;
  const days = newest === null ? null : Math.max(0, Math.round((now - newest) / 86_400_000));
  // "Today" and "ago" are spoken from now; the archived clock is not now.
  const plural = days === 1 ? "" : "s";
  const when =
    days === null
      ? "Undated"
      : days === 0
        ? `The newest episode ended ${archived ? "that day" : "today"}`
        : `The newest ended ${days} day${plural} ${archived ? "earlier" : "ago"}`;
  return (
    `the triangles are volcanoes, ${count} of them. ` +
    `Each has a logged eruption episode. ` +
    // "this minute" is a claim about now, which is the wrong clock over a picture of a past day.
    `${when}, so none of this ${archived ? "was erupting then" : "is erupting this minute"}. ` +
    `They sit along the same lines the earthquakes do, which is the whole of why either happens.`
  );
}

/** GDACS caps its list at 100 and cannot be paged, so this count is a slice of thousands, not the world's. */
/*
 * A name headed by a common noun takes "the": the Russian Federation, the Philippines. Angola does not.
 * GDACS already capitalises "The Democratic Republic of Congo", so check for one first.
 */
const COMMON_NOUN_HEADS = [
  "federation",
  "republic",
  "kingdom",
  "states",
  "islands",
  "emirates",
  "netherlands",
  "philippines",
  "gambia",
  "bahamas",
  "maldives",
  "comoros",
];

export function theOf(country: string): string {
  // The head only. "Zambia, The Democratic Republic of Congo" is headed by Zambia and takes nothing,
  // even though a Republic appears later in it.
  const head = (country.split(",")[0] ?? "").trim().toLowerCase();
  if (head.startsWith("the ")) return country;
  return COMMON_NOUN_HEADS.some((w) => head.includes(w)) ? `the ${country}` : country;
}

export function wildfireNote(
  fire: { count: number; km2: number; medianDays: number | null; leader: string | null },
  cap: number,
  archived = false,
): string | null {
  if (fire.count === 0) return null;
  const burning =
    fire.medianDays === null
      ? ""
      : `, burning ${fire.medianDays} day${fire.medianDays === 1 ? "" : "s"} at the median`;
  // The cap is a fact about the live feed. The archive is a different upstream with room to spare.
  const floor =
    !archived && fire.count >= cap
      ? ` The feed stops at ${cap} and ${fire.leader === null ? "one country" : theOf(fire.leader)} ` +
        `alone has more than that, so the ` +
        `count is a floor: every mark is real, their number is not the world's.`
      : "";
  return (
    `the flames are forest fires, ${fire.count} of them. ` +
    `${archived ? "They burned that day" : "Burning now"}, ` +
    `${fire.km2.toLocaleString("en-GB")} square kilometres alight${burning}.${floor}`
  );
}

/** GDACS files every flood as severity 0, so nothing ranks them. See ARCHITECTURE.md#srcappformatts. */
export function floodNote(count: number, countries: number, archived = false): string | null {
  if (count === 0) return null;
  const where = countries > 1 ? ` across ${countries} countries` : "";
  return (
    `the waves are floods, ${count} of them${where}. ` +
    `${archived ? "They ran that day" : "Running now"}, and nothing here rates them: every flood in ` +
    `this feed is filed as magnitude zero, so the mark says where and not how bad.`
  );
}

export function farSideNote(
  arcs: readonly number[],
  lengthOf: (arcDeg: number) => number,
  far: { lon: number; lat: number },
): string {
  const widest = Math.max(...arcs.map(lengthOf));
  const first = arcs[0]!;
  const last = arcs[arcs.length - 1]!;
  const km = (v: number): string => `${Math.round(v).toLocaleString("en")} km`;
  return (
    `The arcs are where the front would be at ${arcs.join(", ")} degrees from here. ` +
    `It is widest on the great circle, ${km(widest)} of front, and the ${last}-degree arc is the same ` +
    `length as the ${first} because by then it is closing rather than growing. It closes to the point ` +
    `marked at ${latLon(far.lon, far.lat)}. No time is drawn: the wavefronts above fade at 17 degrees, ` +
    `and the far side is most of an hour away.`
  );
}

/** Say "relative". Each arrow is one plate against the other; read as motion over the mantle it is wrong. */
export function motionNote(motion: { arrows: number; fastest: number; converging: number }): string {
  return (
    `the arrows are how fast the plates are moving, one side relative to the other, sampled every ` +
    `800km. Across a line is opening, into it is closing, along it is sliding. ${motion.converging} of ` +
    `the ${motion.arrows} are closing, and the fastest runs at ${Math.round(motion.fastest)} mm a year, ` +
    `which is a metre every four years.`
  );
}

/** Distance to the nearest plate edge. Under a threshold it says "on it" rather than a false precision. */
export function boundaryNote(km: number | null): string | null {
  if (km === null) return null;
  // Compact, because its only consumer is a field labelled "Boundary": spelling out "from the nearest
  // plate boundary" there said the word twice and wrapped the value onto a second line.
  if (km < 25) return "on it";
  return `${Math.round(km).toLocaleString("en")} km away`;
}

export function quietNote(near: number, total: number, bandKm: number, bandShare: number): string | null {
  const parts = quietParts(near, total, bandShare);
  if (parts === null) return null;
  return (
    `That ${bandKm} km band is ${(bandShare * 100).toFixed(1)}% of the surface, so at least ` +
    `${parts.times.toFixed(1)} times the seismicity per square kilometre.`
  );
}

export function quietParts(
  near: number,
  total: number,
  bandShare: number,
): { percent: number; times: number } | null {
  if (total === 0) return null;
  const share = near / total;
  return { percent: Math.round(share * 100), times: share / bandShare };
}

/** How many deep events are actually present, since the depth encoding needs some to show anything. */
export function depthNote(bands: {
  shallow: number;
  intermediate: number;
  deep: number;
  unknown: number;
  total: number;
}): string | null {
  if (bands.total === 0) return null;
  // Group these: a 30-day window puts "1188 above 70 km" beside a headline reading "1,188".
  const n = (v: number): string => v.toLocaleString("en-GB");
  const parts = [`${n(bands.shallow)} above 70 km`];
  if (bands.intermediate > 0) parts.push(`${n(bands.intermediate)} between 70 and 300`);
  parts.push(`${n(bands.deep)} below 300`);
  if (bands.unknown > 0) parts.push(`${n(bands.unknown)} with no depth given`);
  return (
    `${parts.join(", ")}. Deep events sit inside a descending slab, so a margin only resolves ` +
    `into rings when enough of them land.`
  );
}

/** Two disclosures: it is a transposition, not a recording, and loudness is not energy. */
export function soundNote(above: number): string {
  return (
    `one tone per arrival above M${above.toFixed(1)}, lower for bigger, which is the direction a ` +
    `real rupture goes. It is not a recording: ground motion is below hearing, under about 10 Hz. And ` +
    `loudness is not energy, because three points of magnitude is thirty thousand times as much of it.`
  );
}

/*
 * The first sentence is the whole row when the key is shut. A qualifier in it makes every row two lines.
 */
export function splitNote(note: string): { head: string; rest: string | null } {
  const at = note.search(/\.\s/);
  if (at === -1) return { head: note, rest: null };
  const rest = note.slice(at + 1).trim();
  return { head: note.slice(0, at + 1), rest: rest.length > 0 ? rest : null };
}

/** The hazard layers, which are polled one at a time rather than streamed like the two quake feeds. */
export type HazardLayer = "cyclones" | "volcanoes" | "fires" | "floods" | "aurora";

/** Name the layers that could not be asked, or a dead host reads as a calm planet. */
export function silentFeeds(answered: Record<HazardLayer, boolean>): string | null {
  const names: [HazardLayer, string][] = [
    ["cyclones", "storms"],
    ["fires", "fires"],
    ["floods", "floods"],
    ["volcanoes", "volcanoes"],
    ["aurora", "the aurora"],
  ];
  const missing = names.filter(([key]) => !answered[key]).map(([, label]) => label);
  if (missing.length === 0) return null;
  // All five is one fact about the network, not five facts about layers.
  if (missing.length === names.length) return "No feed answered for any layer, so none are drawn.";
  const listed =
    missing.length === 1
      ? missing[0]!
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]!}`;
  return `No answer for ${listed}: absent here does not mean absent.`;
}
