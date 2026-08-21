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
  return latLon(reading.lon, reading.lat);
}

/**
 * The same thing for a point that is not an event.
 *
 * Split out for the far-side figure, whose antipode is a position and not a reading. A second hemisphere
 * formatter beside this one is how `distanceLabel` ended up written twice.
 */
export function latLon(lon: number, lat: number): string {
  const ns = `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lon).toFixed(2)} ${lon >= 0 ? "E" : "W"}`;
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

/**
 * A ground distance in words. `412 km`, `1,834 km`, and metres below a kilometre.
 *
 * One of these, not two. The scale bar had its own and the pair measurement was about to add a second
 * that differed only in rounding and a guard, which is how "500 m" and "0.5 km" end up in one app.
 * Separated in thousands because a bar reading `10000 km` is a number nobody parses at a glance.
 */
export function distanceLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km).toLocaleString("en-GB")} km`;
}

/**
 * How much of the window a source's backlog actually covers, as a fraction of it.
 *
 * The words beside this say "24h" and "6h", which is the duration. This is the proportion, and the two
 * are not the same fact: reading "6h" against "30d" and arriving at a fortieth is arithmetic the reader
 * should not have to do, and a fortieth drawn against a full bar is instant.
 *
 * Zero for a source that fetched no backlog, which is a different thing from one that fetched a short
 * one and is drawn as nothing rather than as a sliver.
 */
export function reachFraction(from: number | null, now: number, windowMs: number): number {
  if (from === null || windowMs <= 0) return 0;
  const covered = now - from;
  return Math.max(0, Math.min(1, covered / windowMs));
}

/**
 * What to print beside a feed's bar, across all three states it can be in.
 *
 * A feed that has answered has a reach. One that has not is either still being waited for or has
 * refused, and those are different facts: the first resolves itself and the second does not. Saying
 * "no backlog" for both, which `reach` alone does, would describe a feed that failed as one that
 * simply had nothing, and the whole point of drawing two bars is that it is visible which feed is
 * carrying the window.
 */
export function reachWords(
  from: number | null, failing: boolean, now: number, windowMs: number,
): string {
  if (from !== null) return reach(from, now, windowMs);
  return failing ? "no answer" : "waiting";
}

/**
 * The corroboration rate, stated where it is true rather than left to be inferred.
 *
 * The header prints a bare `both` count and a bare count takes the window's total as its denominator.
 * Two agencies can only agree where both of them were looking, so the honest denominator is the span
 * they share, and at a wide window those two numbers are nothing like each other: 0.9 percent of a
 * 30-day window against 49.5 percent of the 21 hours EMSC reaches, measured against the live feeds.
 *
 * Null when there is nothing to report: no overlap, or an overlap holding nothing. Null also when the
 * overlap is the whole window, because then the header's count already has the right denominator beside
 * it and this would be the same fact printed twice.
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
  return `Both feeds only overlap for the last ${compactSpan(covered)}. Inside it, `
    + `${overlap.both.toLocaleString("en-GB")} of ${overlap.events.toLocaleString("en-GB")} events `
    + `(${pct}%) were reported by both.`;
}

/**
 * What the green wash is, and how much of it there is tonight.
 *
 * The rule this app now holds every new layer to is that none ships without the thing that explains it.
 * The aurora's explanation is already on screen: it appears where the terminator has decided it is dark,
 * because that is the only place an aurora is visible, and the terminator is computed from the real
 * subsolar point rather than styled.
 *
 * The peak is stated because a quiet night is genuinely faint, and a faint wash with nothing saying so is
 * indistinguishable from a layer that failed to load. It is a forecast and says so: NOAA publishes a
 * predicted oval for a stamped minute, not an observation.
 */
export function auroraNote(peak: number, forecastAt: number, now: number): string {
  const strength = peak >= 40 ? "strong" : peak >= 15 ? "active" : "quiet";
  const age = Math.max(0, Math.round((now - forecastAt) / 60_000));
  const when = age < 1 ? "for this minute" : `forecast ${age} minute${age === 1 ? "" : "s"} ago`;
  return `the green is the aurora, only where it is dark enough to see it. `
    + `${strength} tonight, peaking at ${Math.round(peak)}% chance, ${when}.`;
}

/**
 * What the spirals are, and the fact the tracks make visible.
 *
 * The explanation is the track itself: every storm forms in the bands either side of the equator and
 * bends away from it, because the Coriolis force that lets one spin up is zero on the line. A dot could
 * not have said that and a line does not have to.
 *
 * Names the strongest of them by peak wind, from GDACS's number and a scale stated here, because their own
 * label describes a different moment: a storm measured at 259 km/h is filed under "Tropical Storm".
 */
export function cycloneNote(
  storms: readonly { name: string; peakKmh: number | null }[],
  categoryOf: (kmh: number | null) => string | null,
): string | null {
  if (storms.length === 0) return null;
  const count = `${storms.length} tropical cyclone${storms.length === 1 ? "" : "s"} running`;
  const strongest = [...storms].sort((a, b) => (b.peakKmh ?? 0) - (a.peakKmh ?? 0))[0]!;
  const named = strongest.peakKmh === null
    ? ""
    : ` Strongest is ${strongest.name} at ${Math.round(strongest.peakKmh)} km/h`
      + `${categoryOf(strongest.peakKmh) ? `, ${categoryOf(strongest.peakKmh)}` : ""} at its peak.`;
  return `the spirals are storms, trailing where they have been. ${count}, and none of them `
    + `on the equator: the spin that starts one is zero there.${named}`;
}

/**
 * What the triangles are, and the one thing that has to be said out loud about them.
 *
 * Every other layer here is live, and a viewer is entitled to assume this one is too. It is not: GDACS
 * flags none of these current, and the newest episode in the list is usually weeks old. So the sentence
 * leads with the age rather than burying it, because a triangle that looks live and is not would be the
 * app lying quietly.
 *
 * What is left when currency goes is the better fact anyway: they land on the plate boundaries the globe
 * already draws, which is the same argument the earthquakes make from the other side.
 */
export function volcanoNote(count: number, newest: number | null, now: number): string | null {
  if (count === 0) return null;
  const days = newest === null ? null : Math.max(0, Math.round((now - newest) / 86_400_000));
  const when = days === null
    ? "Undated"
    : days === 0
      ? "The newest episode ended today"
      : `The newest ended ${days} day${days === 1 ? "" : "s"} ago`;
  return `the triangles are volcanoes with a logged eruption episode, ${count} of them. `
    + `${when}, so none of this is erupting this minute. They sit along the same lines the `
    + `earthquakes do, which is the whole of why either happens.`;
}

/**
 * What the flames are, and the one caveat that cannot be left out.
 *
 * Every number here is real and the count is not the world's. GDACS caps its list at 100 and cannot be
 * paged past it, and a request for Angola alone comes back with a full hundred, so the global response is a
 * slice of thousands. The geography in it is right - late August is the southern African burning season -
 * but the number of marks is a floor, and a map that showed a hundred fires without saying so would be
 * claiming a census it does not have.
 *
 * The duration is the fact this layer brings that no other mark here can: an earthquake is an instant and
 * a fire is a fortnight.
 */
/*
 * "Russian Federation alone has more than that" is missing a word, and which countries need it is not a
 * judgement call: a name headed by a common noun takes the article and a proper-noun name does not.
 * Angola, Brazil, Australia; the Russian Federation, the Philippines, the United States.
 *
 * GDACS already capitalises "The Democratic Republic of Congo", so the check for one is first.
 */
const COMMON_NOUN_HEADS = [
  "federation", "republic", "kingdom", "states", "islands", "emirates",
  "netherlands", "philippines", "gambia", "bahamas", "maldives", "comoros",
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
): string | null {
  if (fire.count === 0) return null;
  const burning = fire.medianDays === null
    ? ""
    : `, burning ${fire.medianDays} day${fire.medianDays === 1 ? "" : "s"} at the median`;
  const floor = fire.count >= cap
    ? ` The feed stops at ${cap} and ${fire.leader === null ? "one country" : theOf(fire.leader)} `
      + `alone has more than that, so the `
      + `count is a floor: every mark is real, their number is not the world's.`
    : "";
  return `the flames are forest fires burning now, ${fire.count} of them, `
    + `${fire.km2.toLocaleString("en")} square kilometres alight${burning}.${floor}`;
}

/**
 * What the waves are, and what they decline to say.
 *
 * The cap is not in play here: floods spread thin, no more than three to a country, and a single-country
 * request returns ten where the same request for fires returns a hundred. So this count is the count.
 *
 * There is nothing to rank them by. GDACS files every flood in the list as `severity: 0.0`, "Magnitude 0",
 * so the mark says where and refuses to imply how bad - which for a flood is the number a reader most
 * wants and the one nobody keyless has.
 */
export function floodNote(count: number, countries: number): string | null {
  if (count === 0) return null;
  const where = countries > 1 ? ` across ${countries} countries` : "";
  return `the waves are floods running now, ${count} of them${where}. `
    + `Nothing here rates them: every flood in this feed is filed as magnitude zero, so the mark says `
    + `where and not how bad.`;
}

/**
 * The far-side figure, explained where it is drawn.
 *
 * Every number in it is spherical geometry and none of it is a time, which is the point of the last
 * sentence. The live rings fade at 17 degrees of arc and a surface path to the far side is 55 minutes,
 * so a figure that put minutes on these arcs would be claiming the teleseismic path through the mantle
 * that `arrival.ts` already refused by capping arrivals at 700km.
 *
 * The 30-and-150 pair is the whole argument and it is stated as one clause: the same length of front,
 * because by 150 it is closing rather than growing.
 */
export function farSideNote(
  arcs: readonly number[], lengthOf: (arcDeg: number) => number,
  far: { lon: number; lat: number },
): string {
  const widest = Math.max(...arcs.map(lengthOf));
  const first = arcs[0]!;
  const last = arcs[arcs.length - 1]!;
  const km = (v: number): string => `${Math.round(v).toLocaleString("en")} km`;
  return `The arcs are where the front would be at ${arcs.join(", ")} degrees from here. `
    + `It is widest on the great circle, ${km(widest)} of front, and the ${last}-degree arc is the same `
    + `length as the ${first} because by then it is closing rather than growing. It closes to the point `
    + `marked at ${latLon(far.lon, far.lat)}. No time is drawn: the wavefronts above fade at 17 degrees, `
    + `and the far side is most of an hour away.`;
}

/**
 * What the arrows are, and the word without which they mean something else.
 *
 * **Relative.** Each arrow is the plate on one side of that boundary moving with respect to the plate on
 * the other, which is what PB2002 publishes; read as absolute motion over the mantle it would be wrong
 * everywhere. An arrow cannot carry that word, so the sentence has to.
 *
 * The angle is the reading worth pointing out, because it is free and nobody would look for it: across
 * the line means opening, into it means closing, along it means sliding.
 */
export function motionNote(
  motion: { arrows: number; fastest: number; converging: number },
): string {
  return `the arrows are how fast the plates are moving, one side relative to the other, sampled every `
    + `800km. Across a line is opening, into it is closing, along it is sliding. ${motion.converging} of `
    + `the ${motion.arrows} are closing, and the fastest runs at ${Math.round(motion.fastest)} mm a year, `
    + `which is a metre every four years.`;
}

/**
 * Where an event sits relative to the plate edges, for the panel.
 *
 * The distance alone is the whole feature: next to a place name the agency already wrote, a boundary
 * 3,557 km away under Pahala, Hawaii tells the hotspot story to anyone who thinks about it, and the app
 * never has to claim anything about hotspots. Close enough and it says "on it" rather than printing a
 * suspiciously round zero.
 *
 * The bands are stated where they are because the measured median for a real day was 93 km: half of
 * everything lands inside the first band, so a scale that started at 500 km would call almost every
 * earthquake on Earth "near".
 */
export function boundaryNote(km: number | null): string | null {
  if (km === null) return null;
  // Compact, because its only consumer is a field labelled "Boundary": spelling out "from the nearest
  // plate boundary" there said the word twice and wrapped the value onto a second line.
  if (km < 25) return "on it";
  return `${Math.round(km).toLocaleString("en")} km away`;
}

/**
 * The negative space, as the one sentence this data can carry.
 *
 * Not "the cratons are quiet", which is a claim about hundreds of millions of years against a buffer
 * holding at most thirty days. What is left is still the same shape of fact: the events cluster on a small
 * part of the surface, and the ratio says how hard.
 *
 * The concentration is stated as a floor rather than a figure, and that is not hedging. A dense network
 * finds magnitude 2 events under Oklahoma while nobody is listening in the middle of the Pacific, so the
 * catalogue over-counts the interiors, which pushes this ratio **down**. The true concentration is higher
 * than whatever this says.
 */
export function quietNote(
  near: number, total: number, bandKm: number, bandShare: number,
): string | null {
  if (total === 0) return null;
  const share = near / total;
  const times = share / bandShare;
  return `${Math.round(share * 100)}% of them are within ${bandKm} km of a plate boundary, which is `
    + `${(bandShare * 100).toFixed(1)}% of the surface: at least ${times.toFixed(1)} times the `
    + `seismicity per square kilometre, and the rest of the planet had the day off.`;
}

/**
 * What the holes in the markers add up to, for the depth row of the legend.
 *
 * A count rather than a promise. The encoding carves a hole in proportion to depth, and the reading it
 * exists for - a subduction margin resolving into rings inland - needs deep events to be present at all.
 * In a typical 24-hour window one event of seventy-nine is below 300km. So this says how many are there,
 * and a viewer who sees "1 below 300 km" knows not to go looking for a slab today.
 *
 * `unknown` is reported rather than folded into shallow, because a missing depth and a depth of zero are
 * different facts and only one of them is the agency's fault.
 */
export function depthNote(bands: {
  shallow: number; intermediate: number; deep: number; unknown: number; total: number;
}): string | null {
  if (bands.total === 0) return null;
  const parts = [`${bands.shallow} above 70 km`];
  if (bands.intermediate > 0) parts.push(`${bands.intermediate} between 70 and 300`);
  parts.push(`${bands.deep} below 300`);
  if (bands.unknown > 0) parts.push(`${bands.unknown} with no depth given`);
  return `${parts.join(", ")}. Deep events sit inside a descending slab, so a margin only resolves `
    + `into rings when enough of them land.`;
}
